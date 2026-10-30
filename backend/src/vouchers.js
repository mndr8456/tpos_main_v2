import {z} from 'zod';
import {generateVoucherCode} from './voucher-code.js';
import {evaluateVoucher} from './voucher-evaluation.js';
import {parseVoucherCsv,voucherCsvTemplate,VOUCHER_CSV_HEADERS,csvEscapeVoucher} from './vouchers-csv.js';

const problem=(message,status=400)=>Object.assign(new Error(message),{status});
const id=z.coerce.number().int().positive();
const money=z.coerce.number().finite().min(0).max(99999999.99);
const positiveMoney=money.positive().refine(n=>Math.abs(n*100-Math.round(n*100))<1e-7,'TWO_DECIMALS_ONLY');
const amount=money.refine(n=>Math.abs(n*100-Math.round(n*100))<1e-7,'TWO_DECIMALS_ONLY');
const dateTime=z.string().regex(/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d(?::\d\d)?$/).transform(s=>s.replace('T',' ').padEnd(19,':00')).refine(v=>{
 const [date,time]=v.split(' '),[year,month,day]=date.split('-').map(Number),[hour,minute,second]=time.split(':').map(Number);
 const d=new Date(Date.UTC(year,month-1,day,hour,minute,second));
 return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day&&d.getUTCHours()===hour&&d.getUTCMinutes()===minute&&d.getUTCSeconds()===second;
},'INVALID_DATETIME');
const code=z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{3,63}$/);
export const voucherSchema=z.object({
 voucherCode:code,voucherName:z.string().trim().min(2).max(160),description:z.string().trim().max(1000).default(''),
 discountType:z.enum(['PERCENTAGE','FIXED_AMOUNT']),discountValue:positiveMoney,
 minimumSpend:amount.default(0),maximumDiscount:positiveMoney.nullable().optional().default(null),
 startsAt:dateTime,endsAt:dateTime,orderScope:z.enum(['BOTH','DINE_IN','TAKE_AWAY']).default('BOTH'),
 eligibilityType:z.enum(['ALL','CATEGORY','PRODUCT']).default('ALL'),targetIds:z.array(id).max(200).default([]),
 usageLimit:id.max(1000000000).nullable().optional().default(null),perCustomerLimit:id.max(1000000000).nullable().optional().default(null),
 status:z.enum(['ACTIVE','INACTIVE']).default('INACTIVE')
}).strict().superRefine((v,ctx)=>{
 if(v.endsAt<=v.startsAt)ctx.addIssue({code:'custom',message:'END_MUST_FOLLOW_START',path:['endsAt']});
 if(v.discountType==='PERCENTAGE'&&v.discountValue>100)ctx.addIssue({code:'custom',message:'PERCENT_OVER_100',path:['discountValue']});
 if((v.eligibilityType==='ALL'&&v.targetIds.length)||(v.eligibilityType!=='ALL'&&!v.targetIds.length))ctx.addIssue({code:'custom',message:'INVALID_ELIGIBILITY_TARGETS',path:['targetIds']});
 if(new Set(v.targetIds.map(String)).size!==v.targetIds.length)ctx.addIssue({code:'custom',message:'DUPLICATE_TARGETS',path:['targetIds']});
});
const select=`SELECT v.*,COALESCE(u.full_name,u.username) AS updated_by_name FROM vouchers v JOIN users u ON u.id=v.updated_by WHERE v.is_deleted=0`;
const snapshot=r=>({...r,id:String(r.id),created_by:String(r.created_by),updated_by:String(r.updated_by)});
async function tx(pool,callback){const conn=await pool.getConnection();try{await conn.beginTransaction();const result=await callback(conn);await conn.commit();return result;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
async function audit(conn,voucherId,actor,action,previous,next){await conn.execute('INSERT INTO voucher_audit_logs(voucher_id,actor_user_id,action_type,previous_data,next_data) VALUES(?,?,?,?,?)',[voucherId,actor,action,previous?JSON.stringify(previous):null,next?JSON.stringify(next):null]);}
async function get(conn,voucherId,lock=false){const [[row]]=await conn.execute(`${select} AND v.id=?${lock?' FOR UPDATE':''}`,[voucherId]);return row;}
async function getTargets(conn,voucherId){const [rows]=await conn.execute('SELECT product_id,category_id FROM voucher_targets WHERE voucher_id=?',[voucherId]);return rows.map(r=>String(r.product_id??r.category_id));}
async function writeTargets(conn,voucherId,data){
 await conn.execute('DELETE FROM voucher_targets WHERE voucher_id=?',[voucherId]);
 if(data.eligibilityType==='ALL')return;
 const table=data.eligibilityType==='CATEGORY'?'categories':'products',marks=data.targetIds.map(()=>'?').join(',');
 const [matches]=await conn.execute(`SELECT id FROM ${table} WHERE id IN (${marks}) AND status='ACTIVE' AND is_deleted=0`,data.targetIds);
 if(matches.length!==data.targetIds.length)throw problem('INACTIVE_OR_MISSING_TARGET');
 for(const target of data.targetIds)await conn.execute('INSERT INTO voucher_targets(voucher_id,product_id,category_id) VALUES(?,?,?)',[voucherId,data.eligibilityType==='PRODUCT'?target:null,data.eligibilityType==='CATEGORY'?target:null]);
}
const fields=['voucher_code','voucher_name','description','discount_type','discount_value','minimum_spend','maximum_discount','starts_at','ends_at','order_scope','eligibility_type','usage_limit','per_customer_limit','status'];
const values=v=>[v.voucherCode,v.voucherName,v.description||null,v.discountType,v.discountValue,v.minimumSpend,v.maximumDiscount,v.startsAt,v.endsAt,v.orderScope,v.eligibilityType,v.usageLimit,v.perCustomerLimit,v.status];
const dbError=(res,e)=>{if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'VOUCHER_CODE_DUPLICATE'});throw e;};
export async function listVouchers(req,res){
 const [rows]=await req.auth.pool.execute(`${select} ORDER BY v.id DESC LIMIT 2000`);
 if(!rows.length)return res.json({vouchers:[]});
 const ids=rows.map(r=>r.id),marks=ids.map(()=>'?').join(',');
 const [targets,counts]=await Promise.all([
  req.auth.pool.execute(`SELECT voucher_id,product_id,category_id FROM voucher_targets WHERE voucher_id IN (${marks})`,ids),
  req.auth.pool.execute(`SELECT voucher_id,status,COUNT(*) AS total FROM voucher_reservations WHERE voucher_id IN (${marks}) AND status IN ('RESERVED','REDEEMED') GROUP BY voucher_id,status`,ids)
 ]);
 const targetMap=new Map(),countMap=new Map();
 for(const t of targets[0]){const k=String(t.voucher_id);if(!targetMap.has(k))targetMap.set(k,[]);targetMap.get(k).push(String(t.product_id??t.category_id));}
 for(const c of counts[0]){const k=String(c.voucher_id);if(!countMap.has(k))countMap.set(k,{reservedCount:0,redeemedCount:0});countMap.get(k)[c.status==='RESERVED'?'reservedCount':'redeemedCount']=Number(c.total);}
 return res.json({vouchers:rows.map(r=>({...snapshot(r),targetIds:targetMap.get(String(r.id))||[],...(countMap.get(String(r.id))||{reservedCount:0,redeemedCount:0})}))});
}
export async function voucherMeta(req,res){const [categories,products]=await Promise.all([req.auth.pool.execute("SELECT id,category_name FROM categories WHERE status='ACTIVE' AND is_deleted=0 ORDER BY category_name"),req.auth.pool.execute("SELECT id,sku,product_name FROM products WHERE status='ACTIVE' AND is_deleted=0 ORDER BY product_name LIMIT 5000")]);return res.json({categories:categories[0].map(x=>({...x,id:String(x.id)})),products:products[0].map(x=>({...x,id:String(x.id)}))});}
// Create one or many independent voucher bearer codes in ONE tenant transaction.
// Each record receives its own code, targets and immutable audit entry.
export async function createVoucher(req,res){
 const body=z.object({voucherCode:z.string().trim().optional(),generateQuantity:z.coerce.number().int().min(1).max(200).default(1)}).passthrough().parse(req.body);
 if(body.voucherCode)throw problem('VOUCHER_CODE_AUTO_GENERATED');
 const {generateQuantity,voucherCode,...fieldsOnly}=body;
 const parsed=voucherSchema.parse({...fieldsOnly,voucherCode:'VCH-VALIDATIONONLY'});
 // Bulk-issued bearer codes default to one redemption each, unless explicitly configured otherwise.
 const template=generateQuantity>1&&parsed.usageLimit==null?{...parsed,usageLimit:1}:parsed;
 try{
  const result=await tx(req.auth.pool,async conn=>{
   const created=[];
   for(let index=0;index<generateQuantity;index++){
    let insert=null,data=null;
    for(let attempt=0;attempt<5;attempt++){
     data={...template,voucherCode:generateVoucherCode()};
     try{[insert]=await conn.execute(`INSERT INTO vouchers(${fields.join(',')},created_by,updated_by) VALUES(${fields.map(()=>'?').join(',')},?,?)`,[...values(data),req.auth.user.id,req.auth.user.id]);break;}
     catch(e){if(e.code==='ER_DUP_ENTRY'&&attempt<4)continue;throw e;}
    }
    await writeTargets(conn,insert.insertId,data);
    await audit(conn,insert.insertId,req.auth.user.id,'VOUCHER_CREATE',null,data);
    created.push({id:String(insert.insertId),voucherCode:data.voucherCode});
   }
   return created;
  });
  return res.status(201).json({id:result[0].id,voucherCode:result[0].voucherCode,count:result.length,voucherCodes:result.map(x=>x.voucherCode),message:result.length===1?'VOUCHER_CREATED':'VOUCHERS_CREATED'});
 }catch(e){return dbError(res,e);}
}
export async function updateVoucher(req,res){const voucherId=id.parse(req.params.id),data=voucherSchema.parse(req.body);try{await tx(req.auth.pool,async conn=>{
 const before=await get(conn,voucherId,true);if(!before)throw problem('VOUCHER_NOT_FOUND',404);
 if(data.voucherCode!==before.voucher_code)throw problem('VOUCHER_CODE_IMMUTABLE',409);
 const [[usage]]=await conn.execute('SELECT id FROM voucher_reservations WHERE voucher_id=? LIMIT 1',[voucherId]);
 if(usage)throw problem('VOUCHER_LOCKED_AFTER_RESERVATION',409);
 await writeTargets(conn,voucherId,data);
 await conn.execute(`UPDATE vouchers SET ${fields.map(f=>`${f}=?`).join(',')},updated_by=? WHERE id=?`,[...values(data),req.auth.user.id,voucherId]);
 await audit(conn,voucherId,req.auth.user.id,'VOUCHER_UPDATE',snapshot(before),data);
 });return res.json({message:'VOUCHER_UPDATED'});}catch(e){return dbError(res,e);}}
