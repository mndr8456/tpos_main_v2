// Read-only inspection by default. --apply runs the one-time role-default migration 033.
// Once applied, future changes in Role Permissions must never be reset by this installer.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
let failed=0;
async function inspect(pool){
 const [table]=await pool.execute(`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tpos_feature_setup_history'`);
 if(!table.length)return false;
 const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM tpos_feature_setup_history WHERE feature_code='operational_nav_stock_in_033'");
 return Number(row.n)===1;
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id),current=await inspect(pool);
   if(apply&&!current)await executeSchema(tenant.db_name,'033_tenant_operational_navigation_stock_in.sql');
   const now=apply?await inspect(pool):current;
   if(apply&&!now)throw Error('OPERATIONAL_NAVIGATION_033_INCOMPLETE');
   console.log(JSON.stringify({event:'operational_navigation_tenant',tenantId:String(tenant.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current}));
  }catch(e){failed++;console.error(JSON.stringify({event:'operational_navigation_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'operational_navigation_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('OPERATIONAL_NAVIGATION_SETUP_FAILED',e.code||e.message);}
finally{await closePools();}
if(failed)process.exitCode=1;
