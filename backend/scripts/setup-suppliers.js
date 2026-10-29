// Tenant supplier module setup. Read-only by default; --apply runs safe SQL.
import { centralPool,tenantPool,executeSchema,closePools } from '../src/database.js';
const apply=process.argv.includes('--apply');
let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  const pool=tenantPool(tenant.id);
  try{
   const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('suppliers','supplier_audit_logs')");
   const [permissions]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'suppliers.%'");
   const [ownerGrants]=await pool.execute("SELECT permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='OWNER' AND rp.permission_code LIKE 'suppliers.%'");
   const current=tables.length===2&&permissions.length===7&&ownerGrants.length===7;
   if(apply)await executeSchema(tenant.db_name,'006_tenant_suppliers.sql');
   console.log(JSON.stringify({tenantId:String(tenant.id),status:apply?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
  }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({module:'suppliers',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('SUPPLIER_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