export async function voucherStatus(req,res){const voucherId=id.parse(req.params.id),{status}=z.object({status:z.enum(['ACTIVE','INACTIVE'])}).strict().parse(req.body);
 await tx(req.auth.pool,async conn=>{const before=await get(conn,voucherId,true);if(!before)throw problem('VOUCHER_NOT_FOUND',404);if(before.status===status)return;await conn.execute('UPDATE vouchers SET status=?,updated_by=? WHERE id=?',[status,req.auth.user.id,voucherId]);await audit(conn,voucherId,req.auth.user.id,'VOUCHER_STATUS',{status:before.status},{status});});return res.json({message:'VOUCHER_STATUS_UPDATED'});}
export async function archiveVoucher(req,res){const voucherId=id.parse(req.params.id);await tx(req.auth.pool,async conn=>{
 const before=await get(conn,voucherId,true);if(!before)throw problem('VOUCHER_NOT_FOUND',404);
 const [[reservation]]=await conn.execute("SELECT id FROM voucher_reservations WHERE voucher_id=? AND status='RESERVED' LIMIT 1",[voucherId]);if(reservation)throw problem('VOUCHER_HAS_ACTIVE_RESERVATION',409);
 await conn.execute("UPDATE vouchers SET status='INACTIVE',is_deleted=1,updated_by=? WHERE id=?",[req.auth.user.id,voucherId]);await audit(conn,voucherId,req.auth.user.id,'VOUCHER_ARCHIVE',{status:before.status},{archived:true});});return res.json({message:'VOUCHER_ARCHIVED'});}
