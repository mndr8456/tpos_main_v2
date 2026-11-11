// Tenant-scoped migration 052: inspect by default; --apply makes changes.
import {centralPool,tenantPool,tenantDatabase,closePools,executeSchema} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const tenant of tenants){
  try{
   if(tenant.db_name!==tenantDatabase(tenant.id))throw Error('EINV_V10_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(tenant.id);
   const inspect=async()=>{
    const [history]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('einvoice_document_foundation_r13_046','einvoice_verified_mapping_c42b_049','einvoice_sandbox_invoice_v10_052')");
    const codes=new Set(history.map(x=>x.feature_code));
    const [[constraint]]=await pool.execute("SELECT CHECK_CLAUSE AS clause_text FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME='chk_einvoice_document_version'");
    return {foundation:codes.has('einvoice_document_foundation_r13_046'),mapping:codes.has('einvoice_verified_mapping_c42b_049'),marker:codes.has('einvoice_sandbox_invoice_v10_052'),allowsV10:/1\.0/.test(constraint?.clause_text||'')};
   };
   let state=await inspect();if(!state.foundation||!state.mapping)throw Error('EINV_V10_REQUIRES_046_AND_049');
   if(state.marker!==state.allowsV10)throw Error('EINV_V10_PARTIAL_SCHEMA_MANUAL_REVIEW');
   let status=state.marker?'CURRENT':'MISSING';
   if(apply&&status==='MISSING'){
    await executeSchema(tenant.db_name,'052_tenant_einvoice_sandbox.sql');
    state=await inspect();status=state.marker&&state.allowsV10?'APPLIED':'FAILED';
   }
   if(status==='FAILED')failures++;
   console.log(JSON.stringify({event:'einvoice_sandbox_v10_tenant',tenantId:String(tenant.id),status,state}));
  }catch(e){failures++;console.error(JSON.stringify({event:'einvoice_sandbox_v10_tenant',tenantId:String(tenant.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'einvoice_sandbox_v10_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error('EINV_V10_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
