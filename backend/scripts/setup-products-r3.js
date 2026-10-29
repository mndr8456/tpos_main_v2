// Product R3 only. Read-only by default; --apply performs additive migration.
import { centralPool,tenantPool,executeSchema,closePools } from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  const p=tenantPool(t.id);
  const [base]=await p.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME IN ('product_structure','base_unit_code')");
  if(base.length!==2)throw new Error('PRODUCT_R2_SCHEMA_REQUIRED');
  const [columns]=await p.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME IN ('jkdm_tax_type','jkdm_tax_rate','jkdm_tax_inclusive')");
  const count=columns.length;
  if(count!==0&&count!==3)throw new Error('PRODUCT_R3_PARTIAL_MIGRATION_REVIEW_REQUIRED');
  if(apply&&count===0)await executeSchema(t.db_name,'008_tenant_product_r3.sql');
  console.log(JSON.stringify({tenantId:String(t.id),status:count===3?'CURRENT':apply?'APPLIED':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(e){failures++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({module:'products-r3',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('PRODUCT_R3_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