export async function voucherAudit(req,res){const [rows]=await req.auth.pool.execute('SELECT a.id,a.action_type,a.created_at,a.voucher_id,v.voucher_code,v.voucher_name,a.reservation_id,COALESCE(u.full_name,u.username) AS user_name FROM voucher_audit_logs a LEFT JOIN vouchers v ON v.id=a.voucher_id JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 300');return res.json({logs:rows.map(r=>({...r,id:String(r.id),voucher_id:r.voucher_id==null?null:String(r.voucher_id)}))});}
export async function voucherPrintSettings(req,res){const [[row]]=await req.auth.pool.execute('SELECT width_cm,height_cm FROM voucher_print_settings WHERE id=1');return res.json({widthCm:String(row?.width_cm||'18.55'),heightCm:String(row?.height_cm||'8.45')});}
export async function saveVoucherPrintSettings(req,res){const {widthCm,heightCm}=z.object({widthCm:z.coerce.number().min(5).max(30),heightCm:z.coerce.number().min(3).max(20)}).strict().refine(v=>[v.widthCm,v.heightCm].every(n=>Math.abs(n*100-Math.round(n*100))<1e-7),'TWO_DECIMALS_ONLY').parse(req.body);
 await tx(req.auth.pool,async conn=>{const [[before]]=await conn.execute('SELECT width_cm,height_cm FROM voucher_print_settings WHERE id=1 FOR UPDATE');await conn.execute('UPDATE voucher_print_settings SET width_cm=?,height_cm=?,updated_by=? WHERE id=1',[widthCm,heightCm,req.auth.user.id]);await audit(conn,null,req.auth.user.id,'VOUCHER_PRINT_SETTINGS',before,{widthCm,heightCm});});return res.json({message:'VOUCHER_PRINT_SETTINGS_UPDATED'});}
