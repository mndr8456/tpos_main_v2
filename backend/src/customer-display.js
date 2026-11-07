// Customer-facing monitor: read-only presentation of the tenant's real POS ledger.
// No sale/payment/stock/accounting writes. A customer never receives session cookies,
// cashier names, evidence images, payment references or merchant credentials.
import {z} from 'zod';
import {centralPool,tenantPool} from './database.js';
import {calculateDraftQuote} from './pos-drafts.js';
import {totalDraftLines} from './pos-money.js';
import {projectCustomerDisplayCart} from './customer-display-pos-events.js';
import {hashDisplayToken,makeDisplayToken,validDisplayToken,ownerRole,cashierRole,canUseBranch,displayPaymentState,displayPresentationState,validatePromotionalMedia} from './customer-display-rules.js';
const failure=(code,status=409)=>Object.assign(new Error(code),{status});
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const bodyPair=z.object({branchId:id}).strict();
const bodyPublish=z.object({branchId:id,draftId:id.nullable(),discountCode:z.string().trim().max(50).default(''),voucherCode:z.string().trim().max(100).default('')}).strict();
const bodyMode=z.object({branchId:id,draftId:id,mode:z.enum(['ORDER','CASH','QR','MANUAL']),attemptId:id.optional()}).strict();
const bodySalePresentation=z.object({branchId:id,draftId:id,saleId:id,receiptOpen:z.boolean()}).strict();
const bodyToken=z.object({token:z.string().refine(validDisplayToken)}).strict();
const ownerSettings=z.object({welcomeMessage:z.string().trim().min(1).max(180),successEnglish:z.string().trim().min(1).max(240),successMalay:z.string().trim().min(1).max(240),mediaIntervalSeconds:z.number().int().min(5).max(60),cashChangeSeconds:z.number().int().min(3).max(15),successSeconds:z.number().int().min(5).max(45),promotionsEnabled:z.boolean()}).strict();
const mediaCreate=z.object({title:z.string().trim().min(1).max(120),mimeType:z.enum(['image/png','image/jpeg','image/webp','video/mp4']),base64:z.string()}).strict();
const mediaEdit=z.object({title:z.string().trim().min(1).max(120),sortOrder:z.number().int().min(0).max(999),active:z.boolean()}).strict();
const permitted=(req,code)=>req.auth.user.permissions.includes(code);
function requireOwner(req){if(!ownerRole(req))throw failure('CD_OWNER_ONLY',403);}
function requireCashier(req,permission,branchId){
 if(!cashierRole(req)||!permitted(req,permission))throw failure('CD_CASHIER_PERMISSION_REQUIRED',403);
 if(!canUseBranch(req,branchId))throw failure('CD_BRANCH_DENIED',403);
}
async function audit(conn,req,type,details){await conn.execute('INSERT INTO customer_display_audit(actor_user_id,event_type,details) VALUES(?,?,?)',[req.auth.user.id,type,JSON.stringify(details)]);}
export async function customerDisplaySettings(req,res){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)||!permitted(req,'customer_display.view'))throw failure('CD_SETTINGS_FORBIDDEN',403);
 const [[settings]]=await req.auth.pool.execute('SELECT * FROM customer_display_settings WHERE id=1');
 const [media]=await req.auth.pool.execute('SELECT id,title,media_type,mime_type,sort_order,is_active,created_at FROM customer_display_media ORDER BY sort_order,id');
 return res.set('Cache-Control','no-store').json({settings:{welcomeMessage:settings.welcome_message,successEnglish:settings.success_english,successMalay:settings.success_malay,mediaIntervalSeconds:Number(settings.media_interval_seconds),cashChangeSeconds:Number(settings.cash_change_seconds),successSeconds:Number(settings.success_seconds),promotionsEnabled:!!settings.promotions_enabled},media:media.map(m=>({...m,id:String(m.id)}))});
}
export async function updateCustomerDisplaySettings(req,res){
 requireOwner(req);const data=ownerSettings.parse(req.body);const conn=await req.auth.pool.getConnection();
 try{await conn.beginTransaction();
  await conn.execute('UPDATE customer_display_settings SET welcome_message=?,success_english=?,success_malay=?,media_interval_seconds=?,cash_change_seconds=?,success_seconds=?,promotions_enabled=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE id=1',[data.welcomeMessage,data.successEnglish,data.successMalay,data.mediaIntervalSeconds,data.cashChangeSeconds,data.successSeconds,data.promotionsEnabled?1:0,req.auth.user.id]);
  await audit(conn,req,'SETTINGS',{fields:Object.keys(data)});await conn.commit();return res.json({saved:true});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function uploadCustomerDisplayMedia(req,res){
 requireOwner(req);const data=mediaCreate.parse(req.body);let bytes;
 try{bytes=validatePromotionalMedia(data.mimeType,data.base64);}catch(e){throw failure(e.message,400);}
 const conn=await req.auth.pool.getConnection();try{await conn.beginTransaction();
  await conn.execute('SELECT id FROM customer_display_settings WHERE id=1 FOR UPDATE');
  const [[count]]=await conn.execute('SELECT COUNT(*) AS total FROM customer_display_media');
  if(Number(count.total)>=12)throw failure('CD_MEDIA_LIMIT_12');
  const [[sort]]=await conn.execute('SELECT COALESCE(MAX(sort_order),0) AS max_sort FROM customer_display_media');
  const mediaType=data.mimeType==='video/mp4'?'VIDEO':'IMAGE';
  const [result]=await conn.execute('INSERT INTO customer_display_media(title,media_type,mime_type,file_data,sort_order,is_active,created_by) VALUES(?,?,?,?,?,1,?)',[data.title,mediaType,data.mimeType,bytes,Math.min(999,Number(sort.max_sort)+1),req.auth.user.id]);
  await audit(conn,req,'MEDIA_UPLOAD',{id:String(result.insertId),title:data.title,mediaType,bytes:bytes.length});await conn.commit();return res.status(201).json({id:String(result.insertId)});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function editCustomerDisplayMedia(req,res){
 requireOwner(req);const mediaId=id.parse(req.params.id),data=mediaEdit.parse(req.body);const conn=await req.auth.pool.getConnection();try{await conn.beginTransaction();
  const [result]=await conn.execute('UPDATE customer_display_media SET title=?,sort_order=?,is_active=? WHERE id=?',[data.title,data.sortOrder,data.active?1:0,mediaId]);
  if(!result.affectedRows)throw failure('CD_MEDIA_NOT_FOUND',404);
  await audit(conn,req,'MEDIA_UPDATE',{id:String(mediaId),title:data.title,sortOrder:data.sortOrder,active:data.active});await conn.commit();return res.json({saved:true});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function removeCustomerDisplayMedia(req,res){
 requireOwner(req);const mediaId=id.parse(req.params.id),conn=await req.auth.pool.getConnection();try{await conn.beginTransaction();
  const [result]=await conn.execute('DELETE FROM customer_display_media WHERE id=?',[mediaId]);
  if(!result.affectedRows)throw failure('CD_MEDIA_NOT_FOUND',404);
  await audit(conn,req,'MEDIA_DELETE',{id:String(mediaId)});await conn.commit();return res.json({deleted:true});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function ownerCustomerDisplayAsset(req,res){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)||!permitted(req,'customer_display.view'))throw failure('CD_MEDIA_FORBIDDEN',403);
 const [[item]]=await req.auth.pool.execute('SELECT mime_type,file_data FROM customer_display_media WHERE id=?',[id.parse(req.params.id)]);
 if(!item)throw failure('CD_MEDIA_NOT_FOUND',404);
 return res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).type(item.mime_type).send(item.file_data);
}
export async function pairCustomerDisplay(req,res){
 const {branchId}=bodyPair.parse(req.body);requireCashier(req,'customer_display.pair',branchId);
 // R1.3: Pairing without publish rights gives a green Connected viewer that can
 // never show orders/payments. Refuse it instead of reporting false success.
 requireCashier(req,'customer_display.publish',branchId);
 const [[branch]]=await req.auth.pool.execute('SELECT id FROM branches WHERE id=? AND is_active=1',[branchId]);
 if(!branch)throw failure('CD_BRANCH_NOT_ACTIVE');
 const token=makeDisplayToken(req.auth.tenantId);const conn=await req.auth.pool.getConnection();
 try{await conn.beginTransaction();
  await conn.execute(`INSERT INTO customer_display_sessions(branch_id,cashier_user_id,token_hash,expires_at)
   VALUES(?,?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 12 HOUR))
   ON DUPLICATE KEY UPDATE token_hash=VALUES(token_hash),draft_id=NULL,mode='ORDER',attempt_id=NULL,snapshot=NULL,expires_at=VALUES(expires_at),updated_at=UTC_TIMESTAMP(6)`,[branchId,req.auth.user.id,hashDisplayToken(token)]);
  await audit(conn,req,'PAIR',{branchId:String(branchId),durationHours:12});await conn.commit();
  // R1.5: The pairing is a cashier/branch screen, independent of React memory.
  // When POS is already editing a DRAFT, project that real order immediately.
  // Never select an unrelated HELD order that the cashier has not resumed.
  const [[activeDraft]]=await req.auth.pool.execute("SELECT id FROM pos_drafts WHERE branch_id=? AND cashier_user_id=? AND status='DRAFT' ORDER BY updated_at DESC,id DESC LIMIT 1",[branchId,req.auth.user.id]);
  if(activeDraft){
   try{await projectCustomerDisplayCart(req,activeDraft.id);}
   catch(error){process.stderr.write(`[customer-display] pair-cart ${String(error?.code||error?.message||'SYNC_FAILED').slice(0,90)}\n`);}
  }
  // R1.1: A successful INSERT is not enough to claim the public screen is paired.
  // Verify the actual unauthenticated read path (with a token, no cashier cookie)
  // before telling POS to open the display. Do not disclose the token in logs.
  const {session:readSession}=await validPublicSession(token);
  if(String(readSession.branch_id)!==String(branchId)||String(readSession.cashier_user_id)!==String(req.auth.user.id))throw failure('CD_PAIR_READBACK_FAILED',503);
  // Run the complete customer-facing view handler against this token (no auth
  // cookie), not merely the session lookup. This catches missing settings or
  // invalid public-view SQL before the POS screen claims the monitor is ready.
  let readback=null;
  await publicCustomerDisplayState({body:{token}},{set(){return this;},json(data){readback=data;return this;}});
  if(!readback||!readback.status||!readback.branchName)throw failure('CD_PAIR_READBACK_FAILED',503);
  // A high-entropy token is returned once, opened only in a URL fragment. Never log it.
  return res.set('Cache-Control','no-store').json({token,expiresInHours:12,viewReady:true});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
async function lockedSession(conn,req,branchId){
 const [[row]]=await conn.execute('SELECT * FROM customer_display_sessions WHERE branch_id=? AND cashier_user_id=? FOR UPDATE',[branchId,req.auth.user.id]);
 return row||null;
}
// R1.6: DATETIME(6) is a database-local value. Never round-trip the expiry through
// a mysql2 Date/JS timezone conversion: the public viewer and cashier must agree.
async function sessionExpired(conn,session){
 const [[row]]=await conn.execute('SELECT expires_at<=UTC_TIMESTAMP(6) AS expired FROM customer_display_sessions WHERE id=?',[session.id]);
 if(!row)throw failure('CD_PAIR_INVALID',404);
 return Number(row.expired)===1;
}
export async function publishCustomerDisplay(req,res){
 const {branchId,draftId,discountCode,voucherCode}=bodyPublish.parse(req.body);requireCashier(req,'customer_display.publish',branchId);
 const conn=await req.auth.pool.getConnection();try{await conn.beginTransaction();
  const session=await lockedSession(conn,req,branchId);
  if(!session){await conn.commit();return res.json({paired:false});}
  const expired=await sessionExpired(conn,session);
  if(expired){await conn.commit();return res.json({paired:false,expired:true});}
  if(draftId===null){
   // Preserve success screen after checkout; viewer computes real sale state from the POS ledger.
   const [[paid]]=session.draft_id?await conn.execute('SELECT id FROM pos_sales WHERE draft_id=? LIMIT 1',[session.draft_id]):[[]];
   if(!paid)await conn.execute("UPDATE customer_display_sessions SET draft_id=NULL,mode='ORDER',attempt_id=NULL,snapshot=NULL,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[session.id]);
   await conn.commit();return res.json({paired:true});
  }
  const [[draft]]=await conn.execute('SELECT d.id,d.branch_id,d.cashier_user_id,d.status,d.version,d.order_scope,t.table_number FROM pos_drafts d LEFT JOIN restaurant_tables t ON t.id=d.table_id WHERE d.id=?',[draftId]);
  if(!draft||String(draft.branch_id)!==String(branchId)||String(draft.cashier_user_id)!==String(req.auth.user.id))throw failure('CD_ORDER_NOT_OWNED',403);
  // The customer may still be viewing a saved order before the cashier resumes it.
  // A HELD cart is read-only, never eligible for payment, but must be displayable.
  if(!['DRAFT','HELD'].includes(draft.status)){await conn.commit();return res.json({paired:true,ignored:true});}
  const [rawLines]=await conn.execute('SELECT product_name,quantity,unit_price FROM pos_draft_lines WHERE draft_id=? ORDER BY id',[draftId]);
  const quote=await calculateDraftQuote(conn,req,draftId,{discountCode:discountCode.toUpperCase(),voucherCode:voucherCode.toUpperCase()});
  const exactLines=totalDraftLines(rawLines).lines;
  const snapshot={draftId:String(draftId),version:Number(draft.version),lines:exactLines.map(l=>({name:String(l.product_name).slice(0,220),quantity:String(l.quantity),unitPrice:String(l.unitPrice),lineTotal:String(l.lineTotal)})),total:String(quote.bill.total),bill:{subtotal:String(quote.bill.subtotalBeforeTax),discount:String(quote.bill.discount),voucher:String(quote.bill.voucher),salesTax:String(quote.bill.salesTax),serviceTax:String(quote.bill.serviceTax),serviceCharge:String(quote.bill.serviceCharge),roundingAdjustmentSen:Number(quote.bill.roundingAdjustmentSen)},orderScope:draft.order_scope,tableNumber:draft.table_number||null};
  // An older delayed request cannot replace a newer cart version for the same draft.
  const old=typeof session.snapshot==='string'?JSON.parse(session.snapshot):session.snapshot;
  if(String(session.draft_id)===String(draftId)&&Number(old?.version)>Number(draft.version))throw failure('CD_STALE_ORDER_SNAPSHOT');
  await conn.execute("UPDATE customer_display_sessions SET draft_id=?,mode='ORDER',attempt_id=NULL,snapshot=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[draftId,JSON.stringify(snapshot),session.id]);
  await conn.commit();return res.json({paired:true,draftId:String(draftId),version:snapshot.version});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function customerDisplayPaymentMode(req,res){
 const input=bodyMode.parse(req.body);requireCashier(req,'customer_display.publish',input.branchId);
 // R1.5: Cash/QR must not depend on a preceding browser publish request. The
 // backend reads the real cashier draft before setting the payment state.
 await projectCustomerDisplayCart(req,input.draftId);
 const conn=await req.auth.pool.getConnection();try{await conn.beginTransaction();
  const session=await lockedSession(conn,req,input.branchId);
  if(!session||String(session.draft_id)!==String(input.draftId))throw failure('CD_SESSION_ORDER_MISMATCH');
  const expired=await sessionExpired(conn,session);if(expired)throw failure('CD_PAIR_EXPIRED');
  const [[draft]]=await conn.execute('SELECT status FROM pos_drafts WHERE id=? AND branch_id=? AND cashier_user_id=?',[input.draftId,input.branchId,req.auth.user.id]);
  if(!draft||draft.status!=='DRAFT')throw failure('CD_ORDER_NOT_ACTIVE');
  let attemptId=null;
  if(['QR','MANUAL'].includes(input.mode)){
   if(!input.attemptId)throw failure('CD_PAYMENT_ATTEMPT_REQUIRED',400);
   const [[attempt]]=await conn.execute('SELECT id,method_code,status FROM pos_payment_attempts WHERE id=? AND draft_id=? AND branch_id=? AND cashier_user_id=?',[input.attemptId,input.draftId,input.branchId,req.auth.user.id]);
   if(!attempt||attempt.status!=='PENDING'||(input.mode==='QR'?!['DUITNOW_QR','EWALLET'].includes(attempt.method_code):['DUITNOW_QR','EWALLET'].includes(attempt.method_code)))throw failure('CD_PAYMENT_ATTEMPT_INVALID');
   attemptId=input.attemptId;
  }
  await conn.execute('UPDATE customer_display_sessions SET mode=?,attempt_id=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[input.mode,attemptId,session.id]);
  await audit(conn,req,'PAYMENT_SCREEN',{draftId:String(input.draftId),mode:input.mode});await conn.commit();return res.json({mode:input.mode});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
// R1.2: Only a real, committed POS sale can start or dismiss a success presentation.
// This endpoint changes the display session JSON ONLY. It never updates a sale,
// payment attempt, Cash Shift, stock balance or journal.
export async function customerDisplaySalePresentation(req,res){
 const input=bodySalePresentation.parse(req.body);requireCashier(req,'customer_display.publish',input.branchId);
 const conn=await req.auth.pool.getConnection();
 try{await conn.beginTransaction();
  const session=await lockedSession(conn,req,input.branchId);
  if(!session){await conn.commit();return res.json({paired:false});}
  const expired=await sessionExpired(conn,session);
  if(expired){await conn.commit();return res.json({paired:false,expired:true});}
  // The browser supplies identifiers only. The authoritative sale lookup checks
  // cashier, branch and draft against the ledger, including idempotent retries.
  const [[sale]]=await conn.execute('SELECT id,payment_method FROM pos_sales WHERE id=? AND draft_id=? AND branch_id=? AND cashier_user_id=? LIMIT 1',[input.saleId,input.draftId,input.branchId,req.auth.user.id]);
  if(!sale)throw failure('CD_SALE_NOT_POSTED',409);
  if(session.draft_id&&String(session.draft_id)!==String(input.draftId)){
   const [[previous]]=await conn.execute('SELECT status FROM pos_drafts WHERE id=? AND branch_id=? AND cashier_user_id=?',[session.draft_id,input.branchId,req.auth.user.id]);
   // Allow recovery after a previous order was paid/discarded, not when another
   // draft is actively being edited on the same cashier's pairing.
   if(previous?.status==='DRAFT'){
    await conn.commit();return res.json({paired:true,ignored:true,reason:'CD_DIFFERENT_ACTIVE_DRAFT'});
   }
  }
  const snapshot=typeof session.snapshot==='string'?JSON.parse(session.snapshot):session.snapshot;
  const nextSnapshot={...(snapshot&&typeof snapshot==='object'?snapshot:{}),presentation:null};
  const earlier=snapshot?.presentation;
  if(earlier&&String(earlier.saleId)===String(sale.id)){
   // Do not restart an already dismissed receipt, even if network requests
   // arrive out of order. Duplicated messages never extend the timer.
   if(earlier.receiptOpen===false||earlier.receiptOpen===input.receiptOpen){
    await conn.commit();return res.json({paired:true,unchanged:true});
   }
  }
  let remainingChangeSeconds=0;
  if(!input.receiptOpen&&sale.payment_method==='CASH'){
   const [[settings]]=await conn.execute('SELECT cash_change_seconds FROM customer_display_settings WHERE id=1');
   if(!settings)throw failure('CD_DISPLAY_SETTINGS_UNAVAILABLE',503);
   const [[elapsedRow]]=earlier&&String(earlier.saleId)===String(sale.id)?await conn.execute('SELECT GREATEST(0,TIMESTAMPDIFF(SECOND,updated_at,UTC_TIMESTAMP(6))) AS seconds FROM customer_display_sessions WHERE id=?',[session.id]):[[{seconds:0}]];
   const elapsed=Math.max(0,Number(elapsedRow.seconds)||0);
   remainingChangeSeconds=Math.max(0,Number(settings.cash_change_seconds)-elapsed);
  }
  nextSnapshot.presentation={saleId:String(sale.id),receiptOpen:input.receiptOpen,remainingChangeSeconds};
  await conn.execute("UPDATE customer_display_sessions SET draft_id=?,mode='ORDER',attempt_id=NULL,snapshot=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[input.draftId,JSON.stringify(nextSnapshot),session.id]);
  await audit(conn,req,'PAYMENT_SCREEN',{draftId:String(input.draftId),saleId:String(sale.id),presentation:input.receiptOpen?'RECEIPT_OPEN':'RECEIPT_CLOSED'});
  await conn.commit();return res.json({paired:true,presentation:input.receiptOpen?'OPEN':'CLOSED'});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
async function validPublicSession(token){
 if(!validDisplayToken(token))throw failure('CD_PAIR_INVALID',404);
 const tenantId=token.split('.')[0];
 const [[tenant]]=await centralPool().execute("SELECT id FROM tenants WHERE id=? AND status='ACTIVE'",[tenantId]);
 if(!tenant)throw failure('CD_PAIR_INVALID',404);
 const pool=tenantPool(tenantId);
 // R1.1: Resolve each tenant-owned record independently. Besides avoiding
 // correlated metadata lookups in the token query, this permits precise
 // diagnostics if a migrated tenant has incomplete display metadata.
 const [[session]]=await pool.execute(`SELECT id,branch_id,cashier_user_id,draft_id,mode,attempt_id,snapshot,expires_at,
   (expires_at<=UTC_TIMESTAMP(6)) AS expired,
   GREATEST(0,TIMESTAMPDIFF(SECOND,updated_at,UTC_TIMESTAMP(6))) AS presentation_age_seconds
   FROM customer_display_sessions WHERE token_hash=? LIMIT 1`,[hashDisplayToken(token)]);
 if(!session||Number(session.expired))throw failure('CD_PAIR_INVALID',404);
 const [[company]]=await pool.execute('SELECT registered_name FROM company_profiles WHERE id=1');
 const [[branch]]=await pool.execute('SELECT name FROM branches WHERE id=? AND is_active=1',[session.branch_id]);
 if(!company||!branch)throw failure('CD_DISPLAY_METADATA_UNAVAILABLE',503);
 session.merchant_name=company.registered_name;
 session.branch_name=branch.name;
 return {pool,session};
}
export async function publicCustomerDisplayState(req,res){
 const {token}=bodyToken.parse(req.body),{pool,session}=await validPublicSession(token);
 const [[settings]]=await pool.execute('SELECT * FROM customer_display_settings WHERE id=1');
 if(!settings)throw failure('CD_DISPLAY_SETTINGS_UNAVAILABLE',503);
 const [media]=settings.promotions_enabled?await pool.execute('SELECT id,title,media_type,mime_type FROM customer_display_media WHERE is_active=1 ORDER BY sort_order,id'):[[]];
 let sale=null,elapsedSeconds=0,attempt=null,draftStatus=null,draft=null,qr=null;
 if(session.draft_id){
  [[draft]]=await pool.execute('SELECT status,version,order_scope FROM pos_drafts WHERE id=? AND branch_id=?',[session.draft_id,session.branch_id]);
  draftStatus=draft?.status;
  const [[paid]]=await pool.execute('SELECT id,payment_method,total,cash_received,cash_change,TIMESTAMPDIFF(SECOND,posted_at,UTC_TIMESTAMP(6)) AS age_seconds FROM pos_sales WHERE draft_id=? AND branch_id=? LIMIT 1',[session.draft_id,session.branch_id]);
  if(paid){sale=paid;elapsedSeconds=Number(paid.age_seconds);}
  if(!sale&&session.attempt_id&&['QR','MANUAL'].includes(session.mode)){
   const [[a]]=await pool.execute('SELECT status,method_code,expected_total,draft_version FROM pos_payment_attempts WHERE id=? AND draft_id=? AND branch_id=?',[session.attempt_id,session.draft_id,session.branch_id]);attempt=a||null;
  }
  if(attempt&&Number(attempt.draft_version)!==Number(draft?.version))attempt=null;
  if(!sale&&session.mode==='QR'&&attempt?.status==='PENDING'){
   const [[image]]=await pool.execute(`SELECT i.mime_type,i.image_data FROM payment_method_settings s JOIN payment_method_images i ON i.setting_id=s.id
    WHERE s.branch_id=? AND s.method_code=? AND s.is_active=1 LIMIT 1`,[session.branch_id,attempt.method_code]);
   if(image)qr={mime:image.mime_type,base64:Buffer.from(image.image_data).toString('base64')};
  }
 }
 const snapshot=typeof session.snapshot==='string'?JSON.parse(session.snapshot):session.snapshot;
 const snapshotCurrent=!session.draft_id||Boolean(draft&&snapshot&&Number(snapshot.version)===Number(draft.version));
 // HELD orders remain visible like V1 Cart, but payment mode stays unavailable.
 const displayDraftStatus=draftStatus==='HELD'?'DRAFT':draftStatus;
 const displayMode=draftStatus==='HELD'?'ORDER':session.mode;
 const baseStatus=displayPresentationState({sale,elapsedSeconds,mode:displayMode,draftStatus:displayDraftStatus,attempt,cashSeconds:settings.cash_change_seconds,successSeconds:settings.success_seconds,presentation:snapshot?.presentation,presentationElapsedSeconds:session.presentation_age_seconds});
 const status=!sale&&!snapshotCurrent?'IDLE':baseStatus;
 const amount=String(sale?.total||attempt?.expected_total||snapshot?.total||'0.00');
 const payload={status,merchantName:session.merchant_name,branchName:session.branch_name,order:status==='ORDER'?snapshot:null,
  amount:status==='IDLE'?'0.00':amount,cashReceived:status==='CASH_CHANGE'?String(sale.cash_received):null,cashChange:status==='CASH_CHANGE'?String(sale.cash_change):null,
  qr:status==='QR_PENDING'&&qr?qr:null,method:status==='QR_PENDING'?attempt?.method_code:null,
  settings:{welcomeMessage:settings.welcome_message,successEnglish:settings.success_english,successMalay:settings.success_malay,mediaIntervalSeconds:Number(settings.media_interval_seconds),cashChangeSeconds:Number(settings.cash_change_seconds),successSeconds:Number(settings.success_seconds)},
  media:media.map(m=>({id:String(m.id),title:m.title,type:m.media_type,mime:m.mime_type}))};
 return res.set('Cache-Control','no-store').json(payload);
}
export async function publicCustomerDisplayMedia(req,res){
 const input=z.object({token:z.string().refine(validDisplayToken),mediaId:id}).strict().parse(req.body);
 const {pool}=await validPublicSession(input.token);
 const [[row]]=await pool.execute('SELECT m.mime_type,m.file_data FROM customer_display_media m JOIN customer_display_settings s ON s.id=1 WHERE m.id=? AND m.is_active=1 AND s.promotions_enabled=1',[input.mediaId]);
 if(!row)throw failure('CD_MEDIA_NOT_FOUND',404);
 return res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).type(row.mime_type).send(row.file_data);
}
