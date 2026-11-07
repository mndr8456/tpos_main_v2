// Customer Display R1.5: a POS-committed state is projected to a paired monitor.
// This is NOT part of the financial transaction. Failure here never changes the
// POS HTTP result, a sale, stock, an accounting journal or Kitchen Display.
// Unlike browser-only publishing, it survives POS reloads and React state races.
import {calculateDraftQuote} from './pos-drafts.js';
import {totalDraftLines} from './pos-money.js';

const numericId=value=>/^[1-9][0-9]{0,14}$/.test(String(value||''))?String(value):null;
const parseJson=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const canProject=req=>Boolean(req.auth?.pool&&req.auth?.user?.id&&req.auth.user.permissions?.includes('customer_display.publish'));

async function findDraftId(req,kind){
 if(kind==='create'){
  const branchId=numericId(req.body?.branchId);
  const requestKey=req.body?.requestKey;
  if(!branchId||typeof requestKey!=='string')return null;
  const [[draft]]=await req.auth.pool.execute('SELECT id FROM pos_drafts WHERE branch_id=? AND cashier_user_id=? AND request_key=? LIMIT 1',[branchId,req.auth.user.id,requestKey]);
  return draft?.id||null;
 }
 return numericId(req.params?.id);
}

export async function projectCustomerDisplayCart(req,draftId){
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[draft]]=await conn.execute(`SELECT d.id,d.branch_id,d.cashier_user_id,d.status,d.version,d.order_scope,t.table_number
   FROM pos_drafts d LEFT JOIN restaurant_tables t ON t.id=d.table_id
   WHERE d.id=? AND d.cashier_user_id=? LIMIT 1`,[draftId,req.auth.user.id]);
  if(!draft){await conn.commit();return;}
  const [[session]]=await conn.execute(`SELECT id,draft_id,mode,attempt_id,snapshot FROM customer_display_sessions
   WHERE branch_id=? AND cashier_user_id=? AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE`,[draft.branch_id,req.auth.user.id]);
  if(!session){await conn.commit();return;}
  if(draft.status==='DISCARDED'){
   if(String(session.draft_id)===String(draft.id)&&!parseJson(session.snapshot)?.presentation){
    await conn.execute("UPDATE customer_display_sessions SET draft_id=NULL,mode='ORDER',attempt_id=NULL,snapshot=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[session.id]);
   }
   await conn.commit();return;
  }
  if(!['DRAFT','HELD'].includes(draft.status)){await conn.commit();return;}
  // If another cart was selected after this event, do not replace it with a
  // delayed update from an older request. Its current version is authoritative.
  const old=parseJson(session.snapshot);
  if(String(session.draft_id)===String(draft.id)&&Number(old?.version)>Number(draft.version)){
   await conn.commit();return;
  }
  const [rawLines]=await conn.execute('SELECT product_name,quantity,unit_price FROM pos_draft_lines WHERE draft_id=? ORDER BY id',[draft.id]);
  if(rawLines.length===0){await conn.commit();return;}
  const quote=await calculateDraftQuote(conn,req,draft.id,{
   discountCode:String(req.body?.discountCode||'').trim().toUpperCase(),
   voucherCode:String(req.body?.voucherCode||'').trim().toUpperCase()
  });
  const exactLines=totalDraftLines(rawLines).lines;
  const snapshot={draftId:String(draft.id),version:Number(draft.version),
   lines:exactLines.map(l=>({name:String(l.product_name).slice(0,220),quantity:String(l.quantity),unitPrice:String(l.unitPrice),lineTotal:String(l.lineTotal)})),
   total:String(quote.bill.total),bill:{subtotal:String(quote.bill.subtotalBeforeTax),discount:String(quote.bill.discount),voucher:String(quote.bill.voucher),salesTax:String(quote.bill.salesTax),serviceTax:String(quote.bill.serviceTax),serviceCharge:String(quote.bill.serviceCharge),roundingAdjustmentSen:Number(quote.bill.roundingAdjustmentSen)},
   orderScope:draft.order_scope,tableNumber:draft.table_number||null};
  // Never roll a payment screen back to ORDER because a prior cart/quote
  // request finished late. Switching between orders happens only after a
  // successful cashier action on the new cart.
  const keepPayment=String(session.draft_id)===String(draft.id)&&['CASH','QR','MANUAL'].includes(session.mode);
  await conn.execute('UPDATE customer_display_sessions SET draft_id=?,mode=?,attempt_id=?,snapshot=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',
   [draft.id,keepPayment?session.mode:'ORDER',keepPayment?session.attempt_id:null,JSON.stringify(snapshot),session.id]);
  await conn.commit();
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function projectAttempt(req,draftId){
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[draft]]=await conn.execute("SELECT id,branch_id FROM pos_drafts WHERE id=? AND cashier_user_id=? AND status='DRAFT' LIMIT 1",[draftId,req.auth.user.id]);
  if(!draft){await conn.commit();return;}
  const [[session]]=await conn.execute('SELECT id,draft_id FROM customer_display_sessions WHERE branch_id=? AND cashier_user_id=? AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE',[draft.branch_id,req.auth.user.id]);
  if(!session){await conn.commit();return;}
  // Cashier's real pending attempt, not a client-selected QR value.
  const [[attempt]]=await conn.execute("SELECT id,method_code FROM pos_payment_attempts WHERE draft_id=? AND branch_id=? AND cashier_user_id=? AND status='PENDING' ORDER BY id DESC LIMIT 1",[draft.id,draft.branch_id,req.auth.user.id]);
  if(!attempt){await conn.commit();return;}
  const mode=['DUITNOW_QR','EWALLET'].includes(attempt.method_code)?'QR':'MANUAL';
  // The caller projects the authoritative cart first. If an order could not
  // be selected, do not show a QR for the wrong customer's draft.
  if(String(session.draft_id)!==String(draft.id)){
   await conn.commit();return;
  }
  await conn.execute('UPDATE customer_display_sessions SET mode=?,attempt_id=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[mode,attempt.id,session.id]);
  await conn.commit();
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

async function projectSale(req,draftId){
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  // A posted sale is the ONLY acceptable source for success/change. Neither
  // a reference, pending QR attempt nor a browser event can produce success.
  const [[sale]]=await conn.execute(`SELECT id,branch_id,payment_method FROM pos_sales
   WHERE draft_id=? AND cashier_user_id=? ORDER BY id DESC LIMIT 1`,[draftId,req.auth.user.id]);
  if(!sale){await conn.commit();return;}
  const [[session]]=await conn.execute(`SELECT id,draft_id,snapshot FROM customer_display_sessions
   WHERE branch_id=? AND cashier_user_id=? AND expires_at>UTC_TIMESTAMP(6) FOR UPDATE`,[sale.branch_id,req.auth.user.id]);
  if(!session){await conn.commit();return;}
  const old=parseJson(session.snapshot)||{};
  if(old.presentation?.saleId===String(sale.id)){
   await conn.commit();return; // idempotent, no reset of OWNER timers
  }
  if(session.draft_id&&String(session.draft_id)!==String(draftId)){
   const [[current]]=await conn.execute('SELECT status FROM pos_drafts WHERE id=? AND cashier_user_id=?',[session.draft_id,req.auth.user.id]);
   if(current?.status==='DRAFT'){await conn.commit();return;}
  }
  const snapshot={...old,presentation:{saleId:String(sale.id),receiptOpen:true,remainingChangeSeconds:0}};
  await conn.execute("UPDATE customer_display_sessions SET draft_id=?,mode='ORDER',attempt_id=NULL,snapshot=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[draftId,JSON.stringify(snapshot),session.id]);
  await conn.commit();
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}

// No new network route or cookie. Attach only to already-authenticated POS
// handlers; run AFTER their successful response/transaction has committed.
export function customerDisplayAfterPos(kind){
 return (req,res,next)=>{
  res.once('finish',()=>{
   if(res.statusCode<200||res.statusCode>=300||!canProject(req))return;
   void Promise.resolve().then(async()=>{
    const draftId=await findDraftId(req,kind);
    if(!draftId)return;
    if(kind==='sale')await projectSale(req,draftId);
    else if(kind==='attempt'){await projectCustomerDisplayCart(req,draftId);await projectAttempt(req,draftId);}
    else await projectCustomerDisplayCart(req,draftId);
   }).catch(error=>{
    // Internal operational diagnostic only; no customer tokens or secrets.
    process.stderr.write(`[customer-display-pos-events] ${String(error?.code||error?.message||'SYNC_FAILED').slice(0,90)}\n`);
   });
  });
  next();
 };
}
