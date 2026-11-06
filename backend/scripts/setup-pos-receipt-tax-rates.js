// Read-only by default; apply 036 only after backup, with backend stopped.
// DDL is append-only and resumable after partial installation. No historic rate guesses.
import {centralPool,tenantPool,tenantDatabase,quoteIdentifier,closePools} from '../src/database.js';
import {FEATURE_036,RATE_COLUMNS,assessRateSnapshot036} from '../src/pos-receipt-tax-rates-migration.js';
const apply=process.argv.includes('--apply');
let failed=0;
async function inspect(pool){
 const [[{count:saleCount}]]=await pool.execute("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='pos_sales'");
 const [[{count:historyCount}]]=await pool.execute("SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='tpos_feature_setup_history'");
 if(!Number(historyCount))return assessRateSnapshot036({hasSaleTable:Number(saleCount)>0,has035:false,markerRecorded:false,columns:{}});
 const [markers]=await pool.execute('SELECT feature_code AS feature FROM tpos_feature_setup_history WHERE feature_code IN (?,?)',['pos_multi_payment_r21_035',FEATURE_036]);
 const installed=new Set(markers.map(row=>String(row.feature)));
 const [rows]=await pool.execute("SELECT column_name AS tpos_name,column_type AS tpos_type,is_nullable AS tpos_nullable,column_default AS tpos_default FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pos_sales' AND column_name IN ('sales_tax_rate_pct','service_tax_rate_pct','service_charge_rate_pct')");
 const columns=Object.fromEntries(rows.map(row=>[String(row.tpos_name).toLowerCase(),{type:row.tpos_type,nullable:row.tpos_nullable,defaultValue:row.tpos_default}]));
 return assessRateSnapshot036({hasSaleTable:Number(saleCount)>0,has035:installed.has('pos_multi_payment_r21_035'),markerRecorded:installed.has(FEATURE_036),columns});
}
async function recover(pool,state){
 if(!state.repairable)throw Error('POS_036_MANUAL_REVIEW');
 for(const name of RATE_COLUMNS){
  if(!state.missingColumns.includes(name))continue;
  // Identifier must come from our hardcoded RATE_COLUMNS, never external input.
  await pool.query(`ALTER TABLE pos_sales ADD COLUMN ${name} DECIMAL(6,3) NULL`);
  const after=await inspect(pool);
  if(!after.repairable)throw Error(`POS_036_VERIFY_FAILED:${JSON.stringify(after)}`);
 }
 const afterColumns=await inspect(pool);
 if(afterColumns.missingColumns.length||!afterColumns.repairable)throw Error('POS_036_COLUMNS_NOT_CURRENT');
 await pool.execute('INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES(?)',[FEATURE_036]);
 const final=await inspect(pool);
 if(!final.current)throw Error(`POS_036_VERIFY_FAILED:${JSON.stringify(final)}`);
 return final;
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  const tenantId=String(tenant.id);
  try{
   if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('POS_036_TENANT_DB_IDENTITY_MISMATCH');
   quoteIdentifier(tenant.db_name);
   const pool=tenantPool(tenantId);
   const before=await inspect(pool);
   if(!apply){console.log(JSON.stringify({event:'pos_receipt_tax_rates_tenant',tenantId,status:before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW',applied:false,diagnostic:before}));if(!before.repairable)failed++;continue;}
   if(!before.current)await recover(pool,before);
   console.log(JSON.stringify({event:'pos_receipt_tax_rates_tenant',tenantId,status:before.current?'CURRENT':'APPLIED',applied:!before.current}));
  }catch(error){failed++;console.error(JSON.stringify({event:'pos_receipt_tax_rates_tenant',tenantId,status:'FAILED',error:error.code||error.message}));}
 }
 console.log(JSON.stringify({event:'pos_receipt_tax_rates_complete',tenants:tenants.length,failed,applied:apply}));
}catch(error){failed++;console.error(error.code||error.message);}finally{await closePools();}
if(failed)process.exitCode=1;
