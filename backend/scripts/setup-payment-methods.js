// Isolated tenant Payment Methods 016 installer. Read-only by default.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['payment_method_settings','payment_method_images','payment_method_audit_logs'];
const grants=['payment_methods.view','payment_methods.manage','payment_methods.audit'];
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{
  const pool=tenantPool(tenant.id);
  const [t]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('payment_method_settings','payment_method_images','payment_method_audit_logs')");
  const [p]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'payment_methods.%'");
  const [r]=await pool.execute("SELECT ro.code AS role,rp.permission_code FROM role_permissions rp JOIN roles ro ON ro.id=rp.role_id WHERE rp.permission_code LIKE 'payment_methods.%'");
  const ts=new Set(t.map(x=>x.TABLE_NAME)),ps=new Set(p.map(x=>x.code)),rs=new Set(r.map(x=>`${x.role}:${x.permission_code}`));
  const expected=['OWNER','ADMIN'].flatMap(role=>grants.map(code=>`${role}:${code}`)).concat(['MANAGER','ACCOUNTANT','SUPERVISOR'].map(role=>`${role}:payment_methods.view`));
  const [branchRows]=ts.has('payment_method_settings')?await pool.execute("SELECT (SELECT COUNT(*) FROM branches)*7 AS expected,(SELECT COUNT(*) FROM payment_method_settings) AS actual"): [[{expected:1,actual:0}]];
  const current=tables.every(x=>ts.has(x))&&grants.every(x=>ps.has(x))&&expected.every(x=>rs.has(x))&&Number(branchRows[0].expected)===Number(branchRows[0].actual);
  if(apply&&!current)await executeSchema(tenant.db_name,'016_tenant_payment_methods.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({module:'payment-methods-r1',tenants:tenants.length,failures:failed,applied:apply}));
}catch(e){failed++;console.error('PAYMENT_METHODS_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
