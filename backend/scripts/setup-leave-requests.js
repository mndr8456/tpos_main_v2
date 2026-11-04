// Migration 030 inspector for every active V2 tenant. No writes without --apply.
// DDL is not transactional in MySQL; refuse partially applied schema for manual audit.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
const tables=['hr_leave_requests','hr_leave_request_attachments','hr_leave_request_audit_logs','hr_leave_balance_openings','hr_leave_request_postings'];
const columns=['hr_attendances.leave_request_id','hr_leave_requests.request_no','hr_leave_requests.request_status','hr_leave_requests.total_days','hr_leave_request_attachments.file_data','hr_leave_balance_openings.opening_used_days','hr_leave_request_postings.delta_pending_days'];
// Import was removed in R1.1 (migration 031); migration 030 remains installed and valid.
const perms=['view','self','manage','approve','export','audit','recalculate'].map(x=>`leave_requests.${x}`);
const expected=['OWNER','ADMIN','HR'].flatMap(role=>perms.map(p=>`${role}:${p}`)).concat('MANAGER:leave_requests.view',...['MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'].map(role=>`${role}:leave_requests.self`));
async function inspect(pool){
 const [t,c,p,g]=await Promise.all([
 pool.execute(`SELECT TABLE_NAME name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${tables.map(()=>'?').join(',')})`,tables),
 pool.execute("SELECT TABLE_NAME tbl,COLUMN_NAME col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND (TABLE_NAME='hr_attendances' AND COLUMN_NAME='leave_request_id' OR TABLE_NAME LIKE 'hr_leave_request%' OR TABLE_NAME='hr_leave_balance_openings')"),
 pool.execute("SELECT code FROM permissions WHERE code LIKE 'leave_requests.%'"),
 pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'leave_requests.%'")
 ]);
 const foundTables=new Set(t[0].map(x=>x.name)),foundColumns=new Set(c[0].map(x=>`${x.tbl}.${x.col}`)),foundPerms=new Set(p[0].map(x=>x.code)),foundGrants=new Set(g[0].map(x=>`${x.role}:${x.code}`));
 return {missingTables:tables.filter(x=>!foundTables.has(x)),missingColumns:columns.filter(x=>!foundColumns.has(x)),missingPermissions:perms.filter(x=>!foundPerms.has(x)),missingGrants:expected.filter(x=>!foundGrants.has(x)),ddlExists:tables.some(x=>foundTables.has(x))||foundColumns.has('hr_attendances.leave_request_id')};
}
try{const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{const pool=tenantPool(tenant.id);const state=await inspect(pool);const current=!state.missingTables.length&&!state.missingColumns.length&&!state.missingPermissions.length&&!state.missingGrants.length;
  if(!current&&state.ddlExists)throw Error('LEAVE_REQUESTS_PARTIAL_SCHEMA_REQUIRES_MANUAL_AUDIT');
  if(apply&&!current)await executeSchema(tenant.db_name,'030_tenant_hr_leave_requests.sql');
  console.log(JSON.stringify({event:'leave_requests_tenant',tenantId:String(tenant.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current,...(!current&&!apply?state:{})}));
 }catch(e){failures++;console.error(JSON.stringify({event:'leave_requests_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'leave_requests_setup_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error('LEAVE_REQUESTS_SETUP_FAILED',e.code||e.message);}finally{await closePools();}if(failures)process.exitCode=1;
