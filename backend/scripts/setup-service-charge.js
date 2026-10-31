// Tenant setup for Service Charge Settings (read-only without --apply).
import {centralPool,tenantPool,executeSchema,closePools,tenantDatabase} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0,changedTenants=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   if(t.db_name!==tenantDatabase(t.id))throw Error('SERVICE_CHARGE_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(t.id);
   const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('service_charge_settings','service_charge_audit_logs')");
   const found=new Set(tables.map(row=>row.TABLE_NAME));
   let missingTables=['service_charge_settings','service_charge_audit_logs'].filter(x=>!found.has(x));
   let missingSeed=false,missingPermissions=[];
   if(!missingTables.length){const [[row]]=await pool.execute('SELECT id FROM service_charge_settings WHERE id=1');missingSeed=!row;}
   const [grants]=await pool.execute("SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.code=rp.permission_code WHERE r.code='OWNER' AND p.code IN ('service_charge.view','service_charge.manage','service_charge.audit')");
   missingPermissions=['service_charge.view','service_charge.manage','service_charge.audit'].filter(c=>!grants.some(g=>g.code===c));
   let changed=false;
   if(apply&&(missingTables.length||missingSeed||missingPermissions.length)){
    await executeSchema(t.db_name,'019_tenant_service_charge_settings.sql');changed=true;
    const [recheck]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('service_charge_settings','service_charge_audit_logs')");
    missingTables=['service_charge_settings','service_charge_audit_logs'].filter(x=>!recheck.some(r=>r.TABLE_NAME===x));
    if(!missingTables.length){const [[row]]=await pool.execute('SELECT id FROM service_charge_settings WHERE id=1');missingSeed=!row;}
    const [newGrants]=await pool.execute("SELECT p.code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.code=rp.permission_code WHERE r.code='OWNER' AND p.code IN ('service_charge.view','service_charge.manage','service_charge.audit')");
    missingPermissions=['service_charge.view','service_charge.manage','service_charge.audit'].filter(c=>!newGrants.some(g=>g.code===c));
   }
   const missing=missingTables.length||missingSeed||missingPermissions.length;
   console.log(JSON.stringify({tenantId:String(t.id),status:missing?'MISSING':changed?'APPLIED':'CURRENT',mode:apply?'apply':'read-only',missingTables,missingSeed,missingPermissions}));
   if(changed)changedTenants++;
   if(apply&&missing)failures++;
  }catch(error){failures++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:error.code||error.message}));}
 }
 console.log(JSON.stringify({module:'service-charge-r1',tenants:tenants.length,failures,applied:apply,changedTenants}));
}catch(e){failures++;console.error('SERVICE_CHARGE_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
