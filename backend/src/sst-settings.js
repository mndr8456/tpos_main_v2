import {z} from 'zod';

// Tenant-level SST switch is authoritative for the read-only POS quote.
// Registration numbers remain in the existing company_registrations row.
const taxType=z.enum(['SALES_TAX','SERVICE_TAX']);
const saveSchema=z.object({
 isEnabled:z.boolean(),
 registrationNumber:z.string().trim().max(80),
 taxRate:z.string().regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,3})?$/)
  .refine(value=>Number(value)<=100,'SST_RATE_INVALID')
}).strict();
const error=(code,status=400)=>Object.assign(new Error(code),{status});
const registrationColumn={SALES_TAX:'sst_sales_tax_number',SERVICE_TAX:'sst_service_tax_number'};
const isOwner=req=>req.auth.user.role_code==='OWNER';

export async function readSstSettings(conn){
 const [taxes]=await conn.execute('SELECT tax_type,is_enabled,tax_rate FROM sst_tax_settings ORDER BY tax_type');
 const [[registration]]=await conn.execute('SELECT sst_sales_tax_number,sst_service_tax_number FROM company_registrations WHERE id=1');
 if(!registration)throw error('SST_COMPANY_REGISTRATION_NOT_FOUND',409);
 if(taxes.length!==2)throw error('SST_SETTINGS_MIGRATION_REQUIRED',409);
 return new Map(taxes.map(row=>[row.tax_type,{
  type:row.tax_type,isEnabled:Boolean(row.is_enabled),taxRate:String(row.tax_rate),
  registrationNumber:String(registration[registrationColumn[row.tax_type]]||'')
 }]));
}
export async function getSstSettings(req,res){
 const map=await readSstSettings(req.auth.pool);
 return res.set('Cache-Control','no-store').json({settings:[...map.values()],canManage:isOwner(req)});
}
export async function saveSstSettings(req,res){
 if(!isOwner(req))throw error('SST_OWNER_REQUIRED',403);
 const type=taxType.parse(req.params.taxType),body=saveSchema.parse(req.body);
 if(body.isEnabled&&(!body.registrationNumber||Number(body.taxRate)<=0))throw error('SST_REGISTRATION_AND_RATE_REQUIRED',409);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[existing]]=await conn.execute('SELECT tax_type,is_enabled,tax_rate FROM sst_tax_settings WHERE tax_type=? FOR UPDATE',[type]);
  const [[company]]=await conn.execute('SELECT sst_sales_tax_number,sst_service_tax_number FROM company_registrations WHERE id=1 FOR UPDATE');
  if(!existing||!company)throw error('SST_SETTINGS_MIGRATION_REQUIRED',409);
  const before={type,isEnabled:Boolean(existing.is_enabled),taxRate:String(existing.tax_rate),registrationNumber:String(company[registrationColumn[type]]||'')};
  // The only source of SST registration numbers is the original tenant registration table.
  await conn.execute(`UPDATE company_registrations SET ${registrationColumn[type]}=? WHERE id=1`,[body.registrationNumber||null]);
  await conn.execute('UPDATE sst_tax_settings SET is_enabled=?,tax_rate=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE tax_type=?',[body.isEnabled?1:0,body.taxRate,req.auth.user.id,type]);
  const after={type,isEnabled:body.isEnabled,taxRate:body.taxRate,registrationNumber:body.registrationNumber};
  await conn.execute('INSERT INTO sst_settings_audit_logs(tax_type,actor_user_id,previous_data,next_data,recorded_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6))',[type,req.auth.user.id,JSON.stringify(before),JSON.stringify(after)]);
  await conn.commit();
  return res.set('Cache-Control','no-store').json({setting:after});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
function parseJson(value){if(typeof value==='string'){try{return JSON.parse(value);}catch{return null;}}return value;}
export async function listSstAudit(req,res){
 const [logs]=await req.auth.pool.execute(`SELECT a.id,a.tax_type,a.previous_data,a.next_data,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,u.full_name AS actor_name FROM sst_settings_audit_logs a JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 250`);
 return res.set('Cache-Control','no-store').json({logs:logs.map(r=>({...r,id:String(r.id),previous_data:parseJson(r.previous_data),next_data:parseJson(r.next_data)}))});
}
