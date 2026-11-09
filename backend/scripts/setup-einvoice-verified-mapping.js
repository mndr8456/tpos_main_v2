// EINV C4.2B tenant-only installer. Inspection is read-only unless --apply.
import {centralPool,tenantPool,tenantDatabase,closePools,executeSchema} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try {
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try {
   if(tenant.db_name!==tenantDatabase(tenant.id))throw Error('EINV_C42B_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(tenant.id);
   const inspect=async()=>{
    const [[table]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='einvoice_line_mapping_evidence_c42b'");
    const [triggers]=await pool.execute("SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('einv_c42b_sale_no_update','einv_c42b_sale_no_delete','einv_c42b_audit_no_update','einv_c42b_audit_no_delete')");
    const [history]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('einvoice_line_tax_evidence_c42_048','einvoice_verified_mapping_c42b_049')");
    return {table:Number(table?.n)===1,triggers:triggers.length,has048:history.some(x=>x.feature_code==='einvoice_line_tax_evidence_c42_048'),marker:history.some(x=>x.feature_code==='einvoice_verified_mapping_c42b_049')};
   };
   let state=await inspect();if(!state.has048)throw Error('EINV_C42B_REQUIRES_048');
   const [[master]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('einvoice_product_mapping_c42b','einvoice_product_mapping_audit_c42b')");
   state.masterTables=Number(master?.n);
   const any=state.table||state.triggers||state.marker||state.masterTables;
   if(any&&!(state.table&&state.masterTables===2&&state.triggers===4&&state.marker))throw Error('EINV_C42B_PARTIAL_SCHEMA_MANUAL_REVIEW');
   let status=any?'CURRENT':'MISSING';
   if(apply&&!any){await executeSchema(tenant.db_name,'049_tenant_einvoice_verified_mapping.sql');state=await inspect();const [[created]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('einvoice_product_mapping_c42b','einvoice_product_mapping_audit_c42b')");state.masterTables=Number(created?.n);status=state.table&&state.masterTables===2&&state.triggers===4&&state.marker?'APPLIED':'FAILED';}
   if(status==='FAILED')failures++;
   console.log(JSON.stringify({event:'einvoice_c42b_tenant',tenantId:String(tenant.id),status,state}));
  }catch(e){failures++;console.error(JSON.stringify({event:'einvoice_c42b_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'einvoice_c42b_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error('EINV_C42B_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
