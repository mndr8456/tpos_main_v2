// HR Leave Balances R1 tenant installer. Inspect-only unless --apply is explicitly supplied.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['hr_leave_balances','hr_leave_balance_audit_logs'];
const columns=['hr_leave_balances.staff_profile_id','hr_leave_balances.leave_type_id','hr_leave_balances.balance_year','hr_leave_balances.remaining_days','hr_leave_balances.entitlement_days','hr_leave_balances.used_days','hr_leave_balances.pending_days','hr_leave_balances.status','hr_leave_balance_audit_logs.reason','hr_leave_balance_audit_logs.previous_data','hr_leave_balance_audit_logs.next_data'];
const permissions=['leave_balances.view','leave_balances.manage','leave_balances.generate','leave_balances.import','leave_balances.export','leave_balances.audit'];
const grants=['OWNER','ADMIN','HR'].flatMap(role=>permissions.map(p=>`${role}:${p}`)).concat('MANAGER:leave_balances.view');
try{const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{const pool=tenantPool(tenant.id);
  const [[actualTables],[actualColumns],[actualPermissions],[actualGrants]]=await Promise.all([
   pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_leave_balances','hr_leave_balance_audit_logs')"),
   pool.execute("SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('hr_leave_balances','hr_leave_balance_audit_logs')"),
   pool.execute("SELECT code FROM permissions WHERE code LIKE 'leave_balances.%'"),
   pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'leave_balances.%'")
  ]);
  const ts=new Set(actualTables.map(x=>x.name)),cs=new Set(actualColumns.map(x=>`${x.tbl}.${x.col}`)),ps=new Set(actualPermissions.map(x=>x.code)),gs=new Set(actualGrants.map(x=>`${x.role}:${x.code}`));
  const missingTables=tables.filter(x=>!ts.has(x)),missingColumns=columns.filter(x=>!cs.has(x)),missingPermissions=permissions.filter(x=>!ps.has(x)),missingGrants=grants.filter(x=>!gs.has(x));
  if(ts.size>0&&(missingTables.length||missingColumns.length))throw Error('LEAVE_BALANCES_SCHEMA_PARTIAL_REQUIRES_AUDIT');
  const current=!missingTables.length&&!missingColumns.length&&!missingPermissions.length&&!missingGrants.length;
  if(apply&&!current)await executeSchema(tenant.db_name,'029_tenant_hr_leave_balances.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',applied:apply&&!current,...(!current?{missingTables,missingColumns,missingPermissions,missingGrants}:{})}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',applied:false,error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'hr_leave_balances_setup_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('LEAVE_BALANCES_SETUP_FAILED',e.code||e.message);}finally{await closePools();}if(failed)process.exitCode=1;
