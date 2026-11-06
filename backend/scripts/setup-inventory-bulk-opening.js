// Migration 038. Inspect-only by default; --apply creates missing audited tables.
import {readFileSync} from 'node:fs';
import {centralPool,tenantPool,tenantDatabase,quoteIdentifier,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
const feature='inventory_bulk_opening_r2_038';
const names=['inventory_bulk_opening_batches','inventory_bulk_opening_lines'];
const expected={
 inventory_bulk_opening_batches:{columns:{id:'bigint unsigned',request_key:'char(36)',payload_hash:'char(64)',branch_id:'bigint unsigned',actor_user_id:'bigint unsigned',reference:'varchar(120)',row_count:'smallint unsigned',total_quantity:'decimal(18,2)',total_value:'decimal(18,2)',created_at:'datetime(6)'},indices:{PRIMARY:['id'],uq_inventory_bulk_batch_key:['request_key']}},
 inventory_bulk_opening_lines:{columns:{id:'bigint unsigned',batch_id:'bigint unsigned',product_id:'bigint unsigned',movement_id:'bigint unsigned',opening_quantity:'decimal(18,2)',actual_unit_cost:'decimal(18,2)',opening_value:'decimal(18,2)'},indices:{PRIMARY:['id'],uq_inventory_bulk_line_product:['batch_id','product_id'],uq_inventory_bulk_line_movement:['movement_id']}}
};
const sql=readFileSync(new URL('../../database/038_tenant_inventory_bulk_opening.sql',import.meta.url),'utf8').split(/\n/).filter(line=>!line.trimStart().startsWith('--')).join('\n').split(';').map(x=>x.trim()).filter(Boolean);
async function inspect(pool){
 const [tables]=await pool.execute(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('inventory_bulk_opening_batches','inventory_bulk_opening_lines')`);
 const existing=new Set(tables.map(t=>t.name));
 const [history]=await pool.execute("SELECT COUNT(*) AS amount FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='tpos_feature_setup_history'");
 let markerRecorded=false;if(Number(history[0]?.amount)){
  const [rows]=await pool.execute('SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code=?',[feature]);markerRecorded=Boolean(rows.length);
 }
 const missing=names.filter(n=>!existing.has(n));const invalid=[];
 for(const table of names.filter(n=>existing.has(n))){
  const [columns]=await pool.execute('SELECT column_name AS name,column_type AS type,is_nullable AS nullable FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
  const found=new Map(columns.map(r=>[r.name,r]));
  for(const [name,type] of Object.entries(expected[table].columns))if(!found.has(name)||String(found.get(name).type).toLowerCase()!==type||found.get(name).nullable!=='NO')invalid.push(`${table}.${name}`);
  const [indexes]=await pool.execute('SELECT index_name AS name,column_name AS col,seq_in_index AS seq,non_unique AS nonUnique FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?',[table]);
  for(const [name,cols] of Object.entries(expected[table].indices)){
   const actual=indexes.filter(i=>i.name===name).sort((a,b)=>Number(a.seq)-Number(b.seq));
   if(actual.length!==cols.length||actual.some((i,n)=>i.col!==cols[n]||Number(i.nonUnique)!==0))invalid.push(`${table}.${name}`);
  }
 }
 const blockers=[...invalid,...(!Number(history[0]?.amount)?['HISTORY_TABLE_MISSING']:[]),...(markerRecorded&&missing.length?['MARKER_WITH_MISSING_TABLES']:[])];
 return {current:missing.length===0&&invalid.length===0&&markerRecorded,repairable:blockers.length===0,markerRecorded,missingTables:missing,invalid,blockers};
}
let failed=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){const tenantId=String(tenant.id);
  try{
   if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('INVENTORY_038_TENANT_IDENTITY_MISMATCH');quoteIdentifier(tenant.db_name);
   const pool=tenantPool(tenantId);const before=await inspect(pool);
   if(!apply){const status=before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW';if(!before.repairable)failed++;console.log(JSON.stringify({event:'inventory_bulk_opening_tenant',tenantId,status,applied:false,diagnostic:before}));continue;}
   if(!before.repairable)throw Error('INVENTORY_038_MANUAL_REVIEW');
   if(!before.current){
    // Every DDL is additive; never replay old Inventory migrations or overwrite data.
    for(let i=0;i<names.length;i++)if(before.missingTables.includes(names[i]))await pool.query(sql[i]);
    const interim=await inspect(pool);if(!interim.repairable||interim.missingTables.length)throw Error('INVENTORY_038_SCHEMA_VERIFY_FAILED');
    await pool.execute('INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES(?)',[feature]);
    const final=await inspect(pool);if(!final.current)throw Error('INVENTORY_038_FINAL_VERIFY_FAILED');
   }
   console.log(JSON.stringify({event:'inventory_bulk_opening_tenant',tenantId,status:before.current?'CURRENT':'APPLIED',applied:!before.current}));
  }catch(error){failed++;console.error(JSON.stringify({event:'inventory_bulk_opening_tenant',tenantId,status:'FAILED',error:error.code||error.message}));}
 }
 console.log(JSON.stringify({event:'inventory_bulk_opening_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
