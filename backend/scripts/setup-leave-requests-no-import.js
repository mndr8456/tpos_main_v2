// HR Leave Requests R1.1 permission revocation. Read-only unless --apply.
// Applies to ACTIVE V2 tenants only; refuses to run without migration 030.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
let failed=0;
async function inspect(pool){
 const [[installed]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='hr_leave_requests'");
 if(Number(installed.n)!==1)throw Error('LEAVE_REQUESTS_R1_NOT_INSTALLED');
 const [[permission]]=await pool.execute("SELECT COUNT(*) AS n FROM permissions WHERE code='leave_requests.import'");
 const [[grants]]=await pool.execute("SELECT COUNT(*) AS n FROM role_permissions WHERE permission_code='leave_requests.import'");
 return {obsoletePermission:Number(permission.n),obsoleteGrants:Number(grants.n)};
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id);
   const before=await inspect(pool),current=!before.obsoletePermission&&!before.obsoleteGrants;
   if(apply&&!current)await executeSchema(tenant.db_name,'031_tenant_hr_leave_requests_no_import.sql');
   const after=apply?await inspect(pool):before;
   if(apply&&(after.obsoletePermission||after.obsoleteGrants))throw Error('LEAVE_REQUEST_IMPORT_PERMISSION_NOT_REMOVED');
   console.log(JSON.stringify({event:'leave_requests_no_import_tenant',tenantId:String(tenant.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current,...(!current&&!apply?after:{})}));
  }catch(e){failed++;console.error(JSON.stringify({event:'leave_requests_no_import_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'leave_requests_no_import_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('LEAVE_REQUESTS_NO_IMPORT_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
