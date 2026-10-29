// node scripts/setup-dashboard.js         -> read-only status
// node scripts/setup-dashboard.js --apply -> idempotent permission grant for existing tenants
import { centralPool,tenantPool,executeSchema,closePools } from '../src/database.js';
const apply=process.argv.includes('--apply');
const roleCodes=['OWNER','ADMIN','HR','MANAGER'];
let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id);
   if(apply)await executeSchema(tenant.db_name,'005_tenant_dashboard.sql');
   const [rows]=await pool.execute(`SELECT r.code FROM role_permissions rp
    JOIN roles r ON r.id=rp.role_id
    WHERE rp.permission_code='dashboard.view'`);
   const granted=new Set(rows.map(r=>r.code));
   const current=roleCodes.every(code=>granted.has(code));
   const status=current?(apply?'APPLIED':'CURRENT'):'MISSING';
   if(!current)failures++;
   console.log(JSON.stringify({tenantId:String(tenant.id),status,mode:apply?'apply':'read-only'}));
  }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({module:'dashboard',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('DASHBOARD_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
