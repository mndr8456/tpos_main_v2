import {createHash,randomBytes} from 'node:crypto';

export const PAIR_TTL_HOURS=12;
export const moneyText=value=>/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(String(value))?Number(value).toFixed(2):null;
export const hashDisplayToken=token=>createHash('sha256').update(token).digest('hex');
export const makeDisplayToken=tenantId=>`${tenantId}.${randomBytes(32).toString('base64url')}`;
export const validDisplayToken=token=>typeof token==='string'&&/^[1-9]\d{0,14}\.[A-Za-z0-9_-]{43}$/.test(token);
export const ownerRole=req=>req.auth?.user?.role_code==='OWNER'&&req.auth.user.permissions.includes('customer_display.manage');
export const cashierRole=req=>['OWNER','ADMIN','CASHIER'].includes(req.auth?.user?.role_code)&&req.auth.user.permissions.includes('pos.view');
export const canUseBranch=(req,branchId)=>['OWNER','ADMIN'].includes(req.auth.user.role_code)||req.auth.user.branchIds.includes(String(branchId));
export function displayPaymentState({sale,elapsedSeconds=0,mode='ORDER',draftStatus='DRAFT',attempt=null,cashSeconds=5,successSeconds=12}){
 if(sale){
  const seconds=Math.max(0,Number(elapsedSeconds)||0);
  if(seconds>=Number(cashSeconds)+Number(successSeconds))return 'IDLE';
  return sale.payment_method==='CASH'&&seconds<Number(cashSeconds)?'CASH_CHANGE':'SUCCESS';
 }
 if(draftStatus!=='DRAFT')return 'IDLE';
 if(mode==='QR'&&attempt?.status==='PENDING'&&['DUITNOW_QR','EWALLET'].includes(attempt.method_code))return 'QR_PENDING';
 if(mode==='MANUAL'&&attempt?.status==='PENDING')return 'MANUAL_PENDING';
 if(mode==='CASH')return 'CASH_PENDING';
 return 'ORDER';
}
// R1.2: The receipt display stays visible while the cashier's paid receipt is
// open (bounded to 90 seconds); closing the receipt starts the Owner-configured
// remaining change + Thank You timers. Never infer payment from a client event.
export function displayPresentationState({sale,elapsedSeconds=0,mode='ORDER',draftStatus='DRAFT',attempt=null,cashSeconds=5,successSeconds=12,presentation=null,presentationElapsedSeconds=0}){
 const fallback=displayPaymentState({sale,elapsedSeconds,mode,draftStatus,attempt,cashSeconds,successSeconds});
 if(!sale||!presentation||String(presentation.saleId)!==String(sale.id))return fallback;
 const age=Math.max(0,Number(presentationElapsedSeconds)||0);
 if(presentation.receiptOpen===false){
  const remaining=sale.payment_method==='CASH'?Math.max(0,Number(presentation.remainingChangeSeconds)||0):0;
  if(age<remaining)return 'CASH_CHANGE';
  return age<remaining+Number(successSeconds)?'SUCCESS':'IDLE';
 }
 if(presentation.receiptOpen!==true)return fallback;
 if(age>=90)return 'IDLE';
 return sale.payment_method==='CASH'&&age<Number(cashSeconds)?'CASH_CHANGE':'SUCCESS';
}
export function validatePromotionalMedia(mime,base64){
 const video=mime==='video/mp4';
 if(!['image/png','image/jpeg','image/webp','video/mp4'].includes(mime))throw Error('CD_MEDIA_TYPE_UNSUPPORTED');
 const max=video?12*1024*1024:3*1024*1024;
 if(typeof base64!=='string'||base64.length>Math.ceil(max*4/3)+32||!/^[-A-Za-z0-9+/=]+$/.test(base64))throw Error('CD_MEDIA_TOO_LARGE');
 const bytes=Buffer.from(base64,'base64');
 if(!bytes.length||bytes.length>max)throw Error('CD_MEDIA_TOO_LARGE');
 const png=bytes.length>8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 const mp4=bytes.length>12&&bytes.toString('ascii',4,8)==='ftyp';
 if(!(mime==='image/png'&&png||mime==='image/jpeg'&&jpeg||mime==='image/webp'&&webp||video&&mp4))throw Error('CD_MEDIA_SIGNATURE_INVALID');
 return bytes;
}
