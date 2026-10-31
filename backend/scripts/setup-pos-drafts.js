// Additive POS drafts migration 017; read-only inspection unless --apply is supplied.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
const tables=['pos_drafts','pos_draft_lines','pos_draft_commands','pos_draft_audit_logs'];
const codes=['pos.view','pos.cart.manage','pos.audit'];
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  const pool=tenantPool(t.id);
  const [rows]=await pool.execute(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('pos_drafts','pos_draft_lines','pos_draft_commands','pos_draft_audit_logs')`);
  const [perms]=await pool.execute("SELECT code FROM permissions WHERE code LIKE 'pos.%'");
  const [grants]=await pool.execute("SELECT r.code AS role,rp.permission_code AS code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE rp.permission_code LIKE 'pos.%'");
  const names=new Set(rows.map(r=>r.name)),p=new Set(perms.map(r=>r.code)),g=new Set(grants.map(r=>`${r.role}:${r.code}`));
  const roles=['OWNER','ADMIN','MANAGER','SUPERVISOR','CASHIER'];
  const current=tables.every(x=>names.has(x))&&codes.every(x=>p.has(x))&&roles.every(r=>codes.every(c=>g.has(`${r}:${c}`)));
  if(apply&&!current)await executeSchema(t.db_name,'017_tenant_pos_drafts.sql');
  console.log(JSON.stringify({tenantId:String(t.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(err){failures++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:err.code||err.message}));}}
 console.log(JSON.stringify({module:'pos-drafts-r1',tenants:tenants.length,failures,applied:apply}));
}catch(err){failures++;console.error('POS_DRAFTS_SETUP_FAILED',err.code||err.message);}finally{await closePools();}
if(failures)process.exitCode=1;
