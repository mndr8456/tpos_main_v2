// Customer Display R1 migration 041. Read-only by default, explicit --apply required.
import {readFileSync} from 'node:fs';
import {centralPool,tenantPool,tenantDatabase,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');
const tables=['customer_display_settings','customer_display_media','customer_display_sessions','customer_display_audit'];
const permissionList=['customer_display.view','customer_display.manage','customer_display.pair','customer_display.publish'];
const feature='customer_display_r1_041';
const columns={
 customer_display_settings:['id','success_english','success_malay','media_interval_seconds','success_seconds','promotions_enabled'],
 customer_display_media:['id','title','media_type','mime_type','file_data','sort_order','is_active'],
 customer_display_sessions:['id','branch_id','cashier_user_id','token_hash','draft_id','mode','attempt_id','snapshot','expires_at'],
 customer_display_audit:['id','actor_user_id','event_type','details','recorded_at']
};
const indexes={customer_display_sessions:['uq_cd_cashier_branch','uq_cd_session_token'],customer_display_media:['ix_cd_media_order'],customer_display_audit:['ix_cd_audit_recorded']};
const sql=readFileSync(new URL('../../database/041_tenant_customer_display.sql',import.meta.url),'utf8');
const statements=sql.split('\n').filter(line=>!line.trimStart().startsWith('--')).join('\n').split(';').map(s=>s.trim()).filter(Boolean);
if(statements.length!==8)throw Error(`CD_MIGRATION_STATEMENTS_CHANGED_${statements.length}`);
export async function inspectCustomerDisplay(pool){
 const [r]=await pool.execute(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('customer_display_settings','customer_display_media','customer_display_sessions','customer_display_audit','tpos_feature_setup_history')`);
 const currentTables=new Set(r.map(x=>x.name)),missingTables=tables.filter(t=>!currentTables.has(t));const invalid=[];
 for(const table of tables.filter(t=>currentTables.has(t))){
  const [fields]=await pool.execute('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=?',[table]);
  const present=new Set(fields.map(r=>r.name));for(const f of columns[table])if(!present.has(f))invalid.push(`${table}.${f}`);
  if(indexes[table]){const [inds]=await pool.execute('SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=?',[table]);const keys=new Set(inds.map(r=>r.name));for(const k of indexes[table])if(!keys.has(k))invalid.push(`${table}.${k}`);}
 }
 const [rows]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'customer_display.%'");const found=new Set(rows.map(r=>r.code));const missingPermissions=permissionList.filter(x=>!found.has(x));
 let markerRecorded=false;if(currentTables.has('tpos_feature_setup_history')){const [h]=await pool.execute('SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code=?',[feature]);markerRecorded=h.length>0;}
 const blockers=[...invalid,...(!currentTables.has('tpos_feature_setup_history')?['FEATURE_HISTORY_MISSING']:[]),...(markerRecorded&&(missingTables.length||missingPermissions.length)?['MARKER_WITH_PARTIAL_SCHEMA']:[])];
 return {current:markerRecorded&&!missingTables.length&&!missingPermissions.length&&!invalid.length,repairable:!blockers.length,markerRecorded,missingTables,missingPermissions,invalid,blockers};
}
export async function runCustomerDisplayInstaller(){let failed=0;try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){const tenantId=String(tenant.id);try{
  if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('CD_TENANT_IDENTITY_MISMATCH');
  const pool=tenantPool(tenantId),before=await inspectCustomerDisplay(pool);
  if(!apply){if(!before.repairable)failed++;console.log(JSON.stringify({event:'customer_display_tenant',tenantId,status:before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW',applied:false,diagnostic:before}));continue;}
  if(!before.repairable)throw Error('CD_MANUAL_REVIEW_REQUIRED');
  if(!before.current){for(let i=0;i<tables.length;i++)if(before.missingTables.includes(tables[i]))await pool.query(statements[i]);
   if(!before.markerRecorded)for(let i=4;i<statements.length;i++)await pool.query(statements[i]);
   const after=await inspectCustomerDisplay(pool);if(!after.current)throw Error('CD_SCHEMA_VERIFICATION_FAILED');
  }
  console.log(JSON.stringify({event:'customer_display_tenant',tenantId,status:before.current?'CURRENT':'APPLIED',applied:!before.current}));
 }catch(e){failed++;console.error(JSON.stringify({event:'customer_display_tenant',tenantId,status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'customer_display_complete',tenants:tenants.length,failed,applied:apply}));
 }catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}if(failed)process.exitCode=1;
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/setup-customer-display.js'))await runCustomerDisplayInstaller();
