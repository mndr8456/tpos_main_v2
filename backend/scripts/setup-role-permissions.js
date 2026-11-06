// Read-only inspection by default. --apply runs the additive migration 034.
// Once applied, NEVER overwrite the user-managed role grants.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
let failed=0;
async function inspect(pool){
 const [table]=await pool.execute(`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tpos_feature_setup_history'`);
 if(!table.length)return false;
 const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM tpos_feature_setup_history WHERE feature_code='role_permissions_r1_034'");
 return Number(row.n)===1;
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id),current=await inspect(pool);
   if(apply&&!current)await executeSchema(tenant.db_name,'034_tenant_role_permissions.sql');
   const now=apply?await inspect(pool):current;
   if(apply&&!now)throw Error('ROLE_PERMISSIONS_034_INCOMPLETE');
   console.log(JSON.stringify({event:'role_permissions_tenant',tenantId:String(tenant.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current}));
  }catch(e){failed++;console.error(JSON.stringify({event:'role_permissions_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'role_permissions_setup_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('ROLE_PERMISSIONS_SETUP_FAILED',e.code||e.message);}
finally{await closePools();}
if(failed)process.exitCode=1;
