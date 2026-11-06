// Tenant-local migration 039; inspect-only by default. Never reruns historical migrations.
import {readFileSync} from 'node:fs';
import {centralPool,tenantPool,tenantDatabase,quoteIdentifier,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
const feature='order_terminal_r1_039';
const tables=['waiter_orders','waiter_order_lines','waiter_order_audit'];
const permissionCodes=['order_terminal.view','order_terminal.create','order_terminal.cancel','order_terminal.receive'];
const expected={
 waiter_orders:{columns:['id','request_key','request_hash','branch_id','waiter_user_id','order_scope','table_id','status','active_table_id','pos_draft_id','order_notes','version'],indexes:['uq_waiter_request','uq_waiter_active_table','uq_waiter_pos_draft']},
 waiter_order_lines:{columns:['id','order_id','product_id','product_name','sku','barcode','category_id','unit_code','quantity','unit_price','track_stock','product_type','line_notes'],indexes:['uq_waiter_order_product']},
 waiter_order_audit:{columns:['id','order_id','actor_user_id','action_type','details','recorded_at'],indexes:['ix_waiter_order_audit']}
};
const migration=readFileSync(new URL('../../database/039_tenant_order_terminal.sql',import.meta.url),'utf8');
const statements=migration.split('\n').filter(s=>!s.trimStart().startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
async function inspect(pool){
 const [rows]=await pool.execute(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('waiter_orders','waiter_order_lines','waiter_order_audit','tpos_feature_setup_history')`);
 const names=new Set(rows.map(r=>r.name));const missingTables=tables.filter(n=>!names.has(n));const invalid=[];
 for(const name of tables.filter(n=>names.has(n))){
  const [cols]=await pool.execute('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[name]);
  const present=new Set(cols.map(x=>x.name));for(const col of expected[name].columns)if(!present.has(col))invalid.push(`${name}.${col}`);
  const [indexes]=await pool.execute('SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?',[name]);
  const ix=new Set(indexes.map(x=>x.name));for(const key of expected[name].indexes)if(!ix.has(key))invalid.push(`${name}.${key}`);
 }
 const [permissions]=await pool.execute("SELECT code FROM permissions WHERE code IN ('order_terminal.view','order_terminal.create','order_terminal.cancel','order_terminal.receive')");
 const missingPermissions=permissionCodes.filter(p=>!permissions.some(x=>x.code===p));
 let markerRecorded=false;
 if(names.has('tpos_feature_setup_history')){const [history]=await pool.execute('SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code=?',[feature]);markerRecorded=history.length>0;}
 const blockers=[...invalid,...(!names.has('tpos_feature_setup_history')?['FEATURE_HISTORY_MISSING']:[]),...(markerRecorded&&(missingTables.length||missingPermissions.length)?['MARKER_WITH_PARTIAL_FEATURE']:[])];
 return {current:markerRecorded&&!missingTables.length&&!missingPermissions.length&&!invalid.length,repairable:!blockers.length,markerRecorded,missingTables,missingPermissions,invalid,blockers};
}
let failed=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){const tenantId=String(tenant.id);
  try{
   if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('ORDER_TERMINAL_TENANT_IDENTITY_MISMATCH');quoteIdentifier(tenant.db_name);
   const pool=tenantPool(tenantId),before=await inspect(pool);
   if(!apply){const status=before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW';if(!before.repairable)failed++;console.log(JSON.stringify({event:'order_terminal_tenant',tenantId,status,applied:false,diagnostic:before}));continue;}
   if(!before.repairable)throw Error('ORDER_TERMINAL_MANUAL_REVIEW_REQUIRED');
   if(!before.current){
    for(let i=0;i<tables.length;i++)if(before.missingTables.includes(tables[i]))await pool.query(statements[i]);
    // Do not reset any grants if this feature has already been installed.
    if(!before.markerRecorded){for(let i=tables.length;i<statements.length;i++)await pool.query(statements[i]);}
    const after=await inspect(pool);if(!after.current)throw Error('ORDER_TERMINAL_SCHEMA_VERIFY_FAILED');
   }
   console.log(JSON.stringify({event:'order_terminal_tenant',tenantId,status:before.current?'CURRENT':'APPLIED',applied:!before.current}));
  }catch(e){failed++;console.error(JSON.stringify({event:'order_terminal_tenant',tenantId,status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'order_terminal_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
