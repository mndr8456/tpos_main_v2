// Tenant Staff Profile installer: inspect by default; --apply only for missing/recoverable schema.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const perms=['staff_profiles.view','staff_profiles.manage','staff_profiles.print','staff_profiles.import','staff_profiles.audit','staff_profiles.self'];
const grants=['OWNER','ADMIN','HR'].flatMap(r=>perms.map(p=>`${r}:${p}`))
 .concat('MANAGER:staff_profiles.view',...['MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'].map(r=>`${r}:staff_profiles.self`));
const columns=['staff_profiles.user_id','staff_profiles.staff_no','staff_profiles.ic_no','staff_profiles.image_mime','staff_profiles.image_data','staff_profile_audit_logs.details'];
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id);
   const [[trows],[crows],[prows],[grows]]=await Promise.all([
    pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('staff_profiles','staff_profile_audit_logs')"),
    pool.execute("SELECT TABLE_NAME AS tbl,COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('staff_profiles','staff_profile_audit_logs')"),
    pool.execute("SELECT code FROM permissions WHERE code LIKE 'staff_profiles.%'"),
    pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'staff_profiles.%'")
   ]);
   const ts=new Set(trows.map(x=>x.name)),cs=new Set(crows.map(x=>`${x.tbl}.${x.col}`)),ps=new Set(prows.map(x=>x.code)),gs=new Set(grows.map(x=>`${x.role}:${x.code}`));
   const missingColumns=columns.filter(x=>!cs.has(x)),missingPermissions=perms.filter(x=>!ps.has(x)),missingGrants=grants.filter(x=>!gs.has(x));
   const missingTables=['staff_profiles','staff_profile_audit_logs'].filter(x=>!ts.has(x));
   const unsafe=(ts.size>0&&ts.size<2)||(ts.size===2&&missingColumns.length>0);
   if(unsafe)throw new Error(`STAFF_SCHEMA_PARTIAL_REQUIRES_AUDIT:${[...missingTables,...missingColumns].join(',')}`);
   const current=!missingTables.length&&!missingPermissions.length&&!missingGrants.length;
   if(apply&&!current)await executeSchema(tenant.db_name,'025_tenant_staff_profiles.sql');
   console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',applied:apply&&!current,
     ...(!current?{missingTables,missingColumns,missingPermissions,missingGrants}: {})}));
  }catch(e){failed++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'staff_profiles_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('STAFF_PROFILES_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
