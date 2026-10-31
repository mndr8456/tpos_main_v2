import {z} from 'zod';
import {encryptPaymentCredential,checkPaymentImage,publicPaymentState} from './payment-method-security.js';
const codes=['CASH','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','DUITNOW_QR','EWALLET','SARA_MYKASIH'];
const method=z.enum(codes);const id=z.coerce.number().int().positive();
const bad=(code,status=400)=>Object.assign(new Error(code),{status});
const canManage=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('payment_methods.manage');
const allowedBranch=(req,branchId)=>['OWNER','ADMIN'].includes(req.auth.user.role_code)||req.auth.user.branchIds.includes(String(branchId));
const parseLoc=req=>({branchId:id.parse(req.params.branchId),code:method.parse(req.params.code)});
const configSchema=z.object({isActive:z.boolean(),providerName:z.string().trim().max(160).default(''),providerApiUrl:z.union([z.literal(''),z.url().refine(v=>new URL(v).protocol==='https:','HTTPS_ONLY')]).default(''),merchantRef:z.string().trim().max(160).default(''),terminalRef:z.string().trim().max(160).default(''),apiKey:z.string().max(4096).optional(),clearApiKey:z.boolean().default(false)}).strict();
const select=`SELECT s.*,i.setting_id IS NOT NULL AS has_image FROM payment_method_settings s LEFT JOIN payment_method_images i ON i.setting_id=s.id`;
async function ensure(conn,branchId,code){
 const [[branch]]=await conn.execute('SELECT id,is_active FROM branches WHERE id=?',[branchId]);if(!branch||!branch.is_active)throw bad('BRANCH_NOT_FOUND',404);
 await conn.execute('INSERT IGNORE INTO payment_method_settings(branch_id,method_code,is_active) VALUES(?,?,?)',[branchId,code,code==='CASH'?1:0]);
 const [[row]]=await conn.execute('SELECT * FROM payment_method_settings WHERE branch_id=? AND method_code=? FOR UPDATE',[branchId,code]);
 const [[image]]=await conn.execute('SELECT setting_id FROM payment_method_images WHERE setting_id=?',[row.id]);
 return {...row,has_image:Boolean(image)};
}
async function audit(conn,id,user,action,previous,next){
 await conn.execute('INSERT INTO payment_method_audit_logs(setting_id,actor_user_id,action_type,previous_data,next_data,recorded_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP(6))',[id,user,action,previous?JSON.stringify(previous):null,next?JSON.stringify(next):null]);
}
async function transaction(pool,cb){const conn=await pool.getConnection();try{await conn.beginTransaction();const value=await cb(conn);await conn.commit();return value;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
export async function listPaymentMethods(req,res){
 const [branches]=await req.auth.pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');
 const scoped=branches.filter(b=>allowedBranch(req,b.id));
 const [settings]=await req.auth.pool.execute(`${select} ORDER BY s.branch_id,s.id`);
 const lookup=new Map(settings.map(x=>[`${x.branch_id}:${x.method_code}`,x]));
 const rows=scoped.flatMap(b=>codes.map(code=>{
  const existing=lookup.get(`${b.id}:${code}`);
  return existing?publicPaymentState(existing):{branchId:String(b.id),methodCode:code,isActive:code==='CASH',providerName:'',providerApiUrl:'',merchantRef:'',terminalRef:'',hasApiKey:false,hasImage:false,integrationStatus:code==='SARA_MYKASIH'?'OFFICIAL_PROVIDER_NOT_CONNECTED':'NOT_CONNECTED'};
 }));
 return res.set('Cache-Control','no-store').json({branches:scoped.map(b=>({...b,id:String(b.id)})),methods:rows,canManage:canManage(req),posIntegration:'NOT_CONNECTED',saraIntegration:'OFFICIAL_PROVIDER_NOT_CONNECTED'});
}
export async function savePaymentMethod(req,res){
 if(!canManage(req))throw bad('PAYMENT_MANAGE_DENIED',403);
 const {branchId,code}=parseLoc(req),data=configSchema.parse(req.body);
 if(code==='SARA_MYKASIH'&&data.isActive)throw bad('SARA_PROVIDER_INTEGRATION_REQUIRED',409);
 if(data.apiKey&&data.clearApiKey)throw bad('API_KEY_CONFLICT');
 if(data.apiKey && data.apiKey.trim().length<8)throw bad('API_KEY_TOO_SHORT');
 const encrypted=data.apiKey?encryptPaymentCredential(data.apiKey):null;
 const result=await transaction(req.auth.pool,async conn=>{
  const existing=await ensure(conn,branchId,code),before=publicPaymentState(existing);
  const sql='UPDATE payment_method_settings SET is_active=?,provider_name=?,provider_api_url=?,provider_merchant_ref=?,provider_terminal_ref=?,api_key_encrypted=?,api_key_configured=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE id=?';
  const nextSecret=data.clearApiKey?null:(encrypted??existing.api_key_encrypted??null);
  await conn.execute(sql,[data.isActive?1:0,data.providerName||null,data.providerApiUrl||null,data.merchantRef||null,data.terminalRef||null,nextSecret,nextSecret?1:0,req.auth.user.id,existing.id]);
  const [[current]]=await conn.execute(`${select} WHERE s.id=?`,[existing.id]);const after=publicPaymentState(current);
  await audit(conn,existing.id,req.auth.user.id,existing.is_active!==current.is_active?'STATUS_CHANGE':data.apiKey||data.clearApiKey?'API_KEY_CHANGE':'CONFIG_UPDATE',before,after);
  return after;
 });return res.set('Cache-Control','no-store').json({method:result});
}
export async function uploadPaymentImage(req,res){
 if(!canManage(req))throw bad('PAYMENT_MANAGE_DENIED',403);
 const {branchId,code}=parseLoc(req);
 if(!['DUITNOW_QR','EWALLET'].includes(code))throw bad('IMAGE_ONLY_DIGITAL_METHODS');
 const image=z.object({mimeType:z.string(),base64:z.string()}).strict().parse(req.body);
 const bytes=checkPaymentImage(image.mimeType,image.base64);
 const saved=await transaction(req.auth.pool,async conn=>{
  const row=await ensure(conn,branchId,code);
  await conn.execute('INSERT INTO payment_method_images(setting_id,mime_type,image_data,updated_by,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE mime_type=VALUES(mime_type),image_data=VALUES(image_data),updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(6)',[row.id,image.mimeType,bytes,req.auth.user.id]);
  await audit(conn,row.id,req.auth.user.id,'IMAGE_UPLOAD',{hadImage:Boolean(row.has_image)},{hasImage:true,mimeType:image.mimeType,size:bytes.length});return row.id;
 });return res.json({saved:true,settingId:String(saved)});
}
export async function removePaymentImage(req,res){
 if(!canManage(req))throw bad('PAYMENT_MANAGE_DENIED',403);
 const {branchId,code}=parseLoc(req);
 if(!['DUITNOW_QR','EWALLET'].includes(code))throw bad('IMAGE_ONLY_DIGITAL_METHODS');
 await transaction(req.auth.pool,async conn=>{
  const row=await ensure(conn,branchId,code);
  await conn.execute('DELETE FROM payment_method_images WHERE setting_id=?',[row.id]);
  await audit(conn,row.id,req.auth.user.id,'IMAGE_REMOVE',{hadImage:Boolean(row.has_image)},{hasImage:false});
 });return res.json({removed:true});
}
export async function readPaymentImage(req,res){
 const {branchId,code}=parseLoc(req);if(!allowedBranch(req,branchId))throw bad('BRANCH_ACCESS_DENIED',403);
 const [[row]]=await req.auth.pool.execute('SELECT i.image_data,i.mime_type FROM payment_method_images i JOIN payment_method_settings s ON s.id=i.setting_id WHERE s.branch_id=? AND s.method_code=?',[branchId,code]);
 if(!row)throw bad('IMAGE_NOT_FOUND',404);
 return res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}).type(row.mime_type).send(row.image_data);
}
export async function paymentMethodAudit(req,res){
 if(!canManage(req)&&!req.auth.user.permissions.includes('payment_methods.audit'))throw bad('PAYMENT_AUDIT_DENIED',403);
 const [rows]=await req.auth.pool.execute('SELECT a.id,a.action_type,a.previous_data,a.next_data,DATE_FORMAT(a.recorded_at,\'%Y-%m-%d %H:%i:%s\') AS recorded_at,s.method_code,b.name AS branch_name,u.full_name AS actor_name FROM payment_method_audit_logs a JOIN payment_method_settings s ON s.id=a.setting_id JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 300');
 return res.set('Cache-Control','no-store').json({logs:rows});
}
