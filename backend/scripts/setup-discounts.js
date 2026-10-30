// Discount R1 installer. Read-only by default; --apply is explicit and idempotent.
import { centralPool,tenantPool,executeSchema,closePools } from '../src/database.js';
const apply=process.argv.includes('--apply');
let failures=0,tenants=[];
try{
 const [active]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 tenants=active;
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id);
   const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('discounts','discount_targets','discount_audit_logs')");
   const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'discounts.%'");
   const [grants]=await pool.execute("SELECT permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='OWNER' AND rp.permission_code LIKE 'discounts.%'");
   const current=tables.length===3&&perms.length>=7&&grants.length>=7;
   if(apply&&!current)await executeSchema(tenant.db_name,'009_tenant_discounts.sql');
   console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
  }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({module:'discounts-r1',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('DISCOUNT_SETUP_FAILED',e.code||e.message);}
finally{await closePools();}
if(failures)process.exitCode=1;
