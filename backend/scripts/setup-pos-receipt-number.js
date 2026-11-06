// Migration 037 read-only by default. Applies no changes without --apply.
import {centralPool,tenantPool,tenantDatabase,quoteIdentifier,closePools} from '../src/database.js';
import {FEATURE_037,INDEX_037,assessReceiptNumber037} from '../src/pos-receipt-number-migration.js';
const apply=process.argv.includes('--apply');
let failed=0;
async function inspect(pool){
 const [[{saleCount}]]=await pool.execute("SELECT COUNT(*) AS saleCount FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='pos_sales'");
 const [[{historyCount}]]=await pool.execute("SELECT COUNT(*) AS historyCount FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='tpos_feature_setup_history'");
 if(!Number(historyCount))return assessReceiptNumber037({hasSaleTable:Number(saleCount)>0,has036:false,markerRecorded:false});
 const [markers]=await pool.execute('SELECT feature_code AS feature FROM tpos_feature_setup_history WHERE feature_code IN (?,?)',['pos_receipt_tax_rates_r215_036',FEATURE_037]);
 const installed=new Set(markers.map(row=>String(row.feature)));
 const [columns]=await pool.execute("SELECT column_type AS tpos_type,is_nullable AS tpos_nullable,column_default AS tpos_default,character_set_name AS tpos_charset,collation_name AS tpos_collation FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='pos_sales' AND column_name='receipt_number'");
 const [indices]=await pool.execute('SELECT column_name AS tpos_column,non_unique AS tpos_non_unique,seq_in_index AS tpos_sequence FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name=? AND index_name=?',['pos_sales',INDEX_037]);
 const meta=columns[0];
 return assessReceiptNumber037({hasSaleTable:Number(saleCount)>0,has036:installed.has('pos_receipt_tax_rates_r215_036'),markerRecorded:installed.has(FEATURE_037),column:meta?{type:meta.tpos_type,nullable:meta.tpos_nullable,defaultValue:meta.tpos_default,charset:meta.tpos_charset,collation:meta.tpos_collation}:null,indexRows:indices.map(row=>({column:row.tpos_column,nonUnique:row.tpos_non_unique,sequence:row.tpos_sequence}))});
}
async function recover(pool,before){
 if(!before.repairable)throw Error('POS_037_MANUAL_REVIEW');
 if(before.missingColumn){
  await pool.query('ALTER TABLE pos_sales ADD COLUMN receipt_number VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER id');
  const stage=await inspect(pool);if(!stage.repairable||stage.missingColumn)throw Error('POS_037_COLUMN_VERIFY_FAILED');
 }
 const stage=await inspect(pool);
 if(stage.missingIndex){
  // A unique index on the new nullable column protects future receipt IDs.
  // Historical NULLs remain unmodified and do not conflict under MySQL UNIQUE.
  await pool.query('ALTER TABLE pos_sales ADD UNIQUE KEY uq_pos_sales_receipt_number(receipt_number)');
 }
 const beforeMarker=await inspect(pool);
 if(!beforeMarker.repairable||beforeMarker.missingColumn||beforeMarker.missingIndex)throw Error('POS_037_SCHEMA_VERIFY_FAILED');
 await pool.execute('INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES(?)',[FEATURE_037]);
 const final=await inspect(pool);
 if(!final.current)throw Error('POS_037_FINAL_VERIFY_FAILED');
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  const tenantId=String(tenant.id);
  try{
   if(String(tenant.db_name).toLowerCase()!==tenantDatabase(tenantId).toLowerCase())throw Error('POS_037_TENANT_DB_IDENTITY_MISMATCH');
   quoteIdentifier(tenant.db_name);
   const pool=tenantPool(tenantId);const before=await inspect(pool);
   if(!apply){console.log(JSON.stringify({event:'pos_receipt_number_tenant',tenantId,status:before.current?'CURRENT':before.repairable?'MISSING_OR_PARTIAL':'MANUAL_REVIEW',applied:false,diagnostic:before}));if(!before.repairable)failed++;continue;}
   if(!before.current)await recover(pool,before);
   console.log(JSON.stringify({event:'pos_receipt_number_tenant',tenantId,status:before.current?'CURRENT':'APPLIED',applied:!before.current}));
  }catch(error){failed++;console.error(JSON.stringify({event:'pos_receipt_number_tenant',tenantId,status:'FAILED',error:error.code||error.message}));}
 }
 console.log(JSON.stringify({event:'pos_receipt_number_complete',tenants:tenants.length,failed,applied:apply}));
}catch(error){failed++;console.error(error.code||error.message);}finally{await closePools();}
if(failed)process.exitCode=1;
