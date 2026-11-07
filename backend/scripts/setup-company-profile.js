import {centralPool,tenantPool,executeSchema,tenantDatabase,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const perms=['company_profile.view','company_profile.manage','company_profile.audit'];
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   if(t.db_name!==tenantDatabase(t.id))throw Error('COMPANY_PROFILE_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(t.id);
   const inspect=async()=>{
    const [columns]=await pool.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME='address_line3'");
    const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profile_audit_logs'");
    const [codes]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'company_profile.%'");
    const [grants]=await pool.execute("SELECT r.code AS role_code,rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'company_profile.%'");
    const [markers]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code='company_profile_r1_042'");
    const missingGrants=['OWNER','ADMIN'].flatMap(role=>perms.filter(code=>!grants.some(g=>g.role_code===role&&g.permission_code===code)).map(code=>`${role}:${code}`));
    return {address3:columns.length>0,auditTable:tables.length>0,missingPermissions:perms.filter(code=>!codes.some(c=>c.code===code)),missingGrants,marker:markers.length>0};
   };
   let state=await inspect(),status='CURRENT';
   const complete=v=>v.address3&&v.auditTable&&v.marker&&!v.missingPermissions.length&&!v.missingGrants.length;
   if(!complete(state))status='MISSING_OR_PARTIAL';
   if(apply&&!complete(state)){
    // Never re-run the ALTER statement if its column already exists.
    if(!state.address3)await pool.query('ALTER TABLE company_profiles ADD COLUMN address_line3 VARCHAR(255) NULL AFTER address_line2');
    await pool.query(`CREATE TABLE IF NOT EXISTS company_profile_audit_logs (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,actor_user_id BIGINT UNSIGNED NOT NULL,previous_data JSON NOT NULL,next_data JSON NOT NULL,recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),KEY ix_company_profile_audit_time(recorded_at,id),CONSTRAINT fk_company_profile_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);
    await pool.query("INSERT IGNORE INTO permissions(code,description) VALUES ('company_profile.view','View tenant company profile'),('company_profile.manage','Edit tenant company address contact and TIN'),('company_profile.audit','View company profile change log')");
    await pool.query("INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'company_profile.%' WHERE r.code IN ('OWNER','ADMIN')");
    await pool.query("INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('company_profile_r1_042')");
    state=await inspect();status=complete(state)?'APPLIED':'FAILED';
   }
   if(status==='FAILED')failed++;
   console.log(JSON.stringify({event:'company_profile_tenant',tenantId:String(t.id),status,applied:status==='APPLIED',diagnostic:state}));
  }catch(e){failed++;console.error(JSON.stringify({event:'company_profile_tenant',tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'company_profile_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('COMPANY_PROFILE_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
