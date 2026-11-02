import {createHash} from 'node:crypto';
import {z} from 'zod';
import {evaluateDiscount} from './discount-evaluation.js';
import {evaluateVoucher} from './voucher-evaluation.js';
import {totalDraftLines,format,amountSen} from './pos-money.js';
import {calculatePosBill} from './pos-bill.js';
import {readSstSettings} from './sst-settings.js';
import {readServiceChargeSettings} from './service-charge.js';
import {serviceChargeForOrder} from './service-charge-policy.js';
import {applySstPolicy,summarizePosSst} from './sst-policy.js';

// POS Integration R1: durable, cashier-owned, tenant-scoped carts and read-only quotes.
// No payment, stock movement, voucher reservation, sales posting or cash shift mutation.
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const requestKey=z.string().uuid();
const qty=z.string().regex(/^(?:[1-9]\d{0,3})(?:\.\d{1,3})?$|^0\.\d{1,3}$/).refine(v=>Number(v)>0&&Number(v)<=1000);
const createSchema=z.object({branchId:id,requestKey,orderScope:z.enum(['TAKE_AWAY','DINE_IN']).default('TAKE_AWAY'),ensureExisting:z.boolean().optional()}).strict();
const addSchema=z.object({productId:id,quantity:qty,requestKey,expectedVersion:z.number().int().positive()}).strict();
const changeSchema=z.object({quantity:qty.optional(),remove:z.boolean().optional(),requestKey,expectedVersion:z.number().int().positive()}).strict().refine(v=>(v.remove===true)!==Boolean(v.quantity),'CHANGE_OR_REMOVE_REQUIRED');
const statusSchema=z.object({status:z.enum(['DRAFT','HELD','DISCARDED']),requestKey,expectedVersion:z.number().int().positive(),createNext:z.boolean().optional()}).strict().refine(v=>!v.createNext||v.status==='HELD','POS_CREATE_NEXT_REQUIRES_HOLD');
const assignSchema=z.object({tableId:id.nullable(),expectedVersion:z.number().int().positive(),requestKey}).strict();
const quoteSchema=z.object({discountCode:z.string().trim().max(50).default(''),voucherCode:z.string().trim().max(100).default('')}).strict();
const bad=(error,status=400)=>Object.assign(new Error(error),{status});
const has=(req,code)=>req.auth.user.permissions.includes(code);
const manager=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code);
const access=(req,branch)=>{if(!manager(req)&&!req.auth.user.branchIds.includes(String(branch)))throw bad('POS_BRANCH_NOT_ASSIGNED',403);};
const cashReadable=code=>String(code||'').trim();
async function transact(pool,fn){const conn=await pool.getConnection();try{await conn.beginTransaction();const value=await fn(conn);await conn.commit();return value;}catch(error){await conn.rollback();throw error;}finally{conn.release();}}
async function activeShift(conn,req,branchId,lock=false){
 const [[row]]=await conn.execute(`SELECT id,status,branch_id FROM cash_shifts WHERE cashier_user_id=? AND branch_id=? AND status='OPEN' LIMIT 1${lock?' FOR UPDATE':''}`,[req.auth.user.id,branchId]);
 if(!row)throw bad('POS_OPEN_SHIFT_REQUIRED',409);
 return row;
}
const baseSql=`SELECT d.id,d.request_key,d.branch_id,d.cashier_user_id,d.shift_id,d.status,d.order_scope,d.table_id,t.table_number,t.table_name,d.version,DATE_FORMAT(d.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,DATE_FORMAT(d.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at,b.name AS branch_name FROM pos_drafts d JOIN branches b ON b.id=d.branch_id LEFT JOIN restaurant_tables t ON t.id=d.table_id`;
async function draft(conn,req,draftId,lock=false){
 const [[d]]=await conn.execute(`${baseSql} WHERE d.id=?${lock?' FOR UPDATE':''}`,[draftId]);
 if(!d)throw bad('POS_DRAFT_NOT_FOUND',404);
 if(String(d.cashier_user_id)!==String(req.auth.user.id))throw bad('POS_DRAFT_NOT_OWNED',403);
 access(req,d.branch_id);
 return d;
}
async function detail(conn,req,draftId){
 const d=await draft(conn,req,draftId);
 const [rows]=await conn.execute('SELECT id,product_id,product_name,sku,barcode,category_id,unit_code,quantity,unit_price,track_stock,product_type FROM pos_draft_lines WHERE draft_id=? ORDER BY id',[draftId]);
 const calculated=totalDraftLines(rows);
 return {draft:{...d,id:String(d.id),branch_id:String(d.branch_id),shift_id:String(d.shift_id),cashier_user_id:String(d.cashier_user_id),table_id:d.table_id==null?null:String(d.table_id)},...calculated,checkoutAvailable:false,checkoutBlockers:['INVENTORY_POSTING_NOT_CONNECTED','PAYMENT_CAPTURE_NOT_CONNECTED','TAX_RECEIPT_FINALIZATION_NOT_CONNECTED']};
}
async function log(conn,draftId,userId,action,details){await conn.execute('INSERT INTO pos_draft_audit_logs(draft_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[draftId,userId,action,JSON.stringify(details)]);}
async function command(conn,d,action,request,params){
 const digest=createHash('sha256').update(JSON.stringify({action,params})).digest('hex');
 const [[previous]]=await conn.execute('SELECT request_hash FROM pos_draft_commands WHERE draft_id=? AND request_key=?',[d.id,request]);
 if(previous){if(previous.request_hash!==digest)throw bad('POS_REQUEST_KEY_REUSED',409);return false;}
 if(d.version!==params.expectedVersion)throw bad('POS_DRAFT_VERSION_CHANGED',409);
 if(d.status==='DISCARDED')throw bad('POS_DRAFT_DISCARDED',409);
 await conn.execute('INSERT INTO pos_draft_commands(draft_id,request_key,request_hash,action) VALUES(?,?,?,?)',[d.id,request,digest,action]);
 return true;
}
async function ensureEditable(conn,req,d){
 if(d.status!=='DRAFT')throw bad('POS_DRAFT_MUST_RESUME',409);
 await activeShift(conn,req,d.branch_id,true);
 const [[shift]]=await conn.execute("SELECT status FROM cash_shifts WHERE id=?",[d.shift_id]);
 if(shift?.status!=='OPEN')throw bad('POS_ORIGINAL_SHIFT_CLOSED',409);
}
async function bump(conn,d){await conn.execute('UPDATE pos_drafts SET version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[d.id]);}
export async function posBootstrap(req,res){
 const {pool}=req.auth;
 const [branches]=await pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');
 const visible=branches.filter(b=>manager(req)||req.auth.user.branchIds.includes(String(b.id)));
 const [shifts]=await pool.execute("SELECT s.id,s.branch_id,b.name AS branch_name FROM cash_shifts s JOIN branches b ON b.id=s.branch_id WHERE s.cashier_user_id=? AND s.status='OPEN' ORDER BY s.id DESC",[req.auth.user.id]);
 const [products]=await pool.execute(`SELECT p.id,p.sku,p.barcode,p.product_name,p.category_id,p.product_structure,p.track_stock,p.is_weighable,p.base_unit_code,p.product_type,p.status,p.is_deleted,p.selling_price, p.product_image_url FROM products p JOIN categories c ON c.id=p.category_id AND c.status='ACTIVE' AND c.is_deleted=0 WHERE p.status='ACTIVE' AND p.is_deleted=0 ORDER BY p.product_name LIMIT 6000`);
 const [categories]=await pool.execute(`SELECT c.id,c.category_name FROM categories c WHERE c.is_deleted=0 AND c.status='ACTIVE' ORDER BY c.category_name`);
 // Only return branch prices for authorized branches in this authenticated tenant pool.
 const [branchPriceRows]=visible.length?await pool.execute(`SELECT product_id,branch_id,selling_price FROM product_branch_prices WHERE branch_id IN (${visible.map(()=>'?').join(',')})`,visible.map(b=>b.id)):[[]];
 // Quantity-only stock snapshots: no cashier access to average cost or carrying value.
 const [stockRows]=visible.length?await pool.execute(`SELECT branch_id,product_id,quantity_on_hand FROM inventory_branch_balances WHERE branch_id IN (${visible.map(()=>'?').join(',')})`,visible.map(b=>b.id)):[[]];
 const [tableRows]=await pool.execute(`SELECT t.id,t.branch_id,t.table_number,t.table_name,t.table_area,t.seating_capacity,t.table_status,CASE WHEN d.id IS NULL THEN t.table_status ELSE 'OCCUPIED' END AS occupancy,d.id AS draft_id,d.cashier_user_id AS assigned_cashier FROM restaurant_tables t LEFT JOIN pos_drafts d ON d.active_table_id=t.id WHERE t.is_deleted=0 AND t.status='ACTIVE' ORDER BY t.branch_id,t.table_area,t.sort_order,t.table_number`);
 const [methods]=await pool.execute('SELECT branch_id,method_code,is_active FROM payment_method_settings WHERE is_active=1 AND method_code<>\'SARA_MYKASIH\'');
 return res.set('Cache-Control','no-store').json({branches:visible.map(b=>({...b,id:String(b.id)})),openShifts:shifts.filter(s=>visible.some(b=>String(b.id)===String(s.branch_id))).map(s=>({...s,id:String(s.id),branch_id:String(s.branch_id)})),products:products.map(p=>({...p,id:String(p.id),category_id:String(p.category_id)})),categories:categories.map(c=>({...c,id:String(c.id)})),branchPrices:branchPriceRows.map(bp=>({product_id:String(bp.product_id),branch_id:String(bp.branch_id),selling_price:String(bp.selling_price)})),stockLevels:stockRows.map(x=>({branch_id:String(x.branch_id),product_id:String(x.product_id),quantity_on_hand:String(x.quantity_on_hand)})),restaurantTables:['RESTAURANT','CAFE'].includes(req.auth.company.business_type)?tableRows.filter(t=>visible.some(b=>String(b.id)===String(t.branch_id))).map(t=>({...t,id:String(t.id),branch_id:String(t.branch_id),draft_id:t.draft_id==null?null:String(t.draft_id)})):[],enabledPaymentMethods:methods.filter(m=>visible.some(b=>String(b.id)===String(m.branch_id))),checkoutAvailable:false,stage:'DURABLE_CART_AND_READ_ONLY_QUOTE'});
}
export async function listPosDrafts(req,res){
 const [rows]=await req.auth.pool.execute(`${baseSql} WHERE d.cashier_user_id=? AND d.status IN ('DRAFT','HELD') ORDER BY d.updated_at DESC LIMIT 100`,[req.auth.user.id]);
 res.set('Cache-Control','no-store').json({drafts:rows.filter(r=>manager(req)||req.auth.user.branchIds.includes(String(r.branch_id))).map(r=>({...r,id:String(r.id),branch_id:String(r.branch_id),shift_id:String(r.shift_id)}))});
}
export async function createPosDraft(req,res){
 if(!has(req,'pos.cart.manage'))throw bad('POS_WRITE_DENIED',403);
 const data=createSchema.parse(req.body);access(req,data.branchId);
 if(data.orderScope!=='TAKE_AWAY')throw bad('POS_DINE_IN_SELECT_TABLE_FIRST',409);
 const result=await transact(req.auth.pool,async conn=>{
  const shift=await activeShift(conn,req,data.branchId,true);
  const [[previous]]=await conn.execute('SELECT id,branch_id,cashier_user_id,shift_id,order_scope FROM pos_drafts WHERE request_key=?',[data.requestKey]);
  if(previous){if(String(previous.cashier_user_id)!==String(req.auth.user.id)||Number(previous.branch_id)!==data.branchId||previous.order_scope!==data.orderScope||String(previous.shift_id)!==String(shift.id))throw bad('POS_REQUEST_KEY_REUSED',409);return detail(conn,req,previous.id);}
  // Automatic terminal entry is an ensure operation. Locking the OPEN shift above serializes
  // concurrent ensure requests for the same cashier and branch without a schema change.
  // Held orders are NEVER automatically resumed or reused as a new sale.
  if(data.ensureExisting){
   const [[existing]]=await conn.execute("SELECT id FROM pos_drafts WHERE cashier_user_id=? AND shift_id=? AND branch_id=? AND status='DRAFT' ORDER BY updated_at DESC,id DESC LIMIT 1",[req.auth.user.id,shift.id,data.branchId]);
   if(existing)return detail(conn,req,existing.id);
  }
  const [saved]=await conn.execute('INSERT INTO pos_drafts(request_key,branch_id,cashier_user_id,shift_id,order_scope) VALUES(?,?,?,?,?)',[data.requestKey,data.branchId,req.auth.user.id,shift.id,data.orderScope]);
  await log(conn,saved.insertId,req.auth.user.id,'CREATE',{branchId:data.branchId,shiftId:String(shift.id),scope:data.orderScope});
  return detail(conn,req,saved.insertId);
 });res.status(201).json(result);
}
export async function getPosDraft(req,res){res.set('Cache-Control','no-store').json(await detail(req.auth.pool,req,id.parse(req.params.id)));}
export async function addPosLine(req,res){
 if(!has(req,'pos.cart.manage'))throw bad('POS_WRITE_DENIED',403);
 const draftId=id.parse(req.params.id),data=addSchema.parse(req.body);
 const result=await transact(req.auth.pool,async conn=>{
  const d=await draft(conn,req,draftId,true);
  const should=await command(conn,d,'ADD_LINE',data.requestKey,{productId:data.productId,quantity:data.quantity,expectedVersion:data.expectedVersion});
  if(!should)return detail(conn,req,d.id);
  await ensureEditable(conn,req,d);
  const [[p]]=await conn.execute(`SELECT p.id,p.sku,p.barcode,p.product_name,p.category_id,p.base_unit_code,p.is_weighable,p.track_stock,p.product_type,p.product_structure,COALESCE(bp.selling_price,p.selling_price) AS price FROM products p LEFT JOIN product_branch_prices bp ON bp.product_id=p.id AND bp.branch_id=? WHERE p.id=? AND p.status='ACTIVE' AND p.is_deleted=0 FOR UPDATE`,[d.branch_id,data.productId]);
  if(!p)throw bad('POS_PRODUCT_NOT_AVAILABLE',404);
  if(p.product_structure!=='SINGLE')throw bad('POS_PACKAGES_AND_BUNDLES_PENDING',409);
  if(!p.is_weighable&&!Number.isInteger(Number(data.quantity)))throw bad('POS_WHOLE_QUANTITY_REQUIRED',400);
  const [[existing]]=await conn.execute('SELECT id,quantity FROM pos_draft_lines WHERE draft_id=? AND product_id=? FOR UPDATE',[d.id,p.id]);
  const newQty=(existing?Number(existing.quantity):0)+Number(data.quantity);
  if(newQty>1000)throw bad('POS_QUANTITY_LIMIT',400);
  if(existing){await conn.execute('UPDATE pos_draft_lines SET quantity=?,unit_price=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[newQty,String(p.price),existing.id]);}
  else {const [[count]]=await conn.execute('SELECT COUNT(*) AS total FROM pos_draft_lines WHERE draft_id=?',[d.id]);if(count.total>=150)throw bad('POS_CART_LINE_LIMIT',409);await conn.execute(`INSERT INTO pos_draft_lines(draft_id,product_id,product_name,sku,barcode,category_id,unit_code,quantity,unit_price,track_stock,product_type) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,[d.id,p.id,p.product_name,p.sku,p.barcode,p.category_id,p.base_unit_code,newQty,String(p.price),p.track_stock?1:0,p.product_type]);}
  await bump(conn,d);await log(conn,d.id,req.auth.user.id,'ADD_LINE',{productId:String(p.id),quantity:data.quantity,unitPrice:String(p.price)});
  return detail(conn,req,d.id);
 });res.json(result);
}
export async function changePosLine(req,res){
 if(!has(req,'pos.cart.manage'))throw bad('POS_WRITE_DENIED',403);
 const draftId=id.parse(req.params.id),lineId=id.parse(req.params.lineId),data=changeSchema.parse(req.body);
 const result=await transact(req.auth.pool,async conn=>{
  const d=await draft(conn,req,draftId,true);
  const should=await command(conn,d,'CHANGE_LINE',data.requestKey,{lineId,quantity:data.quantity||null,remove:!!data.remove,expectedVersion:data.expectedVersion});
  if(!should)return detail(conn,req,d.id);
  await ensureEditable(conn,req,d);
  const [[line]]=await conn.execute('SELECT l.id,l.product_id,l.quantity,p.is_weighable FROM pos_draft_lines l JOIN products p ON p.id=l.product_id WHERE l.id=? AND l.draft_id=? FOR UPDATE',[lineId,d.id]);
  if(!line)throw bad('POS_LINE_NOT_FOUND',404);
  if(data.remove){await conn.execute('DELETE FROM pos_draft_lines WHERE id=?',[lineId]);}
  else {if(!line.is_weighable&&!Number.isInteger(Number(data.quantity)))throw bad('POS_WHOLE_QUANTITY_REQUIRED',400);await conn.execute('UPDATE pos_draft_lines SET quantity=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[data.quantity,lineId]);}
  await bump(conn,d);await log(conn,d.id,req.auth.user.id,data.remove?'REMOVE_LINE':'CHANGE_QUANTITY',{lineId:String(lineId),quantity:data.quantity||null});
  return detail(conn,req,d.id);
 });res.json(result);
}
export async function changePosDraftStatus(req,res){
 if(!has(req,'pos.cart.manage'))throw bad('POS_WRITE_DENIED',403);
 const draftId=id.parse(req.params.id),data=statusSchema.parse(req.body);
 const result=await transact(req.auth.pool,async conn=>{
  const d=await draft(conn,req,draftId,true);
  const commandParams={status:data.status,expectedVersion:data.expectedVersion,...(data.createNext?{createNext:true}:{})};
  const should=await command(conn,d,'CHANGE_STATUS',data.requestKey,commandParams);
  if(!should){
   if(data.createNext){
    const [[successor]]=await conn.execute('SELECT id FROM pos_drafts WHERE request_key=?',[data.requestKey]);
    if(!successor)throw bad('POS_HOLD_SUCCESSOR_MISSING',409);
    return {...await detail(conn,req,successor.id),heldDraftId:String(d.id)};
   }
   return detail(conn,req,d.id);
  }
  if(data.status==='DRAFT'&&d.status!=='HELD')throw bad('POS_ONLY_HELD_CAN_RESUME',409);
  if(data.status==='HELD'&&d.status!=='DRAFT')throw bad('POS_ONLY_DRAFT_CAN_HOLD',409);
  const shift=data.status!=='DISCARDED'?await activeShift(conn,req,d.branch_id,true):null;
  if(data.createNext&&String(shift.id)!==String(d.shift_id))throw bad('POS_ORIGINAL_SHIFT_CLOSED',409);
  await conn.execute('UPDATE pos_drafts SET status=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[data.status,d.id]);
  await log(conn,d.id,req.auth.user.id,data.status==='HELD'?'HOLD':data.status==='DRAFT'?'RESUME':'DISCARD',{oldStatus:d.status,status:data.status});
  if(data.status==='DISCARDED'&&d.table_id)await conn.execute('INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[d.table_id,req.auth.user.id,'RELEASE',JSON.stringify({draftId:String(d.id),reason:'DISCARDED'})]);
  if(data.createNext){
   // Hold and successor CREATE are one atomic tenant-database transaction.
   // The command UUID doubles as the successor's unique creation key, so retries
   // return the same empty order rather than creating duplicates.
   const [successor]=await conn.execute('INSERT INTO pos_drafts(request_key,branch_id,cashier_user_id,shift_id,order_scope) VALUES(?,?,?,?,?)',[data.requestKey,d.branch_id,req.auth.user.id,shift.id,'TAKE_AWAY']);
   await log(conn,successor.insertId,req.auth.user.id,'CREATE',{branchId:String(d.branch_id),shiftId:String(shift.id),scope:'TAKE_AWAY',afterHeldDraftId:String(d.id)});
   return {...await detail(conn,req,successor.insertId),heldDraftId:String(d.id)};
  }
  return detail(conn,req,d.id);
 });res.json(result);
}
const dateMalaysia=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const map=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${map.year}-${map.month}-${map.day}`;};
export async function quotePosDraft(req,res){
 const draftId=id.parse(req.params.id),query=quoteSchema.parse(req.body||{});
 if(query.discountCode&&query.voucherCode)throw bad('POS_STACKING_POLICY_NOT_APPROVED',409);
 const data=await detail(req.auth.pool,req,draftId);
 if(data.draft.status==='DISCARDED')throw bad('POS_DRAFT_DISCARDED',409);
 let discount={eligible:false,reason:'NONE_SELECTED',amount:'0.00'},voucher={eligible:false,reason:'NONE_SELECTED',discountAmount:'0.00'};
 if(query.discountCode){
  const [[d]]=await req.auth.pool.execute("SELECT d.*,DATE_FORMAT(d.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(d.end_date,'%Y-%m-%d') AS end_date FROM discounts d WHERE d.discount_code=? AND d.is_deleted=0 LIMIT 1",[query.discountCode]);
  if(!d)throw bad('POS_DISCOUNT_NOT_FOUND',404);
  const [targets]=await req.auth.pool.execute('SELECT product_id,category_id FROM discount_targets WHERE discount_id=?',[d.id]);
  const selected=data.lines.filter(line=>d.eligibility_type==='ALL'||(d.eligibility_type==='PRODUCT'?targets.some(t=>String(t.product_id)===String(line.product_id)):targets.some(t=>String(t.category_id)===String(line.category_id))));
  const eligible=selected.reduce((n,l)=>n+l.lineSen,0);
  discount=evaluateDiscount(d,{eligibleSubtotal:format(d.discount_scope==='ORDER'?data.subtotalSen:eligible),date:dateMalaysia(),usageCount:Number(d.usage_count),eligible:selected.length>0});
 }
 if(query.voucherCode){
  const [[v]]=await req.auth.pool.execute(`SELECT v.*,DATE_FORMAT(v.starts_at,'%Y-%m-%d %H:%i:%s') AS starts_at,DATE_FORMAT(v.ends_at,'%Y-%m-%d %H:%i:%s') AS ends_at FROM vouchers v WHERE v.voucher_code=? AND v.is_deleted=0 LIMIT 1`,[query.voucherCode]);
  if(!v)throw bad('POS_VOUCHER_NOT_FOUND',404);
  const [targets]=await req.auth.pool.execute('SELECT product_id,category_id FROM voucher_targets WHERE voucher_id=?',[v.id]);
  const [uses]=await req.auth.pool.execute("SELECT status,COUNT(*) AS n FROM voucher_reservations WHERE voucher_id=? AND status IN ('RESERVED','REDEEMED') GROUP BY status",[v.id]);
  const used=uses.reduce((sum,r)=>sum+Number(r.n),0);
  const [[clock]]=await req.auth.pool.execute("SELECT DATE_FORMAT(UTC_TIMESTAMP(6),'%Y-%m-%d %H:%i:%s') AS now");
  voucher=evaluateVoucher(v,{lines:data.lines.map(l=>({productId:l.product_id,categoryId:l.category_id,subtotal:l.lineTotal,active:true})),orderScope:data.draft.order_scope,now:clock.now,usedCount:used,customerRef:null,targetIds:targets.map(x=>String(x.product_id??x.category_id))});
 }
 // Read current tenant Product Master tax configuration; e-Invoice LHDN fields
 // are deliberately not used for SST. Neither this quote nor its tax calculation
 // changes a product, posts a sale, or consumes a voucher.
 const ids=[...new Set(data.lines.map(line=>String(line.product_id)))];
 const [taxRows]=ids.length?await req.auth.pool.execute(`SELECT id,jkdm_tax_type,jkdm_tax_rate,jkdm_tax_inclusive FROM products WHERE id IN (${ids.map(()=>'?').join(',')})`,ids):[[]];
 const taxes=new Map(taxRows.map(row=>[String(row.id),row]));
 const sstSettings=await readSstSettings(req.auth.pool);
 const merchantCharge=await readServiceChargeSettings(req.auth.pool);
 const [[companyProfile]]=await req.auth.pool.execute('SELECT business_type FROM company_profiles WHERE id=1');
 if(!companyProfile)throw bad('POS_TENANT_PROFILE_MISSING',409);
 const chargePolicy=serviceChargeForOrder(merchantCharge,{businessType:companyProfile.business_type,orderScope:data.draft.order_scope});
 if(taxes.size!==ids.length)throw bad('POS_PRODUCT_TAX_NOT_AVAILABLE',409);
 const discountSen=query.discountCode&&discount.eligible?amountSen(discount.amount):0;
 const voucherSen=query.voucherCode&&voucher.eligible?amountSen(voucher.discountAmount):0;
 const sst=summarizePosSst(sstSettings,data.lines,taxes);
 const bill=calculatePosBill(data.lines.map(line=>{
  const item=taxes.get(String(line.product_id));
  return {lineSen:line.lineSen,...applySstPolicy(item,sstSettings)};
 }),{discountSen,voucherSen,serviceChargeRate:chargePolicy.rate});
 return res.set('Cache-Control','no-store').json({draftId:String(draftId),draftVersion:data.draft.version,subtotal:data.subtotal,discount,voucher,bill,sst,serviceCharge:chargePolicy,provisionalAfterReduction:format(data.subtotalSen-discountSen-voucherSen),notPayable:true});
}
export async function posDraftAudit(req,res){
 const draftId=id.parse(req.params.id);await draft(req.auth.pool,req,draftId);
 const [logs]=await req.auth.pool.execute(`SELECT a.id,a.action_type,a.details,DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,u.full_name AS actor_name FROM pos_draft_audit_logs a JOIN users u ON u.id=a.actor_user_id WHERE a.draft_id=? ORDER BY a.id DESC LIMIT 300`,[draftId]);
 return res.set('Cache-Control','no-store').json({logs});
}

// R1 Dine In: assign an existing own DRAFT to a real restaurant table.
// Lock table FIRST, then draft to serialize two cashiers competing for one table.
// No sale/receipt/payment/stock posting; HELD retains table occupancy.
export async function assignPosTable(req,res){
 if(!has(req,'pos.cart.manage'))throw bad('POS_WRITE_DENIED',403);
 if(!['RESTAURANT','CAFE'].includes(req.auth.company.business_type))throw bad('POS_DINE_IN_NOT_APPLICABLE',403);
 const draftId=id.parse(req.params.id),data=assignSchema.parse(req.body);
 const result=await transact(req.auth.pool,async conn=>{
  // Reading branch before locking lets us lock table first, then draft, consistently.
  const [[reference]]=await conn.execute('SELECT branch_id,cashier_user_id,table_id FROM pos_drafts WHERE id=?',[draftId]);
  if(!reference)throw bad('POS_DRAFT_NOT_FOUND',404);
  if(String(reference.cashier_user_id)!==String(req.auth.user.id))throw bad('POS_DRAFT_NOT_OWNED',403);
  access(req,reference.branch_id);
  const tableIds=[reference.table_id,data.tableId].filter(Boolean).map(Number).sort((a,b)=>a-b);
  const lockedTables=new Map();
  for(const t of new Set(tableIds)){const [[table]]=await conn.execute('SELECT * FROM restaurant_tables WHERE id=? AND is_deleted=0 FOR UPDATE',[t]);if(table)lockedTables.set(t,table);}
  const d=await draft(conn,req,draftId,true);
  const should=await command(conn,d,'ASSIGN_TABLE',data.requestKey,{tableId:data.tableId,expectedVersion:data.expectedVersion});
  if(!should)return detail(conn,req,d.id);
  await ensureEditable(conn,req,d);
  if(data.tableId!==null){
   const table=lockedTables.get(data.tableId);
   if(!table||String(table.branch_id)!==String(d.branch_id))throw bad('POS_TABLE_NOT_IN_BRANCH',409);
   if(table.status!=='ACTIVE'||table.table_status!=='AVAILABLE')throw bad('POS_TABLE_NOT_AVAILABLE',409);
   const [[occupied]]=await conn.execute('SELECT id,cashier_user_id FROM pos_drafts WHERE active_table_id=? AND id<>? LIMIT 1',[table.id,d.id]);
   if(occupied)throw bad('POS_TABLE_OCCUPIED',409);
  }
  const prior=d.table_id;
  await conn.execute('UPDATE pos_drafts SET table_id=?,order_scope=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?',[data.tableId,data.tableId===null?'TAKE_AWAY':'DINE_IN',d.id]);
  if(prior&&String(prior)!==String(data.tableId))await conn.execute('INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[prior,req.auth.user.id,'RELEASE',JSON.stringify({draftId:String(d.id),reason:'REASSIGN'})]);
  if(data.tableId&&String(prior)!==String(data.tableId))await conn.execute('INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[data.tableId,req.auth.user.id,'ASSIGN',JSON.stringify({draftId:String(d.id),shiftId:String(d.shift_id)})]);
  await log(conn,d.id,req.auth.user.id,'ASSIGN_TABLE',{tableId:data.tableId,previousTableId:prior});
  return detail(conn,req,d.id);
 });res.set('Cache-Control','no-store').json(result);
}
