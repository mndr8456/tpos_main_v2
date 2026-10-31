// Product KPDN R1: existing tenants, read-only by default; use --apply once per tenant.
import {centralPool,tenantPool,executeSchema,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  const pool=tenantPool(t.id);
  const [base]=await pool.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME IN ('jkdm_tax_type','jkdm_tax_rate','jkdm_tax_inclusive')");
  if(base.length!==3)throw new Error('PRODUCT_R3_SCHEMA_REQUIRED');
  const [columns]=await pool.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME='is_kpdn_controlled'");
  const current=columns.length===1;
  if(apply&&!current)await executeSchema(t.db_name,'015_tenant_product_kpdn.sql');
  console.log(JSON.stringify({tenantId:String(t.id),status:apply&&!current?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(e){failures++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({module:'product-kpdn-r1',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('PRODUCT_KPDN_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
