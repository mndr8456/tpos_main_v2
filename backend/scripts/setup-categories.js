// Safe manual Category setup for tenants already registered BEFORE module 2.
// node scripts/setup-categories.js         -> read-only status
// node scripts/setup-categories.js --apply -> apply non-destructive idempotent SQL
import { centralPool,tenantPool,executeSchema,closePools } from '../src/database.js';
const apply=process.argv.includes('--apply');
let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  const pool=tenantPool(tenant.id);
  try{
   const [existing]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('categories','preparation_stations','category_audit_logs')");
   const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'categories.%'");
   const current=existing.length===3&&perms.length===8;
   if(apply){await executeSchema(tenant.db_name,'004_tenant_categories.sql');}
   const status=apply?'APPLIED':current?'CURRENT':'MISSING';
   console.log(JSON.stringify({tenantId:String(tenant.id),status,mode:apply?'apply':'read-only'}));
  }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({module:'categories',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('CATEGORY_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
