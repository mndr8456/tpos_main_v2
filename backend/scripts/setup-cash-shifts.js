// Read-only by default; --apply is required for existing tenant databases.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0,tenants=[];
const tablesExpected=['cash_shifts','cash_shift_movements','cash_shift_audit_logs'];
const permExpected=['cash_shifts.view','cash_shifts.view.all','cash_shifts.open','cash_shifts.close.own','cash_shifts.close.any','cash_shifts.move.own','cash_shifts.move.any','cash_shifts.audit','cash_shifts.export'];
try{
 const [active]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");tenants=active;
 for(const tenant of active){try{
  const pool=tenantPool(tenant.id);
  const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('cash_shifts','cash_shift_movements','cash_shift_audit_logs')");
  const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'cash_shifts.%'");
  const [grants]=await pool.execute("SELECT r.code AS role, rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'cash_shifts.%'");
  const t=new Set(tables.map(x=>x.TABLE_NAME)),p=new Set(perms.map(x=>x.code)),g=new Set(grants.map(x=>`${x.role}:${x.permission_code}`));
  const expected=permExpected.map(code=>['OWNER','ADMIN','MANAGER'].map(role=>`${role}:${code}`)).flat().concat(
   ['cash_shifts.view','cash_shifts.view.all','cash_shifts.audit','cash_shifts.export'].map(code=>`ACCOUNTANT:${code}`),
   ['CASHIER','SUPERVISOR'].flatMap(role=>['cash_shifts.view','cash_shifts.open','cash_shifts.close.own','cash_shifts.move.own'].map(code=>`${role}:${code}`)));
  const current=tablesExpected.every(x=>t.has(x))&&permExpected.every(x=>p.has(x))&&expected.every(x=>g.has(x));
  if(apply&&!current)await executeSchema(tenant.db_name,'013_tenant_cash_shifts.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(err){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:err.code||err.message}));}}
 console.log(JSON.stringify({module:'cash-shifts-r1',tenants:active.length,failures,applied:apply}));
}catch(err){failures++;console.error('SHIFT_SETUP_FAILED',err.code||err.message);}finally{await closePools();}
if(failures)process.exitCode=1;
