// EINV C4.2A tenant-only installer. Inspection is read-only unless --apply.
import {centralPool,tenantPool,tenantDatabase,closePools,executeSchema} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try {
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try {
   if(tenant.db_name!==tenantDatabase(tenant.id))throw Error('EINV_C42_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(tenant.id);
   const inspect=async()=>{
    const [[table]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='einvoice_line_tax_evidence_c42'");
    const [triggers]=await pool.execute("SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('einvoice_line_tax_no_update','einvoice_line_tax_no_delete')");
    const [history]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('einvoice_checkout_snapshot_r13_047','einvoice_line_tax_evidence_c42_048')");
    return {table:Number(table?.n)===1,triggers:triggers.length,has047:history.some(x=>x.feature_code==='einvoice_checkout_snapshot_r13_047'),marker:history.some(x=>x.feature_code==='einvoice_line_tax_evidence_c42_048')};
   };
   let state=await inspect();if(!state.has047)throw Error('EINV_C42_REQUIRES_047');
   const any=state.table||state.triggers||state.marker;
   if(any&&!(state.table&&state.triggers===2&&state.marker))throw Error('EINV_C42_PARTIAL_SCHEMA_MANUAL_REVIEW');
   let status=any?'CURRENT':'MISSING';
   if(apply&&!any){await executeSchema(tenant.db_name,'048_tenant_einvoice_line_tax_evidence.sql');state=await inspect();status=state.table&&state.triggers===2&&state.marker?'APPLIED':'FAILED';}
   if(status==='FAILED')failures++;
   console.log(JSON.stringify({event:'einvoice_c42_tenant',tenantId:String(tenant.id),status,state}));
  }catch(e){failures++;console.error(JSON.stringify({event:'einvoice_c42_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'einvoice_c42_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error('EINV_C42_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
