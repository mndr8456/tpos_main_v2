// Product setup for existing active tenants. Read-only unless --apply is provided.
import { centralPool,tenantPool,executeSchema,closePools } from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){try{
  const p=tenantPool(t.id);
  const [tables]=await p.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('products','product_audit_logs','product_branch_prices','product_packaging_units','product_components','product_barcodes')");
  const [permissions]=await p.execute("SELECT code FROM permissions WHERE code LIKE 'products.%'");
  const [ownerGrants]=await p.execute("SELECT rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id WHERE r.code='OWNER' AND rp.permission_code LIKE 'products.%'");
  const [columns]=await p.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='products' AND COLUMN_NAME IN ('product_structure','base_unit_code')");
  const hasOldProduct=tables.some(x=>x.TABLE_NAME==='products')&&columns.length<2;
  if(hasOldProduct)throw Object.assign(new Error('PRODUCT_R1_SCHEMA_PRESENT_R2_REQUIRES_SEPARATE_MIGRATION'),{code:'PRODUCT_R1_SCHEMA_PRESENT_R2_REQUIRES_SEPARATE_MIGRATION'});
  const current=tables.length===6&&columns.length===2&&permissions.length===9&&ownerGrants.length===9;
  if(apply)await executeSchema(t.db_name,'007_tenant_products.sql');
  console.log(JSON.stringify({tenantId:String(t.id),status:apply?'APPLIED':current?'CURRENT':'MISSING',mode:apply?'apply':'read-only'}));
 }catch(e){failures++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}}
 console.log(JSON.stringify({module:'products',tenants:tenants.length,failures,applied:apply}));
}catch(e){failures++;console.error('PRODUCT_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
