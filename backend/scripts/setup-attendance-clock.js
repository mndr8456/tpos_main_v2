// Tenant Attendance Clock installer: inspect without modifying unless --apply is supplied.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['hr_clock_office_networks','hr_clock_remote_grants','hr_clock_events','hr_clock_policy_audit'];
const required=['hr_clock_office_networks.network_cidr','hr_clock_office_networks.branch_id','hr_clock_remote_grants.starts_at','hr_clock_remote_grants.revoked_at','hr_clock_events.observed_ip','hr_clock_events.network_channel','hr_clock_events.remote_grant_id','hr_clock_policy_audit.details'];
const permissions=['attendance_clock.view','attendance_clock.punch','attendance_clock.manage'];
const roles=['OWNER','ADMIN','HR','MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'];
const grants=roles.flatMap(role=>['attendance_clock.view','attendance_clock.punch',...(role==='OWNER'||role==='ADMIN'||role==='HR'?['attendance_clock.manage']:[])].map(code=>`${role}:${code}`));
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{
  const pool=tenantPool(tenant.id);
  const [[t],[cols],[p],[g],[depend]] = await Promise.all([
   pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'hr_clock_%'"),
   pool.execute("SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME LIKE 'hr_clock_%'"),
   pool.execute("SELECT code FROM permissions WHERE code LIKE 'attendance_clock.%'"),
   pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'attendance_clock.%'"),
   pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_attendances','staff_profiles')")
  ]);
  if(depend.length!==2)throw Error('ATTENDANCE_CLOCK_NEEDS_025_AND_026');
  const ts=new Set(t.map(x=>x.name)),cs=new Set(cols.map(x=>`${x.tbl}.${x.col}`)),ps=new Set(p.map(x=>x.code)),gs=new Set(g.map(x=>`${x.role}:${x.code}`));
  const missingTables=tables.filter(x=>!ts.has(x)),missingColumns=required.filter(x=>!cs.has(x)),missingPermissions=permissions.filter(x=>!ps.has(x)),missingGrants=grants.filter(x=>!gs.has(x));
  if((ts.size>0&&ts.size<tables.length)||(ts.size===tables.length&&missingColumns.length))throw Error('ATTENDANCE_CLOCK_SCHEMA_PARTIAL_REQUIRES_AUDIT');
  const current=!missingTables.length&&!missingColumns.length&&!missingPermissions.length&&!missingGrants.length;
  if(apply&&!current)await executeSchema(tenant.db_name,'027_tenant_attendance_clock.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',applied:apply&&!current,...(!current?{missingTables,missingColumns,missingPermissions,missingGrants}:{})}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'hr_attendance_clock_setup_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('HR_ATTENDANCE_CLOCK_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
