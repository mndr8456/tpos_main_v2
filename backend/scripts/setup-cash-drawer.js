// Existing tenants: read-only check by default, explicitly pass --apply for schema 014.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
const names=['cash_drawer_events','cash_drawer_audit_logs'];
const permissions=['cash_drawer.view','cash_drawer.view.all','cash_drawer.record.own','cash_drawer.record.any','cash_drawer.audit','cash_drawer.export'];
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){try{
  const pool=tenantPool(tenant.id);
  const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cash_drawer_events','cash_drawer_audit_logs')");
  const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'cash_drawer.%'");
  const [grants]=await pool.execute("SELECT r.code AS role,rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'cash_drawer.%'");
  const t=new Set(tables.map(x=>x.TABLE_NAME)),p=new Set(perms.map(x=>x.code)),g=new Set(grants.map(x=>`${x.role}:${x.permission_code}`));
  const expected=['OWNER','ADMIN','MANAGER'].flatMap(r=>permissions.map(c=>`${r}:${c}`)).concat(
   ['cash_drawer.view','cash_drawer.view.all','cash_drawer.audit','cash_drawer.export'].map(c=>`ACCOUNTANT:${c}`),
   ['CASHIER','SUPERVISOR'].flatMap(r=>['cash_drawer.view','cash_drawer.record.own'].map(c=>`${r}:${c}`)));
  const current=names.every(x=>t.has(x))&&permissions.every(x=>p.has(x))&&expected.every(x=>g.has(x));
  if(apply&&!current)await executeSchema(tenant.db_name,'014_tenant_cash_drawer_logs.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({module:'cash-drawer-r1',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('CASH_DRAWER_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
