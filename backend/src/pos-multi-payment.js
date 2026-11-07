import {captureReceiptFooter} from './receipt-settings.js';
// Tenant-scoped manually VERIFIED non-cash POS checkout.
// External terminal approval is entered from a real physical receipt by the cashier;
// it is NOT described as an API-confirmed/online-integrated provider payment.
// SARA/MyKasih is exclusively official-provider-verified and cannot use this route.
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {calculateDraftQuote} from './pos-drafts.js';
import {totalDraftLines} from './pos-money.js';
import {inventoryIssue} from './inventory-cost.js';
import {parseSen,fmtSen} from './cash-shift-money.js';
import {checkPaymentImage} from './payment-method-security.js';
import {encryptPaymentEvidence,decryptPaymentEvidence} from './pos-payment-evidence.js';
import {makePosNonCashJournal} from './pos-noncash-ledger.js';
import {ALL_NONCASH_METHODS,isManualMethod,paymentManualMode,requireManualAttestation} from './pos-payment-policy.js';
import {receipt} from './pos-cash-checkout.js';
import {saleTaxRateSnapshot} from './pos-receipt-tax-rates.js';
import {assignPosReceiptNumber} from './pos-receipt-number.js';
import {centralPool,tenantPool} from './database.js';
const err=(code,status=409)=>Object.assign(new Error(code),{status});
const num=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const sum=z.string().regex(/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/);
const startBody=z.object({requestKey:z.uuid(),methodCode:z.enum(ALL_NONCASH_METHODS),expectedVersion:z.number().int().positive(),expectedTotal:sum,discountCode:z.string().trim().default(''),voucherCode:z.string().trim().default('')}).strict();
const completeBody=z.object({paymentReference:z.string().min(6).max(160),verifiedAmount:sum,verifiedInMerchantAccount:z.literal(true),evidence:z.object({mimeType:z.string(),base64:z.string()}).strict()}).strict();
const str=v=>String(v);
const hash=value=>createHash('sha256').update(value).digest('hex');
const canPay=req=>req.auth.user.permissions.includes('pos.checkout.manual')&&req.auth.user.permissions.includes('pos.cart.manage')&&req.auth.user.permissions.includes('pos.view');
function branchGuard(req,branch){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)&&!req.auth.user.branchIds.includes(str(branch)))throw err('POS_BRANCH_NOT_ASSIGNED',403);
}
async function getDraft(conn,req,draftId){
 const [[draft]]=await conn.execute('SELECT * FROM pos_drafts WHERE id=? FOR UPDATE',[draftId]);
 if(!draft)throw err('POS_DRAFT_NOT_FOUND',404);
 if(str(draft.cashier_user_id)!==str(req.auth.user.id))throw err('POS_DRAFT_NOT_OWNED',403);
 branchGuard(req,draft.branch_id);
 if(draft.status!=='DRAFT')throw err('POS_ORDER_MUST_BE_ACTIVE');
 const [[shift]]=await conn.execute('SELECT status,branch_id,cashier_user_id FROM cash_shifts WHERE id=? FOR UPDATE',[draft.shift_id]);
 if(!shift||shift.status!=='OPEN'||str(shift.branch_id)!==str(draft.branch_id)||str(shift.cashier_user_id)!==str(req.auth.user.id))throw err('POS_OPEN_SHIFT_REQUIRED');
 return draft;
}
async function getSettings(conn,branchId,method){
 const [[settings]]=await conn.execute(`SELECT s.*,EXISTS(SELECT 1 FROM payment_method_images i WHERE i.setting_id=s.id) AS has_image FROM payment_method_settings s WHERE s.branch_id=? AND s.method_code=? FOR UPDATE`,[branchId,method]);
 if(!paymentManualMode(method,settings))throw err(method==='SARA_MYKASIH'?'POS_SARA_OFFICIAL_PROVIDER_REQUIRED':'POS_PAYMENT_METHOD_NOT_READY');
 return settings;
}
async function append(conn,attempt,user,type,details){
 await conn.execute('INSERT INTO pos_payment_attempt_audit(attempt_id,actor_user_id,event_type,details) VALUES(?,?,?,?)',[attempt,user,type,JSON.stringify(details)]);
}
async function createDisplayToken(conn,attempt,tenantId){
 const token=`${tenantId}.${randomBytes(32).toString('base64url')}`;
 await conn.execute('INSERT INTO pos_payment_display_tokens(token_hash,attempt_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(6),INTERVAL 15 MINUTE))',[hash(token),attempt]);
 return token;
}
async function exposeAttempt(conn,row,tenantId){
 const token=await createDisplayToken(conn,row.id,tenantId);
 return {attemptId:str(row.id),methodCode:row.method_code,verificationMode:row.verification_mode,expectedTotal:str(row.expected_total),status:row.status,displayToken:token};
}
export async function startNonCashPayment(req,res){
 if(!canPay(req))throw err('POS_MANUAL_CHECKOUT_FORBIDDEN',403);
 const draftId=num.parse(req.params.id),input=startBody.parse(req.body);
 if(!isManualMethod(input.methodCode))throw err('POS_OFFICIAL_PROVIDER_REQUIRED');
 if(input.discountCode||input.voucherCode)throw err('POS_CHECKOUT_DISCOUNT_VOUCHER_NOT_CONNECTED');
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[prev]]=await conn.execute('SELECT * FROM pos_payment_attempts WHERE request_key=? FOR UPDATE',[input.requestKey]);
  if(prev){
   if(str(prev.draft_id)!==str(draftId)||prev.method_code!==input.methodCode||str(prev.expected_total)!==fmtSen(parseSen(input.expectedTotal))||Number(prev.draft_version)!==input.expectedVersion)throw err('POS_PAYMENT_REQUEST_KEY_CONFLICT');
   if(prev.status!=='PENDING')throw err('POS_PAYMENT_ATTEMPT_ALREADY_FINAL');
   const out=await exposeAttempt(conn,prev,req.auth.tenantId);await conn.commit();return res.set('Cache-Control','no-store').json(out);
  }
  const draft=await getDraft(conn,req,draftId);
  if(Number(draft.version)!==input.expectedVersion)throw err('POS_DRAFT_VERSION_CHANGED');
  if(draft.order_scope==='DINE_IN'&&!draft.table_id)throw err('POS_DINE_IN_TABLE_REQUIRED');
  const settings=await getSettings(conn,draft.branch_id,input.methodCode);
  const [lines]=await conn.execute('SELECT id FROM pos_draft_lines WHERE draft_id=? LIMIT 1',[draftId]);
  if(!lines.length)throw err('POS_EMPTY_ORDER');
  // Payment must not even be initiated for a cart which cannot be fulfilled.
  const [stockLines]=await conn.execute('SELECT product_id,quantity,track_stock FROM pos_draft_lines WHERE draft_id=? ORDER BY product_id FOR UPDATE',[draftId]);
  for(const line of stockLines){
   if(!line.track_stock)continue;
   const quantity=str(line.quantity);
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2}0?)?$/.test(quantity))throw err('POS_STOCK_QUANTITY_TWO_DECIMALS_ONLY');
   const [[balance]]=await conn.execute('SELECT quantity_on_hand,carrying_value FROM inventory_branch_balances WHERE branch_id=? AND product_id=? FOR UPDATE',[draft.branch_id,line.product_id]);
   if(!balance)throw err('POS_STOCK_NOT_INITIALIZED');
   try{inventoryIssue({quantity:str(balance.quantity_on_hand),carryingValue:str(balance.carrying_value)},Number(quantity).toFixed(2));}
   catch(e){throw err(e.message==='INVENTORY_INSUFFICIENT_STOCK'?'POS_INSUFFICIENT_STOCK':'POS_INVENTORY_ISSUE_FAILED');}
  }
  const quote=await calculateDraftQuote(conn,req,draftId,{});
  if(quote.bill.total!==fmtSen(parseSen(input.expectedTotal)))throw err('POS_CHECKOUT_TOTAL_CHANGED');
  if(parseSen(quote.bill.total)<=0n)throw err('POS_CHECKOUT_TOTAL_MUST_BE_POSITIVE');
  const mode=paymentManualMode(input.methodCode,settings);
  const [r]=await conn.execute('INSERT INTO pos_payment_attempts(request_key,draft_id,branch_id,shift_id,cashier_user_id,draft_version,method_code,verification_mode,expected_total) VALUES(?,?,?,?,?,?,?,?,?)',[input.requestKey,draft.id,draft.branch_id,draft.shift_id,req.auth.user.id,draft.version,input.methodCode,mode,quote.bill.total]);
  await append(conn,r.insertId,req.auth.user.id,'START',{method:input.methodCode,mode,total:quote.bill.total});
  const out=await exposeAttempt(conn,{id:r.insertId,method_code:input.methodCode,verification_mode:mode,expected_total:quote.bill.total,status:'PENDING'},req.auth.tenantId);
  await conn.commit();return res.status(201).set('Cache-Control','no-store').json(out);
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function manualPaymentImage(req,res){
 if(!req.auth.user.permissions.includes('pos.view'))throw err('POS_VIEW_DENIED',403);
 const draftId=num.parse(req.params.id),attemptId=num.parse(req.params.attemptId);
 const [[row]]=await req.auth.pool.execute(`SELECT a.cashier_user_id,a.branch_id,a.method_code,a.draft_id,i.mime_type,i.image_data
 FROM pos_payment_attempts a JOIN payment_method_settings s ON s.branch_id=a.branch_id AND s.method_code=a.method_code JOIN payment_method_images i ON i.setting_id=s.id WHERE a.id=? AND a.draft_id=?`,[attemptId,draftId]);
 if(!row||str(row.cashier_user_id)!==str(req.auth.user.id))throw err('POS_PAYMENT_IMAGE_NOT_FOUND',404);
 branchGuard(req,row.branch_id);
 return res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).type(row.mime_type).send(row.image_data);
}
export async function publicCustomerDisplay(req,res){
 // A high-entropy, short-lived bearer token is supplied in a POST body, not the URL.
 const token=z.object({token:z.string().regex(/^[1-9]\d{0,14}\.[A-Za-z0-9_-]{43}$/)}).strict().parse(req.body).token;
 const tenantId=token.split('.')[0];
 const [[tenant]]=await centralPool().execute("SELECT id FROM tenants WHERE id=? AND status='ACTIVE'",[tenantId]);
 if(!tenant)throw err('DISPLAY_LINK_EXPIRED',404);
 const [[row]]=await displayLookupForPool(tenantPool(tenantId),hash(token));
 if(!row||row.expired)throw err('DISPLAY_LINK_EXPIRED',404);
 // The public view is intentionally limited to amount/method/state and approved merchant QR.
 const active=row.status==='PENDING'&&row.draft_status==='DRAFT'&&Number(row.draft_version)===Number(row.current_version);
 return res.set('Cache-Control','no-store').json({status:row.status==='PAID'?'PAID':active?'PENDING':'EXPIRED',methodCode:row.method_code,amount:str(row.expected_total),merchantName:row.merchant_name,qrMime:row.qr_mime||null,qrImage:row.qr_data?Buffer.from(row.qr_data).toString('base64'):null});
}
// Tenant database must be resolved using token HASH only. There is no anonymous tenant ID input.
export function displayLookupForPool(pool,tokenHash){
 return pool.execute(`SELECT a.status,a.method_code,a.expected_total,a.draft_version,d.status AS draft_status,d.version AS current_version,
 (SELECT registered_name FROM company_profiles WHERE id=1) AS merchant_name,i.mime_type AS qr_mime,i.image_data AS qr_data,
 UTC_TIMESTAMP(6)>t.expires_at AS expired
 FROM pos_payment_display_tokens t JOIN pos_payment_attempts a ON a.id=t.attempt_id JOIN pos_drafts d ON d.id=a.draft_id
 LEFT JOIN payment_method_settings s ON s.branch_id=a.branch_id AND s.method_code=a.method_code
 LEFT JOIN payment_method_images i ON i.setting_id=s.id WHERE t.token_hash=? LIMIT 1`,[tokenHash]);
}
export async function completeManualPayment(req,res){
 if(!canPay(req))throw err('POS_MANUAL_CHECKOUT_FORBIDDEN',403);
 const draftId=num.parse(req.params.id),attemptId=num.parse(req.params.attemptId),input=completeBody.parse(req.body);
 const evidence=encryptPaymentEvidence(checkPaymentImage(input.evidence.mimeType,input.evidence.base64));
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[attempt]]=await conn.execute('SELECT * FROM pos_payment_attempts WHERE id=? AND draft_id=? FOR UPDATE',[attemptId,draftId]);
  if(!attempt)throw err('POS_PAYMENT_ATTEMPT_NOT_FOUND',404);
  if(str(attempt.cashier_user_id)!==str(req.auth.user.id))throw err('POS_PAYMENT_NOT_OWNED',403);
  branchGuard(req,attempt.branch_id);
  const reference=requireManualAttestation({paymentReference:input.paymentReference,verifiedInMerchantAccount:input.verifiedInMerchantAccount,verifiedAmount:fmtSen(parseSen(input.verifiedAmount)),expectedTotal:str(attempt.expected_total)});
  if(attempt.status==='PAID'){
   if(attempt.payment_reference!==reference)throw err('POS_PAYMENT_ALREADY_POSTED');
   const answer=await receipt(conn,attempt.sale_id);await conn.commit();return res.set('Cache-Control','no-store').json({idempotent:true,receipt:answer});
  }
  if(attempt.status!=='PENDING')throw err('POS_PAYMENT_ATTEMPT_NOT_PENDING');
  // Protect against a reused bank/terminal approval reference before changing inventory.
  const referenceHash=hash(reference);
  const [[duplicate]]=await conn.execute('SELECT id FROM pos_payment_attempts WHERE branch_id=? AND method_code=? AND reference_hash=? LIMIT 1 FOR UPDATE',[attempt.branch_id,attempt.method_code,referenceHash]);
  if(duplicate)throw err('POS_PAYMENT_REFERENCE_ALREADY_USED');
  const draft=await getDraft(conn,req,draftId);
  if(Number(draft.version)!==Number(attempt.draft_version))throw err('POS_DRAFT_VERSION_CHANGED');
  if(draft.order_scope==='DINE_IN'&&!draft.table_id)throw err('POS_DINE_IN_TABLE_REQUIRED');
  await getSettings(conn,draft.branch_id,attempt.method_code);
  const [rawLines]=await conn.execute('SELECT id,product_id,product_name,sku,quantity,unit_price,track_stock,product_type,category_id,unit_code FROM pos_draft_lines WHERE draft_id=? ORDER BY product_id FOR UPDATE',[draftId]);
  if(!rawLines.length)throw err('POS_EMPTY_ORDER');
  const subtotal=totalDraftLines(rawLines);
  const quote=await calculateDraftQuote(conn,req,draftId,{});
  if(quote.bill.total!==str(attempt.expected_total))throw err('POS_CHECKOUT_TOTAL_CHANGED');
  let cogs=0n;const issued=new Map();
  for(const line of rawLines){
   const [[product]]=await conn.execute('SELECT id,track_stock,product_structure,product_type,status,is_deleted FROM products WHERE id=? FOR UPDATE',[line.product_id]);
   if(!product||product.status!=='ACTIVE'||product.is_deleted||product.product_structure!=='SINGLE'||product.product_type!==line.product_type||!!product.track_stock!==!!line.track_stock)throw err('POS_CHECKOUT_PRODUCT_CHANGED');
   if(!line.track_stock)continue;
   const q=str(line.quantity);
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2}0?)?$/.test(q))throw err('POS_STOCK_QUANTITY_TWO_DECIMALS_ONLY');
   const [[balance]]=await conn.execute('SELECT quantity_on_hand,carrying_value,average_cost FROM inventory_branch_balances WHERE branch_id=? AND product_id=? FOR UPDATE',[draft.branch_id,line.product_id]);
   if(!balance)throw err('POS_STOCK_NOT_INITIALIZED');
   let movement;
   try{movement=inventoryIssue({quantity:str(balance.quantity_on_hand),carryingValue:str(balance.carrying_value)},Number(q).toFixed(2));}
   catch(e){throw err(e.message==='INVENTORY_INSUFFICIENT_STOCK'?'POS_INSUFFICIENT_STOCK':'POS_INVENTORY_ISSUE_FAILED');}
   issued.set(str(line.product_id),movement);cogs+=parseSen(movement.issuedCost);
  }
  if(cogs>999999999999n)throw err('POS_COST_LIMIT');
  const journal=makePosNonCashJournal(quote.bill,fmtSen(cogs),attempt.method_code);
  const rateSnapshot=saleTaxRateSnapshot(quote);
  const [sale]=await conn.execute(`INSERT INTO pos_sales(request_key,draft_id,branch_id,shift_id,cashier_user_id,table_id,order_scope,payment_method,subtotal,sales_tax,sales_tax_rate_pct,service_tax,service_tax_rate_pct,service_charge,service_charge_rate_pct,rounding_adjustment,total,cost_of_goods,cash_received,cash_change)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[attempt.request_key,draftId,draft.branch_id,draft.shift_id,req.auth.user.id,draft.table_id,draft.order_scope,attempt.method_code,quote.bill.subtotalBeforeTax,quote.bill.salesTax,rateSnapshot.salesTaxRate,quote.bill.serviceTax,rateSnapshot.serviceTaxRate,quote.bill.serviceCharge,rateSnapshot.serviceChargeRate,fmtSen(BigInt(quote.bill.roundingAdjustmentSen)),quote.bill.total,fmtSen(cogs),'0.00','0.00']);
  const saleId=sale.insertId;
  await captureReceiptFooter(conn,saleId);
  const receiptNumber=await assignPosReceiptNumber(conn,saleId);
  for(const line of subtotal.lines){
   const movement=issued.get(str(line.product_id));
   await conn.execute('INSERT INTO pos_sale_lines(sale_id,product_id,product_name,sku,quantity,unit_price,line_total,track_stock,inventory_cost) VALUES(?,?,?,?,?,?,?,?,?)',[saleId,line.product_id,line.product_name,line.sku,line.quantity,line.unit_price,line.lineTotal,line.track_stock?1:0,movement?.issuedCost||'0.00']);
   if(movement){
    await conn.execute('UPDATE inventory_branch_balances SET quantity_on_hand=?,carrying_value=?,average_cost=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE branch_id=? AND product_id=?',[movement.quantity,movement.carryingValue,movement.averageCost,draft.branch_id,line.product_id]);
    const hashMove=createHash('sha256').update(JSON.stringify({saleId:str(saleId),productId:str(line.product_id),qty:line.quantity,cost:movement.issuedCost})).digest('hex');
    await conn.execute("INSERT INTO inventory_movements(request_key,request_hash,branch_id,product_id,movement_type,quantity_delta,value_delta,quantity_after,carrying_value_after,average_cost_after,reference,actor_user_id) VALUES(?,?,?,?,'POS_SALE',?,?,?,?,?,?,?)",[randomUUID(),hashMove,draft.branch_id,line.product_id,`-${Number(line.quantity).toFixed(2)}`,`-${movement.issuedCost}`,movement.quantity,movement.carryingValue,movement.averageCost,receiptNumber,req.auth.user.id]);
   }
  }
  const [j]=await conn.execute("INSERT INTO accounting_journals(source_type,source_id,branch_id) VALUES('POS_NONCASH_SALE',?,?)",[saleId,draft.branch_id]);
  for(const l of journal)await conn.execute('INSERT INTO accounting_journal_lines(journal_id,account_code,debit,credit,description) VALUES(?,?,?,?,?)',[j.insertId,l.accountCode,l.debit,l.credit,l.description]);
  await conn.execute("UPDATE pos_drafts SET status='COMPLETED',version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='DRAFT'",[draftId]);
  await conn.execute('UPDATE pos_payment_attempts SET status=?,payment_reference=?,reference_hash=?,verified_by=?,verified_at=UTC_TIMESTAMP(6),evidence_mime=?,evidence_data=?,sale_id=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',['PAID',reference,referenceHash,req.auth.user.id,input.evidence.mimeType,evidence,saleId,attemptId]);
  await append(conn,attemptId,req.auth.user.id,'MANUAL_VERIFY',{method:attempt.method_code,mode:attempt.verification_mode,amount:quote.bill.total,reference,saleId:str(saleId),confirmation:'STAFF_CHECKED_MERCHANT_ACCOUNT_OR_TERMINAL'});
  await conn.execute("INSERT INTO pos_draft_audit_logs(draft_id,actor_user_id,action_type,details) VALUES(?,?,'COMPLETE',?)",[draftId,req.auth.user.id,JSON.stringify({saleId:str(saleId),method:attempt.method_code,verifiedMode:attempt.verification_mode,total:quote.bill.total,receipt:receiptNumber})]);
  if(draft.table_id)await conn.execute("INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,'RELEASE',?)",[draft.table_id,req.auth.user.id,JSON.stringify({draftId:str(draftId),reason:'COMPLETED',saleId:str(saleId)})]);
  const answer=await receipt(conn,saleId);
  await conn.commit();return res.status(201).set('Cache-Control','no-store').json({message:'POS_MANUALLY_VERIFIED_NONCASH_POSTED',idempotent:false,receipt:{...answer,verificationMode:attempt.verification_mode,paymentReference:reference}});
 }catch(e){await conn.rollback();if(['ER_DUP_ENTRY','ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code))throw err('POS_PAYMENT_CONCURRENT_OR_DUPLICATE');throw e;}finally{conn.release();}
}
export async function getPaymentEvidence(req,res){
 if(!req.auth.user.permissions.includes('pos.audit'))throw err('POS_PAYMENT_AUDIT_DENIED',403);
 const id=num.parse(req.params.attemptId),[[row]]=await req.auth.pool.execute('SELECT a.branch_id,a.evidence_data,a.evidence_mime FROM pos_payment_attempts a WHERE a.id=? AND a.status=\'PAID\'',[id]);
 if(!row||!row.evidence_data)throw err('POS_PAYMENT_EVIDENCE_NOT_FOUND',404);
 branchGuard(req,row.branch_id);
 return res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).type(row.evidence_mime).send(decryptPaymentEvidence(row.evidence_data));
}
