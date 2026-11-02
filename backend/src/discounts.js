import { z } from 'zod';
import { parseDiscountCsv } from './discounts-csv.js';
import { evaluateDiscount } from './discount-evaluation.js';
import {generateDiscountCode} from './discount-code.js';

const failure=(code,status=400)=>Object.assign(new Error(code),{status});
const positive=z.coerce.number().int().positive();
const money=z.coerce.number().finite().min(0).max(99999999.99);
const date=z.union([z.iso.date(),z.null()]).optional().default(null);
const discountCode=z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{1,49}$/);
export const discountSchema=z.object({
 discountCode,discountName:z.string().trim().min(2).max(160),description:z.string().trim().max(1000).default(''),
 discountType:z.enum(['PERCENTAGE','FIXED_AMOUNT']),discountScope:z.enum(['ORDER','ITEM']),
 eligibilityType:z.enum(['ALL','CATEGORY','PRODUCT']).default('ALL'),
 targetIds:z.array(positive).max(200).default([]),
 discountValue:money.positive(),minimumSpend:money.default(0),maximumDiscountAmount:z.union([money.positive(),z.null()]).optional().default(null),
 startDate:date,endDate:date,usageLimit:z.union([positive.max(1000000000),z.null()]).optional().default(null),
 sortOrder:z.coerce.number().int().min(-100000).max(100000).default(0),status:z.enum(['ACTIVE','INACTIVE']).default('ACTIVE')
}).strict().superRefine((d,ctx)=>{
 if(d.discountType==='PERCENTAGE'&&d.discountValue>100)ctx.addIssue({code:'custom',path:['discountValue'],message:'PERCENT_OVER_100'});
 if(d.startDate&&d.endDate&&d.endDate<d.startDate)ctx.addIssue({code:'custom',path:['endDate'],message:'END_BEFORE_START'});
 if(d.eligibilityType==='ALL'&&d.targetIds.length)ctx.addIssue({code:'custom',path:['targetIds'],message:'ALL_MUST_HAVE_NO_TARGETS'});
 if(d.eligibilityType!=='ALL'&&!d.targetIds.length)ctx.addIssue({code:'custom',path:['targetIds'],message:'TARGETS_REQUIRED'});
 if(new Set(d.targetIds.map(String)).size!==d.targetIds.length)ctx.addIssue({code:'custom',path:['targetIds'],message:'DUPLICATE_TARGET'});
 if(d.discountScope==='ORDER'&&d.eligibilityType!=='ALL')ctx.addIssue({code:'custom',path:['eligibilityType'],message:'TARGETING_REQUIRES_ITEM_SCOPE'});
 for(const key of ['discountValue','minimumSpend','maximumDiscountAmount']){const v=d[key];if(v!=null&&Math.abs(Math.round(v*100)-v*100)>1e-7)ctx.addIssue({code:'custom',path:[key],message:'TWO_DECIMALS_ONLY'});}
});
const listSelect=`SELECT d.*,COALESCE(u.full_name,u.username) AS updated_by_name FROM discounts d JOIN users u ON u.id=d.updated_by WHERE d.is_deleted=0`;
const getRow=async(conn,id,lock=false)=>{const [[row]]=await conn.execute(`${listSelect} AND d.id=?${lock?' FOR UPDATE':''}`,[id]);return row;};
const obj=row=>({...row,id:String(row.id),created_by:String(row.created_by),updated_by:String(row.updated_by),usage_count:Number(row.usage_count),usage_limit:row.usage_limit==null?null:Number(row.usage_limit)});
const snapshot=(r,targets)=>({...r,targets});
async function transaction(pool,callback){const conn=await pool.getConnection();try{await conn.beginTransaction();const result=await callback(conn);await conn.commit();return result;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
async function audit(conn,id,actor,action,before,after){await conn.execute('INSERT INTO discount_audit_logs(discount_id,actor_user_id,action_type,previous_data,next_data) VALUES(?,?,?,?,?)',[id,actor,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);}
async function targetRows(conn,id){const [rows]=await conn.execute(`SELECT dt.category_id,dt.product_id,c.category_name,p.sku,p.product_name,c.status AS category_status,c.is_deleted AS category_deleted,p.status AS product_status,p.is_deleted AS product_deleted FROM discount_targets dt LEFT JOIN categories c ON c.id=dt.category_id LEFT JOIN products p ON p.id=dt.product_id WHERE dt.discount_id=? ORDER BY dt.id`,[id]);return rows.map(r=>({id:String(r.category_id??r.product_id),name:r.category_name??r.product_name??'Archived target',code:r.sku||r.category_name||'',active:r.category_id==null?(r.product_status==='ACTIVE'&&!r.product_deleted):(r.category_status==='ACTIVE'&&!r.category_deleted),type:r.category_id==null?'PRODUCT':'CATEGORY'}));}
async function enrich(pool,rows){if(!rows.length)return [];const ids=rows.map(r=>r.id);const placeholders=ids.map(()=>'?').join(',');const [targets]=await pool.execute(`SELECT dt.discount_id,dt.category_id,dt.product_id,c.category_name,p.sku,p.product_name,c.status AS category_status,c.is_deleted AS category_deleted,p.status AS product_status,p.is_deleted AS product_deleted FROM discount_targets dt LEFT JOIN categories c ON c.id=dt.category_id LEFT JOIN products p ON p.id=dt.product_id WHERE dt.discount_id IN (${placeholders}) ORDER BY dt.id`,ids);const byId=new Map();for(const r of targets){const key=String(r.discount_id);if(!byId.has(key))byId.set(key,[]);byId.get(key).push({id:String(r.category_id??r.product_id),name:r.category_name??r.product_name??'Archived target',code:r.sku||r.category_name||'',active:r.category_id==null?(r.product_status==='ACTIVE'&&!r.product_deleted):(r.category_status==='ACTIVE'&&!r.category_deleted),type:r.category_id==null?'PRODUCT':'CATEGORY'});}return rows.map(r=>({...obj(r),targets:byId.get(String(r.id))||[]}));}
async function validateTargets(conn,data){if(data.eligibilityType==='ALL')return;const table=data.eligibilityType==='CATEGORY'?'categories':'products';const placeholders=data.targetIds.map(()=>'?').join(',');const [rows]=await conn.execute(`SELECT id FROM ${table} WHERE id IN (${placeholders}) AND status='ACTIVE' AND is_deleted=0`,data.targetIds);if(rows.length!==data.targetIds.length)throw failure('TARGET_NOT_ACTIVE_OR_MISSING');}
async function writeTargets(conn,id,data){await conn.execute('DELETE FROM discount_targets WHERE discount_id=?',[id]);if(data.eligibilityType==='ALL')return;for(const target of data.targetIds)await conn.execute('INSERT INTO discount_targets(discount_id,category_id,product_id) VALUES(?,?,?)',[id,data.eligibilityType==='CATEGORY'?target:null,data.eligibilityType==='PRODUCT'?target:null]);}
const fields=['discount_code','discount_name','description','discount_type','discount_scope','eligibility_type','discount_value','minimum_spend','maximum_discount_amount','start_date','end_date','usage_limit','sort_order','status'];
const values=data=>[data.discountCode,data.discountName,data.description||null,data.discountType,data.discountScope,data.eligibilityType,data.discountValue,data.minimumSpend,data.maximumDiscountAmount,data.startDate,data.endDate,data.usageLimit,data.sortOrder,data.status];
async function insertDiscount(conn,data,actor,action='DISCOUNT_CREATE'){
 await validateTargets(conn,data);
 const [result]=await conn.execute(`INSERT INTO discounts(${fields.join(',')},created_by,updated_by) VALUES(${fields.map(()=>'?').join(',')},?,?)`,[...values(data),actor,actor]);
 const id=result.insertId;await writeTargets(conn,id,data);await audit(conn,id,actor,action,null,data);return {id:String(id)};
}
function dbError(res,e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'DISCOUNT_CODE_DUPLICATE'});throw e;}
export async function listDiscounts(req,res){const [rows]=await req.auth.pool.execute(`${listSelect} ORDER BY d.sort_order ASC,d.id ASC LIMIT 5000`);return res.json({discounts:await enrich(req.auth.pool,rows)});}
export const exportDiscounts=listDiscounts;
export async function discountMeta(req,res){const [categories,products]=await Promise.all([req.auth.pool.execute("SELECT id,category_name FROM categories WHERE status='ACTIVE' AND is_deleted=0 ORDER BY category_name"),req.auth.pool.execute("SELECT id,sku,product_name FROM products WHERE status='ACTIVE' AND is_deleted=0 ORDER BY product_name LIMIT 5000")]);return res.json({categories:categories[0].map(r=>({...r,id:String(r.id)})),products:products[0].map(r=>({...r,id:String(r.id)}))});}
// Discount codes are non-bearer rule identifiers. Batch creation is atomic per tenant.
export async function createDiscount(req,res){
 const body=z.object({discountCode:z.string().trim().optional(),generateQuantity:z.coerce.number().int().min(1).max(200).default(1)}).passthrough().parse(req.body);
 if(body.discountCode)throw failure('DISCOUNT_CODE_AUTO_GENERATED');
 const {discountCode:ignored,generateQuantity,...fieldsOnly}=body;
 const template=discountSchema.parse({...fieldsOnly,discountCode:'DSC-VALIDATIONONLY'});
 try{
  const created=await transaction(req.auth.pool,async conn=>{
   // Validate all targets before first insert; rollback protects the entire batch.
   await validateTargets(conn,template);
   const result=[];
   for(let index=0;index<generateQuantity;index++){
    let createdRow;
    for(let attempt=0;attempt<5;attempt++){
     const data={...template,discountCode:generateDiscountCode()};
     try{createdRow=await insertDiscount(conn,data,req.auth.user.id);result.push({...createdRow,discountCode:data.discountCode});break;}
     catch(e){if(e.code==='ER_DUP_ENTRY'&&attempt<4)continue;throw e;}
    }
   }
   return result;
  });
  return res.status(201).json({message:created.length===1?'DISCOUNT_CREATED':'DISCOUNTS_CREATED',id:created[0].id,discountCode:created[0].discountCode,count:created.length,discountCodes:created.map(r=>r.discountCode)});
 }catch(e){return dbError(res,e);}
}

export async function updateDiscount(req,res){const id=positive.parse(req.params.id),data=discountSchema.parse(req.body);try{await transaction(req.auth.pool,async conn=>{const before=await getRow(conn,id,true);if(!before)throw failure('DISCOUNT_NOT_FOUND',404);if(data.discountCode!==before.discount_code)throw failure('DISCOUNT_CODE_IMMUTABLE',409);if(data.usageLimit!=null&&Number(before.usage_count)>data.usageLimit)throw failure('USAGE_LIMIT_BELOW_REDEMPTIONS');if(Number(before.usage_count)>0&&(data.discountCode!==before.discount_code||data.discountType!==before.discount_type||data.discountScope!==before.discount_scope))throw failure('DISCOUNT_ALREADY_USED_LOCKED');await validateTargets(conn,data);const previousTargets=await targetRows(conn,id);await conn.execute(`UPDATE discounts SET ${fields.map(f=>`${f}=?`).join(',')},updated_by=? WHERE id=? AND is_deleted=0`,[...values(data),req.auth.user.id,id]);await writeTargets(conn,id,data);await audit(conn,id,req.auth.user.id,'DISCOUNT_UPDATE',snapshot(obj(before),previousTargets),data);});return res.json({message:'DISCOUNT_UPDATED'});}catch(e){return dbError(res,e);}}
export async function discountStatus(req,res){const id=positive.parse(req.params.id),{status}=z.object({status:z.enum(['ACTIVE','INACTIVE'])}).strict().parse(req.body);await transaction(req.auth.pool,async conn=>{const before=await getRow(conn,id,true);if(!before)throw failure('DISCOUNT_NOT_FOUND',404);if(before.status===status)return;await conn.execute('UPDATE discounts SET status=?,updated_by=? WHERE id=?',[status,req.auth.user.id,id]);await audit(conn,id,req.auth.user.id,status==='ACTIVE'?'DISCOUNT_ACTIVATE':'DISCOUNT_DEACTIVATE',{status:before.status},{status});});return res.json({message:'DISCOUNT_STATUS_UPDATED'});}
export async function archiveDiscount(req,res){const id=positive.parse(req.params.id);await transaction(req.auth.pool,async conn=>{const before=await getRow(conn,id,true);if(!before)throw failure('DISCOUNT_NOT_FOUND',404);await conn.execute("UPDATE discounts SET status='INACTIVE',is_deleted=1,updated_by=? WHERE id=?",[req.auth.user.id,id]);await audit(conn,id,req.auth.user.id,'DISCOUNT_ARCHIVE',{status:before.status},{archived:true});});return res.json({message:'DISCOUNT_ARCHIVED'});}
const printSize=z.object({widthCm:z.coerce.number().min(5).max(30),heightCm:z.coerce.number().min(3).max(20)}).strict().refine(v=>[v.widthCm,v.heightCm].every(n=>Math.abs(n*100-Math.round(n*100))<1e-7),'TWO_DECIMALS_ONLY');
export async function discountPrintSettings(req,res){
 const [[row]]=await req.auth.pool.execute('SELECT width_cm,height_cm FROM discount_print_settings WHERE id=1');
 if(!row)throw failure('DISCOUNT_PRINT_SETTINGS_NOT_INSTALLED',503);
 return res.json({widthCm:String(row.width_cm),heightCm:String(row.height_cm)});
}
export async function saveDiscountPrintSettings(req,res){
 const {widthCm,heightCm}=printSize.parse(req.body);
 await transaction(req.auth.pool,async conn=>{
  const [[before]]=await conn.execute('SELECT width_cm,height_cm FROM discount_print_settings WHERE id=1 FOR UPDATE');
  if(!before)throw failure('DISCOUNT_PRINT_SETTINGS_NOT_INSTALLED',503);
  await conn.execute('UPDATE discount_print_settings SET width_cm=?,height_cm=?,updated_by=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=1',[widthCm,heightCm,req.auth.user.id]);
  await conn.execute('INSERT INTO discount_print_settings_audit(actor_user_id,previous_data,next_data) VALUES(?,?,?)',[req.auth.user.id,JSON.stringify(before),JSON.stringify({widthCm,heightCm})]);
 });
 return res.json({message:'DISCOUNT_PRINT_SETTINGS_UPDATED'});
}
export async function discountAudit(req,res){const [rows]=await req.auth.pool.execute(`SELECT a.id,a.discount_id,d.discount_code,d.discount_name,a.action_type,a.previous_data,a.next_data,a.created_at,COALESCE(u.full_name,u.username) AS user_name FROM discount_audit_logs a JOIN discounts d ON d.id=a.discount_id JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 300`);return res.json({logs:rows.map(r=>({...r,id:String(r.id),discount_id:String(r.discount_id)}))});}
async function resolveCodes(conn,data){
 if(data.eligibilityType==='ALL'){if(data.targetCodes.length)throw failure('ALL_MUST_HAVE_NO_TARGETS');const {targetCodes,...rest}=data;return {...rest,targetIds:[]};}
 if(data.targetCodes.length<1||data.targetCodes.length>200)throw failure('TARGETS_REQUIRED');
 const type=data.eligibilityType;
 const [rows]=await conn.execute(type==='PRODUCT'?"SELECT id,sku AS code FROM products WHERE status='ACTIVE' AND is_deleted=0 AND sku IS NOT NULL":"SELECT id,category_name AS code FROM categories WHERE status='ACTIVE' AND is_deleted=0");
 const byCode=new Map(rows.map(r=>[String(r.code).trim().toLowerCase(),Number(r.id)]));
 const ids=data.targetCodes.map(code=>byCode.get(code.toLowerCase()));
 if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw failure('CSV_TARGET_NOT_FOUND_OR_DUPLICATE');
 const {targetCodes,...rest}=data;return {...rest,targetIds:ids};
}
async function csvValidations(pool,csv){const rows=parseDiscountCsv(csv);const conn=await pool.getConnection();try{const checked=[];for(const row of rows){if(row.error){checked.push(row);continue;}try{
    const data=await resolveCodes(conn,row.data);
    // Validate all rule fields with a temporary identifier, but never import it.
    // Blank CSV code is intentional and will be generated only on Confirm.
    const parsed=discountSchema.parse({...data,discountCode:data.discountCode||'DSC-PREVIEWONLY'});
    checked.push({line:row.line,data:{...parsed,discountCode:data.discountCode||''}});
   }catch(e){checked.push({line:row.line,error:e.issues?e.issues.map(i=>i.message).join('; '):e.message});}}return checked;}finally{conn.release();}}
const csvRequest=z.object({csv:z.string().max(1024*1024)}).strict();
export async function previewDiscountImport(req,res){
 const {csv}=csvRequest.parse(req.body),rows=await csvValidations(req.auth.pool,csv);
 const [existing]=await req.auth.pool.execute('SELECT discount_code FROM discounts');
 const registered=new Set(existing.map(x=>String(x.discount_code).toUpperCase()));
 const output=rows.map(row=>row.error?row:row.data.discountCode&&registered.has(row.data.discountCode)?{line:row.line,code:row.data.discountCode,name:row.data.discountName,error:'DISCOUNT_CODE_DUPLICATE'}:row);
 return res.json({count:output.length,valid:output.every(r=>!r.error),rows:output.map(r=>({line:r.line,error:r.error||'',code:r.code||r.data?.discountCode||'AUTO-GENERATED',name:r.name||r.data?.discountName||''}))});
}
export async function importDiscounts(req,res){
 const {csv}=csvRequest.parse(req.body),rows=await csvValidations(req.auth.pool,csv);
 if(rows.some(r=>r.error))throw failure('CSV_VALIDATION_FAILED');
 try{
  const imported=await transaction(req.auth.pool,async conn=>{
   const codes=[];let generatedCount=0;
   // No database changes are committed until every row, targets and audit succeeds.
   for(const row of rows){
    let data=row.data;
    if(!data.discountCode){
     let inserted=false;
     for(let attempt=0;attempt<5;attempt++){
      data={...row.data,discountCode:generateDiscountCode()};
      try{await insertDiscount(conn,data,req.auth.user.id,'DISCOUNT_IMPORT');inserted=true;break;}
      catch(e){if(e.code==='ER_DUP_ENTRY'&&attempt<4)continue;throw e;}
     }
     if(!inserted)throw failure('DISCOUNT_CODE_GENERATION_FAILED',409);
     generatedCount++;
    }else{
     // Preserve an explicitly supplied legacy rule code, as Voucher Import does.
     await insertDiscount(conn,data,req.auth.user.id,'DISCOUNT_IMPORT');
    }
    codes.push(data.discountCode);
   }
   return {count:codes.length,generatedCount};
  });
  return res.status(201).json({...imported,message:'DISCOUNTS_IMPORTED'});
 }catch(e){return dbError(res,e);}
}
// Read-only calculator for Discount Master. Optional usage count is a WHAT-IF scenario,
// never a redemption. The actual database usage_count is not written or overridden.
export async function previewDiscountCalculation(req,res){
 const id=positive.parse(req.params.id);
 const {eligibleSubtotal,productId=null,simulatedUsageCount=null}=z.object({
  eligibleSubtotal:money,productId:positive.nullable().optional(),
  simulatedUsageCount:z.number().int().min(0).max(1000000000).nullable().optional()
 }).strict().parse(req.body);
 const row=await getRow(req.auth.pool,id);
 if(!row)throw failure('DISCOUNT_NOT_FOUND',404);
 const targets=await targetRows(req.auth.pool,id);
 let product=null;
 if(productId!=null){
  const [[match]]=await req.auth.pool.execute('SELECT id,category_id,status,is_deleted FROM products WHERE id=?',[productId]);
  if(match&&match.status==='ACTIVE'&&!match.is_deleted)product=match;
 }
 const eligible=row.eligibility_type==='ALL'||(product!==null&&targets.some(t=>t.active&&(
  (row.eligibility_type==='PRODUCT'&&t.id===String(product.id))||
  (row.eligibility_type==='CATEGORY'&&t.id===String(product.category_id))
 )));
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=type=>parts.find(p=>p.type===type)?.value;
 const date=`${part('year')}-${part('month')}-${part('day')}`;
 const actualUsageCount=Number(row.usage_count);
 const evaluationUsageCount=simulatedUsageCount??actualUsageCount;
 return res.json({
  preview:true,posting:false,simulation:simulatedUsageCount!==null,
  date,actualUsageCount,evaluationUsageCount,usageLimit:row.usage_limit==null?null:Number(row.usage_limit),
  ...evaluateDiscount(row,{eligibleSubtotal,date,usageCount:evaluationUsageCount,eligible})
 });
}