// Read-only preview uses active tenant product prices, not user-submitted price/subtotal.
// NOT a POS reservation or redemption; real POS adapter will use voucher-pos.js.
export async function previewVoucher(req,res){const voucherId=id.parse(req.params.id);const body=z.object({productId:id,quantity:z.coerce.number().min(0.01).max(1000),orderScope:z.enum(['DINE_IN','TAKE_AWAY']),customerRef:z.string().trim().max(128).nullable().optional().default(null)}).strict().parse(req.body);
 if(Math.abs(body.quantity*100-Math.round(body.quantity*100))>1e-7)throw problem('QUANTITY_TWO_DECIMALS_ONLY');
 const voucher=await get(req.auth.pool,voucherId);if(!voucher)throw problem('VOUCHER_NOT_FOUND',404);
 const [[product]]=await req.auth.pool.execute('SELECT id,category_id,selling_price,status,is_deleted FROM products WHERE id=?',[body.productId]);if(!product||product.is_deleted||product.status!=='ACTIVE')throw problem('PRODUCT_NOT_AVAILABLE',404);
 const nowParts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());const part=k=>nowParts.find(x=>x.type===k)?.value;
 const now=`${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}:${part('second')}`;
 const [counts]=await req.auth.pool.execute("SELECT status,customer_ref,COUNT(*) AS total FROM voucher_reservations WHERE voucher_id=? AND status IN ('RESERVED','REDEEMED') GROUP BY status,customer_ref",[voucherId]);
 const usedCount=counts.reduce((n,r)=>n+Number(r.total),0),customerUsedCount=counts.filter(r=>r.customer_ref===body.customerRef).reduce((n,r)=>n+Number(r.total),0);
 const priceSen=Math.round(Number(product.selling_price)*100),qtyUnits=Math.round(body.quantity*100);
 const subtotal=(Math.round(priceSen*qtyUnits/100)/100).toFixed(2);
 return res.json({preview:true,posting:false,now,usedCount,...evaluateVoucher(voucher,{now,customerRef:body.customerRef,orderScope:body.orderScope,usedCount,customerUsedCount,targetIds:await getTargets(req.auth.pool,voucherId),lines:[{productId:product.id,categoryId:product.category_id,subtotal}]})});
}


