import {z} from 'zod';
export const DEFAULT_RECEIPT_FOOTER='Thank you.';
const footerSchema=z.object({footerMessage:z.string().trim().min(1).max(500).refine(v=>!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v))}).strict();
const fail=(code,status=403)=>Object.assign(new Error(code),{status});
const manager=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('receipt_settings.manage');
export async function getReceiptSettings(req,res){
 const [[setting]]=await req.auth.pool.execute('SELECT footer_message AS footerMessage FROM receipt_settings WHERE id=1');
 const [[company]]=await req.auth.pool.execute('SELECT p.registered_name AS businessName,p.address_line1 AS addressLine1,p.address_line2 AS addressLine2,p.address_line3 AS addressLine3,p.postcode,p.city,p.state,p.country,r.ssm_registration_number AS ssmNumber,r.ssm_old_registration_number AS ssmOldNumber FROM company_profiles p LEFT JOIN company_registrations r ON r.id=p.id WHERE p.id=1');
 if(!setting||!company)throw fail('RECEIPT_SETTINGS_NOT_INITIALIZED',409);
 return res.set('Cache-Control','no-store').json({footerMessage:setting.footerMessage,company:Object.fromEntries(Object.entries(company).map(([key,value])=>[key,value??''])),canManage:manager(req)});
}
export async function saveReceiptSettings(req,res){
 if(!manager(req))throw fail('RECEIPT_SETTINGS_MANAGE_REQUIRED');
 const {footerMessage}=footerSchema.parse(req.body),conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[old]]=await conn.execute('SELECT footer_message FROM receipt_settings WHERE id=1 FOR UPDATE');
  if(!old)throw fail('RECEIPT_SETTINGS_NOT_INITIALIZED',409);
  if(old.footer_message!==footerMessage){
   await conn.execute('UPDATE receipt_settings SET footer_message=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE id=1',[footerMessage,req.auth.user.id]);
   await conn.execute('INSERT INTO receipt_settings_audit_logs(actor_user_id,previous_footer,next_footer,recorded_at) VALUES(?,?,?,UTC_TIMESTAMP(6))',[req.auth.user.id,old.footer_message,footerMessage]);
  }
  await conn.commit();return res.set('Cache-Control','no-store').json({footerMessage,changed:old.footer_message!==footerMessage});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function getReceiptSettingsAudit(req,res){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code))throw fail('RECEIPT_SETTINGS_AUDIT_FORBIDDEN');
 const [logs]=await req.auth.pool.execute("SELECT a.id,u.full_name AS actorName,a.previous_footer AS previousFooter,a.next_footer AS nextFooter,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recordedAt FROM receipt_settings_audit_logs a JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 100");
 return res.set('Cache-Control','no-store').json({logs:logs.map(row=>({...row,id:String(row.id)}))});
}
// Called only for a NEW, real posted sale inside the existing checkout transaction.
// All reprints use this immutable value rather than today's mutable Owner setting.
export async function captureReceiptFooter(conn,saleId){
 const [saved]=await conn.execute('INSERT INTO pos_sale_receipt_footers(sale_id,footer_message) SELECT ?,footer_message FROM receipt_settings WHERE id=1',[saleId]);
 if(saved.affectedRows!==1)throw fail('RECEIPT_SETTINGS_NOT_INITIALIZED',409);
}
