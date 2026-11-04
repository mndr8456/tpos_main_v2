// HR Leave Types R1 installer: inspection is read-only; --apply is required to change tenant data.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['hr_leave_types','hr_leave_type_audit_logs'];
const required=['hr_leave_types.leave_code','hr_leave_types.attendance_status','hr_leave_types.default_entitlement_days','hr_leave_types.is_paid','hr_leave_types.allow_half_day','hr_leave_types.allow_carry_forward','hr_leave_types.status','hr_leave_type_audit_logs.details'];
const permissions=['leave_types.view','leave_types.manage','leave_types.import','leave_types.export','leave_types.audit'];
const grants=['OWNER','ADMIN','HR'].flatMap(r=>permissions.map(p=>`${r}:${p}`)).concat('MANAGER:leave_types.view');
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{
  const pool=tenantPool(tenant.id);
  const [[t],[cols],[p],[g]] = await Promise.all([
   pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_leave_types','hr_leave_type_audit_logs')"),
   pool.execute("SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_leave_types','hr_leave_type_audit_logs')"),
   pool.execute("SELECT code FROM permissions WHERE code LIKE 'leave_types.%'"),
   pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'leave_types.%'")
  ]);
  const ts=new Set(t.map(x=>x.name)),cs=new Set(cols.map(x=>`${x.tbl}.${x.col}`)),ps=new Set(p.map(x=>x.code)),gs=new Set(g.map(x=>`${x.role}:${x.code}`));
  const missingTables=tables.filter(x=>!ts.has(x)),missingColumns=required.filter(x=>!cs.has(x)),missingPermissions=permissions.filter(x=>!ps.has(x)),missingGrants=grants.filter(x=>!gs.has(x));
  if(ts.size>0&&(missingTables.length||missingColumns.length))throw Error('LEAVE_TYPES_SCHEMA_PARTIAL_REQUIRES_AUDIT');
  const current=!missingTables.length&&!missingColumns.length&&!missingPermissions.length&&!missingGrants.length;
  if(apply&&!current)await executeSchema(tenant.db_name,'028_tenant_hr_leave_types.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',applied:apply&&!current,...(!current?{missingTables,missingColumns,missingPermissions,missingGrants}:{})}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'hr_leave_types_setup_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('HR_LEAVE_TYPES_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