export {voucherCsvTemplate};
export async function exportVouchers(req,res){
 const [rows]=await req.auth.pool.execute(`${select} ORDER BY v.id DESC LIMIT 2000`);
 const ids=rows.map(r=>r.id),lookup=new Map();
 if(ids.length){const [targets]=await req.auth.pool.execute(`SELECT t.voucher_id,p.sku,c.category_name FROM voucher_targets t LEFT JOIN products p ON p.id=t.product_id LEFT JOIN categories c ON c.id=t.category_id WHERE t.voucher_id IN (${ids.map(()=>'?').join(',')})`,ids);for(const t of targets){const k=String(t.voucher_id);if(!lookup.has(k))lookup.set(k,[]);lookup.get(k).push(t.sku||t.category_name||'');}}
 const text='\uFEFF'+[VOUCHER_CSV_HEADERS,...rows.map(v=>[v.voucher_code,v.voucher_name,v.description,v.discount_type,v.discount_value,v.minimum_spend,v.maximum_discount,v.starts_at,v.ends_at,v.order_scope,v.eligibility_type,(lookup.get(String(v.id))||[]).join('|'),v.usage_limit,v.per_customer_limit,v.status])].map(r=>r.map(csvEscapeVoucher).join(',')).join('\r\n');
 res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('vouchers-export.csv').send(text);
}
async function validateImport(pool,csv){
 const rows=parseVoucherCsv(csv),conn=await pool.getConnection();try{const output=[];
 for(const row of rows){if(row.error){output.push(row);continue;}
  try{const {targetCodes,...fields}=row.data;
   const type=fields.eligibilityType;
   let targetIds=[];
   if(type!=='ALL'){
    if(!targetCodes.length)throw problem('TARGETS_REQUIRED');
    const table=type==='PRODUCT'?'products':'categories',col=type==='PRODUCT'?'sku':'category_name';
    const [items]=await conn.execute(`SELECT id,${col} AS code FROM ${table} WHERE status='ACTIVE' AND is_deleted=0`);
    const mapped=new Map(items.map(x=>[String(x.code).toLowerCase(),Number(x.id)]));
    targetIds=targetCodes.map(x=>mapped.get(x.toLowerCase()));
    if(targetIds.some(x=>!x)||new Set(targetIds).size!==targetIds.length)throw problem('CSV_TARGET_MISSING_OR_DUPLICATE');
   }else if(targetCodes.length)throw problem('ALL_MUST_HAVE_NO_TARGETS');
   const parsed=voucherSchema.parse({...fields,voucherCode:fields.voucherCode||'VCH-PREVIEWONLY',targetIds});
   output.push({line:row.line,data:{...parsed,voucherCode:fields.voucherCode||''}});
  }catch(e){output.push({line:row.line,code:row.data?.voucherCode||'',name:row.data?.voucherName||'',error:e.issues?e.issues.map(x=>`${x.path.join('.')}: ${x.message}`).join('; '):e.message});}
 }return output;
 }finally{conn.release();}
}
const csvBody=z.object({csv:z.string().max(1024*1024)}).strict();
export async function previewVoucherImport(req,res){const {csv}=csvBody.parse(req.body);const rows=await validateImport(req.auth.pool,csv);const [current]=await req.auth.pool.execute('SELECT voucher_code FROM vouchers');const existing=new Set(current.map(x=>x.voucher_code));const result=rows.map(r=>r.error?r:r.data.voucherCode&&existing.has(r.data.voucherCode)?{line:r.line,code:r.data.voucherCode,name:r.data.voucherName,error:'VOUCHER_CODE_DUPLICATE'}:r);return res.json({count:result.length,valid:result.every(x=>!x.error),rows:result.map(x=>({line:x.line,code:x.code||x.data?.voucherCode||'AUTO-GENERATED',name:x.name||x.data?.voucherName||'',error:x.error||''}))});}
export async function importVouchers(req,res){const {csv}=csvBody.parse(req.body);const rows=await validateImport(req.auth.pool,csv);if(rows.some(x=>x.error))throw problem('CSV_VALIDATION_FAILED');try{
 const result=await tx(req.auth.pool,async conn=>{
  const generated=[];
  for(const row of rows){
   const template=row.data;
   let insert=null,record=template;
   if(!template.voucherCode){
    for(let attempt=0;attempt<5;attempt++){
     record={...template,voucherCode:generateVoucherCode(),usageLimit:template.usageLimit??1};
     try{[insert]=await conn.execute(`INSERT INTO vouchers(${fields.join(',')},created_by,updated_by) VALUES(${fields.map(()=>'?').join(',')},?,?)`,[...values(record),req.auth.user.id,req.auth.user.id]);break;}
     catch(e){if(e.code==='ER_DUP_ENTRY'&&attempt<4)continue;throw e;}
    }
    generated.push(record.voucherCode);
   }else{
    [insert]=await conn.execute(`INSERT INTO vouchers(${fields.join(',')},created_by,updated_by) VALUES(${fields.map(()=>'?').join(',')},?,?)`,[...values(record),req.auth.user.id,req.auth.user.id]);
   }
   await writeTargets(conn,insert.insertId,record);
   await audit(conn,insert.insertId,req.auth.user.id,'VOUCHER_IMPORT',null,record);
  }
  return {count:rows.length,generatedCount:generated.length};
 });return res.status(201).json({...result,message:'VOUCHERS_IMPORTED'});
}catch(e){return dbError(res,e);}}
