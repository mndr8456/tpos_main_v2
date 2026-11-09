// POS Reduction Settlement R1. This module performs REAL tenant-local settlement only
// inside the checkout's existing InnoDB transaction. Never call from quote/preview.
import {reserveVoucher,redeemVoucher,releaseVoucher} from './voucher-pos.js';
import {parseSen,fmtSen} from './cash-shift-money.js';
const fail=code=>{throw Object.assign(new Error(code),{status:409});};
export const normalizedCodes=({discountCode='',voucherCode=''})=>({discountCode:String(discountCode).trim().toUpperCase(),voucherCode:String(voucherCode).trim().toUpperCase()});
export function assertReduction(quote,{discountCode,voucherCode}){
 if(discountCode&&voucherCode)fail('POS_STACKING_POLICY_NOT_APPROVED');
 if(discountCode&&(!quote.discount?.eligible||parseSen(quote.bill.discount)<=0n))fail('POS_DISCOUNT_NOT_ELIGIBLE');
 if(voucherCode&&(!quote.voucher?.eligible||parseSen(quote.bill.voucher)<=0n))fail('POS_VOUCHER_NOT_ELIGIBLE');
 if(!discountCode&&parseSen(quote.bill.discount)!==0n)fail('POS_UNEXPECTED_DISCOUNT');
 if(!voucherCode&&parseSen(quote.bill.voucher)!==0n)fail('POS_UNEXPECTED_VOUCHER');
}
export async function lockReductionMaster(conn,{discountCode,voucherCode},{excludeAttemptId=null}={}){
 if(discountCode&&voucherCode)fail('POS_STACKING_POLICY_NOT_APPROVED');
 if(discountCode){
  const [[row]]=await conn.execute('SELECT id,usage_count,usage_limit FROM discounts WHERE discount_code=? AND is_deleted=0 FOR UPDATE',[discountCode]);
  if(!row)fail('POS_DISCOUNT_NOT_FOUND');
  if(row.usage_limit!==null&&Number(row.usage_count)>=Number(row.usage_limit))fail('POS_DISCOUNT_USAGE_LIMIT_REACHED');
  if(row.usage_limit!==null){
   const [[installed]]=await conn.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pos_payment_attempt_reductions'");
   if(Number(installed?.n)===1){
    const sql=excludeAttemptId?"SELECT COUNT(*) AS n FROM pos_payment_attempt_reductions WHERE discount_id=? AND status='RESERVED' AND attempt_id<>?":"SELECT COUNT(*) AS n FROM pos_payment_attempt_reductions WHERE discount_id=? AND status='RESERVED'";
    const [[pending]]=await conn.execute(sql,excludeAttemptId?[row.id,excludeAttemptId]:[row.id]);
    if(Number(row.usage_count)+Number(pending.n)>=Number(row.usage_limit))fail('POS_DISCOUNT_ALL_RESERVED');
   }
  }
  return {discountId:String(row.id),usageCount:Number(row.usage_count),usageLimit:row.usage_limit===null?null:Number(row.usage_limit)};
 }
 if(voucherCode){
  const [[row]]=await conn.execute('SELECT id FROM vouchers WHERE voucher_code=? AND is_deleted=0 FOR UPDATE',[voucherCode]);
  if(!row)fail('POS_VOUCHER_NOT_FOUND');
  return {voucherId:String(row.id)};
 }
 return {};
}
export async function reserveCheckoutVoucher(conn,{master,requestKey,draft,saleLines,quote,userId,now}){
 if(!master.voucherId)return null;
 const result=await reserveVoucher(conn,{
  voucherId:master.voucherId,reservationKey:`POS_${requestKey}`,checkoutRef:`POS_DRAFT_${draft.id}`,
  checkoutType:draft.order_scope==='DINE_IN'?'SINGLE_ORDER':'RETAIL',operatorUserId:userId,customerRef:null,
  lines:saleLines.map(line=>({productId:String(line.product_id),categoryId:String(line.category_id),subtotal:String(line.lineTotal),active:true})),
  orderScope:draft.order_scope,now
 });
 if(parseSen(result.discountAmount)!==parseSen(quote.bill.voucher))fail('POS_VOUCHER_AMOUNT_CHANGED');
 return result.reservationId;
}
export async function persistSaleReduction(conn,{saleId,branchId,master,reservationId,quote,userId}){
 const discount=parseSen(quote.bill.discount),voucher=parseSen(quote.bill.voucher);
 if(!discount&&!voucher)return;
 if(discount&&(!master.discountId||voucher||reservationId))fail('POS_REDUCTION_INVALID_DISCOUNT');
 if(voucher&&(!master.voucherId||!reservationId||discount))fail('POS_REDUCTION_INVALID_VOUCHER');
 await conn.execute('INSERT INTO pos_sale_reductions(sale_id,branch_id,discount_id,voucher_id,voucher_reservation_id,discount_amount,voucher_amount,created_by) VALUES(?,?,?,?,?,?,?,?)',
  [saleId,branchId,master.discountId||null,master.voucherId||null,reservationId||null,fmtSen(discount),fmtSen(voucher),userId]);
 if(discount){
  const [changed]=await conn.execute('UPDATE discounts SET usage_count=usage_count+1 WHERE id=? AND (usage_limit IS NULL OR usage_count < usage_limit)',[master.discountId]);
  if(changed.affectedRows!==1)fail('POS_DISCOUNT_USAGE_LIMIT_REACHED');
 }
 if(voucher){
  await redeemVoucher(conn,{reservationId,saleRef:`POS_SALE_${saleId}`,operatorUserId:userId,
   verifyPersistedSale:async(c,{checkoutRef,discountAmount})=>{
    if(checkoutRef!==`POS_DRAFT_${String((await c.execute('SELECT draft_id FROM pos_sales WHERE id=? AND status=\'PAID\'',[saleId]))[0][0]?.draft_id)}`)return false;
    const [[linked]]=await c.execute('SELECT s.id,s.status,r.voucher_amount,r.voucher_reservation_id FROM pos_sales s JOIN pos_sale_reductions r ON r.sale_id=s.id WHERE s.id=?',[saleId]);
    return Boolean(linked&&linked.status==='PAID'&&String(linked.voucher_reservation_id)===String(reservationId)&&parseSen(linked.voucher_amount)===parseSen(discountAmount));
   }});
 }
}

