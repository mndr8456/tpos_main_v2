// Read-only first. --apply only after backup, Inventory 023 CURRENT, and backend stopped.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
const names=['pos_sales','pos_sale_lines','accounting_journals','accounting_journal_lines'];
const allowedRoles=['OWNER','ADMIN','MANAGER','SUPERVISOR','CASHIER'];
async function inspect(pool){
 const [tables]=await pool.execute("SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('pos_sales','pos_sale_lines','accounting_journals','accounting_journal_lines')");
 const [columns]=await pool.execute("SELECT table_name AS table_name,column_name AS column_name,column_type AS column_type FROM information_schema.columns WHERE table_schema=DATABASE() AND ((table_name='pos_drafts' AND column_name='status') OR (table_name='pos_draft_audit_logs' AND column_name='action_type') OR (table_name='inventory_branch_balances' AND column_name IN ('quantity_on_hand','carrying_value','average_cost')) OR (table_name='inventory_movements' AND column_name IN ('quantity_delta','value_delta','quantity_after','carrying_value_after','average_cost_after')))");
 const [perms]=await pool.execute("SELECT code FROM permissions WHERE code='pos.checkout.cash'");
 const [grants]=await pool.execute("SELECT r.code AS role FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code='pos.checkout.cash'");
 const missingTables=names.filter(n=>!tables.some(r=>r.name===n));
 const required=[['pos_drafts','status','completed'],['pos_draft_audit_logs','action_type','complete']];
 const missingEnums=required.filter(([t,c,entry])=>!columns.some(r=>r.table_name===t&&r.column_name===c&&String(r.column_type).toLowerCase().includes(`'${entry}'`))).map(x=>x.slice(0,2).join('.'));
 const inventoryNames=['quantity_on_hand','carrying_value','average_cost','quantity_delta','value_delta','quantity_after','carrying_value_after','average_cost_after'];
 if(inventoryNames.some(name=>!columns.some(r=>r.column_name===name&&String(r.column_type).toLowerCase()==='decimal(18,2)')))throw Error('POS_INVENTORY_023_REQUIRED');
 const missingRoles=allowedRoles.filter(role=>!grants.some(r=>r.role===role));
 const current=!missingTables.length&&!missingEnums.length&&perms.length===1&&!missingRoles.length;
 return {current,missingTables,missingEnums,missingPermissions:perms.length?[]:['pos.checkout.cash'],missingRoles};
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   const pool=tenantPool(tenant.id),before=await inspect(pool);
   if(apply&&!before.current){
    // Migration 024 is additive; no destructive DDL. A rerun after interruption
    // creates missing tables and reapplies compatible ENUM modifications only.
    await executeSchema(tenant.db_name,'024_tenant_pos_cash_checkout.sql');
    const after=await inspect(pool);if(!after.current)throw Error('POS_CASH_MIGRATION_VERIFY_FAILED');
   }
   console.log(JSON.stringify({tenantId:String(tenant.id),status:before.current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!before.current,...(!before.current?{missingTables:before.missingTables,missingEnums:before.missingEnums,missingPermissions:before.missingPermissions,missingRoles:before.missingRoles}:{})}));
  }catch(e){failures++;console.error(JSON.stringify({tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'pos_cash_checkout_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error(e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
