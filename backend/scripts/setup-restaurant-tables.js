// Additive tenant schema 021. Read-only by default; --apply explicitly executes once per eligible tenant.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const tables=['restaurant_tables','restaurant_table_audit_logs'];
const columns=['table_id','active_table_id'];
const permissions=['restaurant_tables.view','restaurant_tables.create','restaurant_tables.update','restaurant_tables.delete','restaurant_tables.import','restaurant_tables.export','restaurant_tables.audit'];
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  const pool=tenantPool(t.id);
  const [ts]=await pool.execute('SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?,?)',tables);
  const [cols]=await pool.execute("SELECT column_name AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pos_drafts' AND column_name IN ('table_id','active_table_id')");
  const [indexes]=await pool.execute("SELECT index_name AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='pos_drafts' AND index_name='uq_pos_draft_live_table'");
  const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'restaurant_tables.%'");
  const [grants]=await pool.execute("SELECT r.code AS role,rp.permission_code AS permission FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'restaurant_tables.%'");
  const missingTables=tables.filter(x=>!ts.some(y=>y.name===x));const missingColumns=columns.filter(x=>!cols.some(y=>y.name===x));
  const missingPermissions=permissions.filter(x=>!perms.some(y=>y.code===x));
  const missingGrants=permissions.filter(x=>!grants.some(g=>g.role==='OWNER'&&g.permission===x));
  const current=!missingTables.length&&!missingColumns.length&&indexes.length>0&&!missingPermissions.length&&!missingGrants.length;
  // If a partial migration occurred, do not retry ALTER blindly. Administrator must reconcile.
  const partial=(missingTables.length!==tables.length||missingColumns.length!==columns.length||indexes.length>0)&&!current;
  if(apply&&!current&&partial)throw new Error('PARTIAL_SCHEMA_REQUIRES_MANUAL_REVIEW');
  if(apply&&!current)await executeSchema(t.db_name,'021_tenant_restaurant_tables.sql');
  console.log(JSON.stringify({tenantId:String(t.id),status:current?'CURRENT':apply?'APPLIED':'MISSING',applied:apply&&!current,missingTables,missingColumns,missingPermissions,missingGrants}));
 }catch(e){failed++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({event:'restaurant_tables_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error(e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