export async function persistPendingReduction(conn,{attemptId,master,reservationId,quote}){
 const discount=parseSen(quote.bill.discount),voucher=parseSen(quote.bill.voucher);
 if(!discount&&!voucher)return;
 if(discount){
  const [[used]]=await conn.execute("SELECT COUNT(*) AS n FROM pos_payment_attempt_reductions WHERE discount_id=? AND status='RESERVED'",[master.discountId]);
  if(master.usageLimit!==null&&master.usageCount+Number(used.n)>=master.usageLimit)fail('POS_DISCOUNT_ALL_RESERVED');
 }
 await conn.execute('INSERT INTO pos_payment_attempt_reductions(attempt_id,discount_id,voucher_id,voucher_reservation_id,discount_amount,voucher_amount) VALUES(?,?,?,?,?,?)',
  [attemptId,master.discountId||null,master.voucherId||null,reservationId||null,fmtSen(discount),fmtSen(voucher)]);
}
export async function getPendingReduction(conn,attemptId){
 const [[installed]]=await conn.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pos_payment_attempt_reductions'");
 if(Number(installed?.n)!==1)return null;
 const [[row]]=await conn.execute(`SELECT r.*,d.discount_code,v.voucher_code
 FROM pos_payment_attempt_reductions r LEFT JOIN discounts d ON d.id=r.discount_id
 LEFT JOIN vouchers v ON v.id=r.voucher_id WHERE r.attempt_id=? FOR UPDATE`,[attemptId]);
 return row||null;
}
export async function cancelPendingReduction(conn,{attemptId,userId,attempt}){
 const row=await getPendingReduction(conn,attemptId);
 if(!row)return;
 if(row.status!=='RESERVED')fail('POS_PAYMENT_REDUCTION_ALREADY_FINAL');
 if(row.voucher_reservation_id){
  await releaseVoucher(conn,{reservationId:row.voucher_reservation_id,operatorUserId:userId,reason:'Manual payment attempt cancelled before verified payment',
   verifyUnpaidCheckout:async()=>{
    const [[state]]=await conn.execute('SELECT status,sale_id,verified_at FROM pos_payment_attempts WHERE id=? FOR UPDATE',[attemptId]);
    return state?.status==='CANCELLED'&&state.sale_id===null&&state.verified_at===null;
   }});
 }
 const [changed]=await conn.execute("UPDATE pos_payment_attempt_reductions SET status='RELEASED' WHERE attempt_id=? AND status='RESERVED'",[attemptId]);
 if(changed.affectedRows!==1)fail('POS_PAYMENT_REDUCTION_CONFLICT');
}
export async function completePendingReduction(conn,attemptId){
 const row=await getPendingReduction(conn,attemptId);
 if(!row)return null;
 if(row.status!=='RESERVED')fail('POS_PAYMENT_REDUCTION_ALREADY_FINAL');
 return row;
}
export async function finalizePendingReduction(conn,attemptId){
 const [changed]=await conn.execute("UPDATE pos_payment_attempt_reductions SET status='REDEEMED' WHERE attempt_id=? AND status='RESERVED'",[attemptId]);
 if(changed.affectedRows!==1)fail('POS_PAYMENT_REDUCTION_CONFLICT');
}
