// Tenant inventory foundation R1: safe read-only inspection, explicit --apply.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
const tables=['inventory_branch_balances','inventory_movements'];
const permissions=['inventory.view','inventory.opening','inventory.audit'];
let failed=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  const pool=tenantPool(t.id);
  const [existing]=await pool.execute('SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?,?)',tables);
  const [cols]=await pool.execute("SELECT table_name AS tableName,column_name AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='inventory_branch_balances' AND column_name IN ('quantity_on_hand','carrying_value','average_cost')) OR (table_name='inventory_movements' AND column_name IN ('request_key','request_hash','quantity_delta','value_delta'))) ");
  const [perms]=await pool.execute("SELECT code FROM permissions WHERE code IN ('inventory.view','inventory.opening','inventory.audit')");
  const [grants]=await pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code IN ('inventory.view','inventory.opening','inventory.audit')");
  const missingTables=tables.filter(n=>!existing.some(x=>x.name===n));
  const missingColumns=[...['quantity_on_hand','carrying_value','average_cost'].filter(n=>!cols.some(x=>x.tableName==='inventory_branch_balances'&&x.name===n)).map(n=>'inventory_branch_balances.'+n),...['request_key','request_hash','quantity_delta','value_delta'].filter(n=>!cols.some(x=>x.tableName==='inventory_movements'&&x.name===n)).map(n=>'inventory_movements.'+n)];
  const missingPermissions=permissions.filter(n=>!perms.some(x=>x.code===n));
  const expectedGrants=[['OWNER','inventory.view'],['OWNER','inventory.opening'],['OWNER','inventory.audit'],['ADMIN','inventory.view'],['ADMIN','inventory.opening'],['ADMIN','inventory.audit'],['MANAGER','inventory.view'],['ACCOUNTANT','inventory.view']];
  const missingGrants=expectedGrants.filter(([role,code])=>!grants.some(g=>g.role===role&&g.code===code)).map(x=>x.join(':'));
  const current=!missingTables.length&&!missingColumns.length&&!missingPermissions.length&&!missingGrants.length;
  const partial=existing.length>0||perms.length>0||grants.length>0;
  if(apply&&!current&&partial)throw Error('PARTIAL_SCHEMA_REQUIRES_MANUAL_REVIEW');
  if(apply&&!current)await executeSchema(t.db_name,'022_tenant_inventory_foundation.sql');
  console.log(JSON.stringify({tenantId:String(t.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current,missingTables,missingColumns,missingPermissions,missingGrants}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'inventory_foundation_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
