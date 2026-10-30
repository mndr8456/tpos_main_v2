// Internal POS transaction primitives only. Never expose these as public HTTP endpoints.
// POS adapter must load sale/lines/customer from persisted database and call functions with
// the SAME active MySQL connection used for checkout. Caller commits AFTER redeem succeeds.
import {evaluateVoucher} from './voucher-evaluation.js';
const problem=(message,status=409)=>Object.assign(new Error(message),{status});
const key=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9:_-]{8,128}$/.test(x))throw problem('INVALID_RESERVATION_KEY',400);return x;};
const ref=x=>{if(typeof x!=='string'||!/^[A-Za-z0-9:_-]{1,128}$/.test(x))throw problem('INVALID_CHECKOUT_REF',400);return x;};
const positive=x=>{if(!Number.isSafeInteger(Number(x))||Number(x)<=0)throw problem('INVALID_ID',400);return Number(x);};
const checkoutTypes=['RETAIL','SINGLE_ORDER','COMBINED_ORDER','SPLIT_ORDER'];
async function lockParent(conn,voucherId){const [[row]]=await conn.execute('SELECT * FROM vouchers WHERE id=? FOR UPDATE',[positive(voucherId)]);if(!row)throw problem('VOUCHER_NOT_FOUND',404);return row;}
async function reservationWithParentLock(conn,reservationId){const [lookup]=await conn.execute('SELECT voucher_id FROM voucher_reservations WHERE id=?',[positive(reservationId)]);if(!lookup.length)throw problem('RESERVATION_NOT_FOUND',404);const voucher=await lockParent(conn,lookup[0].voucher_id);const [[reservation]]=await conn.execute('SELECT * FROM voucher_reservations WHERE id=? FOR UPDATE',[reservationId]);return {voucher,reservation};}
async function log(conn,voucherId,reservationId,actor,type,details){await conn.execute('INSERT INTO voucher_audit_logs(voucher_id,reservation_id,actor_user_id,action_type,next_data) VALUES(?,?,?,?,?)',[voucherId,reservationId,positive(actor),type,JSON.stringify(details)]);}
/** Caller must provide authoritative server-side lines and orderScope from persisted checkout. */
export async function reserveVoucher(conn,{voucherId,reservationKey,checkoutRef,checkoutType,customerRef=null,operatorUserId,lines,orderScope,now}){
 key(reservationKey);ref(checkoutRef);positive(operatorUserId);
 if(!checkoutTypes.includes(checkoutType))throw problem('INVALID_CHECKOUT_TYPE',400);
 if(customerRef!==null)ref(customerRef);
 if(!Array.isArray(lines))throw problem('SERVER_CHECKOUT_LINES_REQUIRED',400);
 const voucher=await lockParent(conn,voucherId);
 const [[existing]]=await conn.execute('SELECT * FROM voucher_reservations WHERE reservation_key=? FOR UPDATE',[reservationKey]);
 if(existing){
  if(String(existing.voucher_id)!==String(voucherId)||existing.checkout_ref!==checkoutRef||existing.checkout_type!==checkoutType||(existing.customer_ref??null)!==customerRef)throw problem('RESERVATION_KEY_REUSED');
  if(existing.status!=='RESERVED')throw problem('RESERVATION_ALREADY_FINALIZED');
  return {reservationId:String(existing.id),status:'RESERVED',discountAmount:String(existing.discount_amount),reused:true};
 }
 const [counts]=await conn.execute("SELECT status,customer_ref,COUNT(*) AS count FROM voucher_reservations WHERE voucher_id=? AND status IN ('RESERVED','REDEEMED') GROUP BY status,customer_ref",[voucherId]);
 let usedCount=0,customerUsedCount=0;
 for(const r of counts){usedCount+=Number(r.count);if(customerRef!==null&&r.customer_ref===customerRef)customerUsedCount+=Number(r.count);}
 const [targetRows]=await conn.execute('SELECT product_id,category_id FROM voucher_targets WHERE voucher_id=?',[voucherId]);
 const targetIds=targetRows.map(x=>String(x.product_id??x.category_id));
 const result=evaluateVoucher(voucher,{lines,orderScope,now,customerRef,usedCount,customerUsedCount,targetIds});
 if(!result.eligible)throw problem(`VOUCHER_${result.reason}`);
 const [saved]=await conn.execute("INSERT INTO voucher_reservations(voucher_id,reservation_key,checkout_ref,customer_ref,checkout_type,eligible_subtotal,discount_amount,created_by) VALUES (?,?,?,?,?,?,?,?)",[voucherId,reservationKey,checkoutRef,customerRef,checkoutType,result.eligibleSubtotal,result.discountAmount,operatorUserId]);
 await log(conn,voucherId,saved.insertId,operatorUserId,'VOUCHER_RESERVED',{checkoutRef,discountAmount:result.discountAmount});
 return {reservationId:String(saved.insertId),status:'RESERVED',discountAmount:result.discountAmount,reused:false};
}
/** verifyPersistedSale MUST independently check committed sale linkage, sale ownership,
 * amount and payment inside this same transaction; return true only if all match. */
