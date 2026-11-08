// Explicit --apply installer; fail closed on schema drift or incomplete prerequisites.
import {centralPool,tenantPool,tenantDatabase,closePools,executeSchema} from '../src/database.js';
const apply=process.argv.includes('--apply');
const names=['einvoice_documents','einvoice_submission_attempts','einvoice_document_audit'];
const marker='einvoice_document_foundation_r13_046';let failures=0;
try {
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try {
   if(t.db_name!==tenantDatabase(t.id))throw Error('EINV_R13_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(t.id);
   const inspect=async()=>{
    const [tables]=await pool.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('einvoice_documents','einvoice_submission_attempts','einvoice_document_audit','einvoice_customer_requests','einvoice_customer_request_audit')");
    const [history]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('einvoice_customer_request_r12_045','einvoice_document_foundation_r13_046')");
    const has=x=>tables.some(r=>r.name===x);
    const marked=x=>history.some(r=>r.feature_code===x);
    return {missingTables:names.filter(x=>!has(x)),has045:has('einvoice_customer_requests')&&has('einvoice_customer_request_audit')&&marked('einvoice_customer_request_r12_045'),has046:marked(marker)};
   };
   let detail=await inspect();let status=detail.missingTables.length===0&&detail.has046?'CURRENT':'MISSING';
   if(!detail.has045)throw Error('EINV_R13_REQUIRES_MIGRATION_045');
   if(detail.missingTables.length!==0&&detail.missingTables.length!==names.length)throw Error('EINV_R13_PARTIAL_SCHEMA_MANUAL_REVIEW');
   if(detail.missingTables.length===0&&!detail.has046)throw Error('EINV_R13_MISSING_MARKER_MANUAL_REVIEW');
   if(apply&&status==='MISSING'){
    await executeSchema(t.db_name,'046_tenant_einvoice_document_foundation.sql');
    detail=await inspect();status=detail.missingTables.length===0&&detail.has046?'APPLIED':'FAILED';
   }
   if(status==='FAILED')failures++;
   console.log(JSON.stringify({event:'einvoice_r13_foundation_tenant',tenantId:String(t.id),status,detail,applied:status==='APPLIED'}));
  }catch(e){failures++;console.error(JSON.stringify({event:'einvoice_r13_foundation_tenant',tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'einvoice_r13_foundation_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error('EINV_R13_SETUP_FAILED',e.code||e.message);}finally{await closePools();}if(failures)process.exitCode=1;
