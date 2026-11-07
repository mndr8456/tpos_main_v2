import {centralPool,tenantPool,tenantDatabase,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['receipt_settings','receipt_settings_audit_logs','pos_sale_receipt_footers'];
const perms=['receipt_settings.view','receipt_settings.manage','receipt_settings.audit'];
const definitions={
 receipt_settings:`CREATE TABLE IF NOT EXISTS receipt_settings (id TINYINT UNSIGNED NOT NULL PRIMARY KEY,footer_message VARCHAR(500) NOT NULL DEFAULT 'Thank you.',updated_by BIGINT UNSIGNED NULL,updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),CONSTRAINT chk_receipt_settings_id CHECK (id=1),CONSTRAINT fk_receipt_settings_actor FOREIGN KEY(updated_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
 receipt_settings_audit_logs:`CREATE TABLE IF NOT EXISTS receipt_settings_audit_logs (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,actor_user_id BIGINT UNSIGNED NOT NULL,previous_footer VARCHAR(500) NOT NULL,next_footer VARCHAR(500) NOT NULL,recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),KEY ix_receipt_settings_audit_time(recorded_at,id),CONSTRAINT fk_receipt_settings_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
 pos_sale_receipt_footers:`CREATE TABLE IF NOT EXISTS pos_sale_receipt_footers (sale_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,footer_message VARCHAR(500) NOT NULL,CONSTRAINT fk_pos_sale_receipt_footer FOREIGN KEY(sale_id) REFERENCES pos_sales(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`
};
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  if(t.db_name!==tenantDatabase(t.id))throw Error('RECEIPT_SETTINGS_TENANT_DATABASE_MISMATCH');
  const pool=tenantPool(t.id);
  const inspect=async()=>{
   const [present]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('receipt_settings','receipt_settings_audit_logs','pos_sale_receipt_footers')");
   const existing=present.map(r=>r.TABLE_NAME);
   const [codes]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'receipt_settings.%'");
   const [grants]=await pool.execute("SELECT r.code AS role_code,rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'receipt_settings.%'");
   const [markers]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code='receipt_settings_r1_043'");
   const [seed]=existing.includes('receipt_settings')?await pool.execute('SELECT id FROM receipt_settings WHERE id=1'):[[]];
   return {missingTables:tables.filter(x=>!existing.includes(x)),seed:seed.length>0,missingPermissions:perms.filter(code=>!codes.some(c=>c.code===code)),missingGrants:['OWNER','ADMIN'].flatMap(role=>perms.filter(code=>!grants.some(g=>g.role_code===role&&g.permission_code===code)).map(code=>`${role}:${code}`)),marker:markers.length>0};
  };
  const complete=s=>!s.missingTables.length&&s.seed&&!s.missingPermissions.length&&!s.missingGrants.length&&s.marker;
  let diagnostic=await inspect(),status=complete(diagnostic)?'CURRENT':'MISSING_OR_PARTIAL';
  if(apply&&!complete(diagnostic)){
   for(const table of diagnostic.missingTables)await pool.query(definitions[table]);
   await pool.execute("INSERT IGNORE INTO receipt_settings(id,footer_message) VALUES(1,'Thank you.')");
   await pool.execute("INSERT IGNORE INTO permissions(code,description) VALUES ('receipt_settings.view','View tenant receipt settings'),('receipt_settings.manage','Edit tenant receipt footer'),('receipt_settings.audit','View receipt settings activity log')");
   await pool.execute("INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'receipt_settings.%' WHERE r.code IN ('OWNER','ADMIN')");
   await pool.execute("INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('receipt_settings_r1_043')");
   diagnostic=await inspect();status=complete(diagnostic)?'APPLIED':'FAILED';
  }
  if(status==='FAILED')failed++;
  console.log(JSON.stringify({event:'receipt_settings_tenant',tenantId:String(t.id),status,applied:status==='APPLIED',diagnostic}));
 }catch(e){failed++;console.error(JSON.stringify({event:'receipt_settings_tenant',tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'receipt_settings_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('RECEIPT_SETTINGS_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