export async function redeemVoucher(conn,{reservationId,saleRef,operatorUserId,verifyPersistedSale}){
 ref(saleRef);positive(operatorUserId);
 if(typeof verifyPersistedSale!=='function')throw problem('POS_SALE_VERIFICATION_REQUIRED',500);
 const {voucher,reservation}=await reservationWithParentLock(conn,reservationId);
 if(reservation.status!=='RESERVED'||reservation.sale_ref!==null)throw problem('RESERVATION_NOT_AVAILABLE');
 const valid=await verifyPersistedSale(conn,{saleRef,checkoutRef:reservation.checkout_ref,discountAmount:String(reservation.discount_amount),reservation});
 if(valid!==true)throw problem('POS_SALE_NOT_VERIFIED');
 const [changed]=await conn.execute("UPDATE voucher_reservations SET status='REDEEMED',sale_ref=?,redeemed_at=UTC_TIMESTAMP(6) WHERE id=? AND status='RESERVED' AND sale_ref IS NULL",[saleRef,reservationId]);
 if(changed.affectedRows!==1)throw problem('RESERVATION_CONFLICT');
 await log(conn,voucher.id,reservationId,operatorUserId,'VOUCHER_REDEEMED',{saleRef});
 return {reservationId:String(reservationId),status:'REDEEMED',saleRef};
}
/** Release only after verifying persisted checkout is cancelled/failed and unpaid. */
export async function releaseVoucher(conn,{reservationId,operatorUserId,reason,verifyUnpaidCheckout}){
 positive(operatorUserId);
 if(typeof reason!=='string'||!reason.trim()||reason.length>255)throw problem('INVALID_RELEASE_REASON',400);
 if(typeof verifyUnpaidCheckout!=='function')throw problem('POS_UNPAID_VERIFICATION_REQUIRED',500);
 const {voucher,reservation}=await reservationWithParentLock(conn,reservationId);
 if(reservation.status!=='RESERVED'||reservation.sale_ref!==null)throw problem('RESERVATION_NOT_RELEASABLE');
 const valid=await verifyUnpaidCheckout(conn,{checkoutRef:reservation.checkout_ref,reservation});
 if(valid!==true)throw problem('POS_CHECKOUT_NOT_UNPAID');
 const [changed]=await conn.execute("UPDATE voucher_reservations SET status='RELEASED',released_at=UTC_TIMESTAMP(6),release_reason=? WHERE id=? AND status='RESERVED' AND sale_ref IS NULL",[reason.trim(),reservationId]);
 if(changed.affectedRows!==1)throw problem('RESERVATION_CONFLICT');
 await log(conn,voucher.id,reservationId,operatorUserId,'VOUCHER_RELEASED',{reason:reason.trim()});
 return {reservationId:String(reservationId),status:'RELEASED'};
}
