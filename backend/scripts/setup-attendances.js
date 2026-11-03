// HR Attendances installer. Read-only inspection by default; --apply explicitly provisions missing schema.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['hr_attendances','hr_attendance_audit_logs'];
const required=['hr_attendances.staff_profile_id','hr_attendances.attendance_date','hr_attendances.session_no','hr_attendances.clock_in','hr_attendances.clock_out','hr_attendances.approval_status','hr_attendances.attendance_source','hr_attendance_audit_logs.details'];
const permissions=['attendances.view','attendances.manage','attendances.approve','attendances.import','attendances.export','attendances.audit'];
const grants=['OWNER','ADMIN','HR'].flatMap(r=>permissions.map(p=>`${r}:${p}`)).concat('MANAGER:attendances.view');
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{
  const pool=tenantPool(tenant.id);
  const [[t],[columns],[p],[g],[staff]] = await Promise.all([
   pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_attendances','hr_attendance_audit_logs')"),
   pool.execute("SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_attendances','hr_attendance_audit_logs')"),
   pool.execute("SELECT code FROM permissions WHERE code LIKE 'attendances.%'"),
   pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'attendances.%'"),
   pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='staff_profiles'")
  ]);
  if(!staff.length)throw Error('ATTENDANCES_NEEDS_STAFF_PROFILES_025');
  const ts=new Set(t.map(x=>x.name)),cs=new Set(columns.map(x=>`${x.tbl}.${x.col}`)),ps=new Set(p.map(x=>x.code)),gs=new Set(g.map(x=>`${x.role}:${x.code}`));
  const missingTables=tables.filter(x=>!ts.has(x)),missingColumns=required.filter(x=>!cs.has(x)),missingPermissions=permissions.filter(x=>!ps.has(x)),missingGrants=grants.filter(x=>!gs.has(x));
  if((ts.size===1)||(ts.size===2&&missingColumns.length))throw Error('ATTENDANCES_SCHEMA_PARTIAL_REQUIRES_AUDIT');
  const current=!missingTables.length&&!missingColumns.length&&!missingPermissions.length&&!missingGrants.length;
  if(apply&&!current)await executeSchema(tenant.db_name,'026_tenant_hr_attendances.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',applied:apply&&!current,...(!current?{missingTables,missingColumns,missingPermissions,missingGrants}:{})}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'hr_attendances_setup_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('HR_ATTENDANCES_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
