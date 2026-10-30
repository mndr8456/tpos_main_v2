// Safe read-only default, explicit --apply for existing active V2 tenant databases.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0,tenants=[];
try {
 const [active]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");tenants=active;
 for(const tenant of active){try{
  const pool=tenantPool(tenant.id);
  const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('vouchers','voucher_print_settings','voucher_targets','voucher_reservations','voucher_audit_logs')");
  const [perm]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'vouchers.%'");
  const [grants]=await pool.execute("SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='OWNER' AND rp.permission_code LIKE 'vouchers.%'");
  const [discount]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='discounts'");
  if(discount.length!==1)throw Error('DISCOUNT_R1_REQUIRED');
  const current=tables.length===5&&perm.length===5&&grants.length===5;
  if(apply&&!current)await executeSchema(tenant.db_name,'012_tenant_vouchers.sql');
  console.log(JSON.stringify({tenantId:String(tenant.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({module:'vouchers-r1',tenants:active.length,failures,applied:apply}));
}catch(e){failures++;console.error('VOUCHER_SETUP_FAILED',e.code||e.message)}finally{await closePools();}if(failures)process.exitCode=1;
