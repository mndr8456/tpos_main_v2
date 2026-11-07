// Tenant KDS 040 installer: inspect-only unless --apply; NEVER resets existing grants/history.
import {readFileSync} from 'node:fs';
import {centralPool,tenantPool,tenantDatabase,quoteIdentifier,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
const feature='kds_r1_040';
const tables=['kds_tickets','kds_ticket_lines','kds_ticket_audit'];
const permissions=['kds.view','kds.update_status','kds.dispatch','kds.print','kds.cancel','kds.audit'];
const expected={
 kds_tickets:{columns:['id','branch_id','waiter_order_id','pos_draft_id','source_type','order_scope','table_number','created_by_user_id','created_at'],indexes:['uq_kds_waiter_order','uq_kds_pos_draft','ix_kds_ticket_branch_time']},
 kds_ticket_lines:{columns:['id','ticket_id','origin_line_id','product_id','station_id','station_code','status','version','started_at','ready_at','completed_at','cancelled_at'],indexes:['uq_kds_origin_line','ix_kds_station_status']},
 kds_ticket_audit:{columns:['id','ticket_id','line_id','actor_user_id','action_type','previous_status','new_status','details','recorded_at'],indexes:['ix_kds_audit_ticket']}
};
const content=readFileSync(new URL('../../database/040_tenant_kds.sql',import.meta.url),'utf8');
const statements=content.split('\n').filter(s=>!s.trimStart().startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
if(statements.length!==8)throw Error(`KDS_MIGRATION_STATEMENTS_CHANGED_${statements.length}`);
export async function inspectKds(pool){
 const [r]=await pool.execute(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('kds_tickets','kds_ticket_lines','kds_ticket_audit','tpos_feature_setup_history')`);
 const existing=new Set(r.map(x=>x.name));const missingTables=tables.filter(t=>!existing.has(t));const invalid=[];
 for(const table of tables.filter(t=>existing.has(t))){
  const [cols]=await pool.execute('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
  const names=new Set(cols.map(x=>x.name));for(const col of expected[table].columns)if(!names.has(col))invalid.push(`${table}.${col}`);
  const [ix]=await pool.execute('SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?',[table]);
  const indexes=new Set(ix.map(x=>x.name));for(const key of expected[table].indexes)if(!indexes.has(key))invalid.push(`${table}.${key}`);
 }
 const [p]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'kds.%'");const present=new Set(p.map(x=>x.code));const missingPermissions=permissions.filter(x=>!present.has(x));
 let markerRecorded=false;if(existing.has('tpos_feature_setup_history')){const [history]=await pool.execute('SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code=?',[feature]);markerRecorded=history.length>0;}
 const blockers=[...invalid,...(!existing.has('tpos_feature_setup_history')?['FEATURE_HISTORY_MISSING']:[]),...(markerRecorded&&(missingTables.length||missingPermissions.length)?['MARKER_WITH_PARTIAL_SCHEMA']:[])];
 return {current:markerRecorded&&missingTables.length===0&&missingPermissions.length===0&&invalid.length===0,repairable:blockers.length===0,markerRecorded,missingTables,missingPermissions,invalid,blockers};
}
export async function runKdsInstaller(){let failed=0;
 try{const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
  for(const tenant of tenants){const tenantId=String(tenant.id);try{
   if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('KDS_TENANT_IDENTITY_MISMATCH');quoteIdentifier(tenant.db_name);
   const pool=tenantPool(tenantId),before=await inspectKds(pool);
   if(!apply){if(!before.repairable)failed++;console.log(JSON.stringify({event:'kds_tenant',tenantId,status:before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW',applied:false,diagnostic:before}));continue;}
   if(!before.repairable)throw Error('KDS_MANUAL_REVIEW_REQUIRED');
   if(!before.current){for(let i=0;i<tables.length;i++)if(before.missingTables.includes(tables[i]))await pool.query(statements[i]);
    if(!before.markerRecorded){for(let i=tables.length;i<statements.length;i++)await pool.query(statements[i]);}
    const after=await inspectKds(pool);if(!after.current)throw Error('KDS_SCHEMA_VERIFICATION_FAILED');
   }
   console.log(JSON.stringify({event:'kds_tenant',tenantId,status:before.current?'CURRENT':'APPLIED',applied:!before.current}));
  }catch(e){failed++;console.error(JSON.stringify({event:'kds_tenant',tenantId,status:'FAILED',error:e.code||e.message}));}}
  console.log(JSON.stringify({event:'kds_complete',tenants:tenants.length,failed,applied:apply}));
 }catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}if(failed)process.exitCode=1;
}
// Only run as CLI; tests import inspection without connecting to MySQL.
if(process.argv[1]?.replaceAll('\\','/').endsWith('/setup-kds.js'))await runKdsInstaller();
