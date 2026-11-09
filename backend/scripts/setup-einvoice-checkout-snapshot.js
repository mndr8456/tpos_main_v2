import {centralPool,tenantPool,tenantDatabase,closePools,executeSchema} from '../src/database.js';
const apply=process.argv.includes('--apply');let failures=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   if(t.db_name!==tenantDatabase(t.id))throw Error('EINV_C4_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(t.id);
   const inspect=async()=>{
    const [[t047]]=await pool.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='einvoice_checkout_snapshots'");
    const [triggers]=await pool.execute("SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('einvoice_checkout_no_update','einvoice_checkout_no_delete')");
    const [hist]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('einvoice_document_foundation_r13_046','einvoice_checkout_snapshot_r13_047')");
    return {table:Number(t047.n)===1,triggers:triggers.length,has046:hist.some(x=>x.feature_code==='einvoice_document_foundation_r13_046'),marker:hist.some(x=>x.feature_code==='einvoice_checkout_snapshot_r13_047')};
   };
   let state=await inspect();if(!state.has046)throw Error('EINV_C4_REQUIRES_046');
   const exists=state.table||state.triggers||state.marker;
   if(exists&&!(state.table&&state.triggers===2&&state.marker))throw Error('EINV_C4_PARTIAL_SCHEMA_MANUAL_REVIEW');
   let status=exists?'CURRENT':'MISSING';
   if(apply&&!exists){await executeSchema(t.db_name,'047_tenant_einvoice_checkout_snapshot.sql');state=await inspect();status=state.table&&state.triggers===2&&state.marker?'APPLIED':'FAILED';}
   if(status==='FAILED')failures++;
   console.log(JSON.stringify({event:'einvoice_c4_tenant',tenantId:String(t.id),status,state}));
  }catch(e){failures++;console.error(JSON.stringify({event:'einvoice_c4_tenant',tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'einvoice_c4_complete',tenants:tenants.length,failed:failures,applied:apply}));
}catch(e){failures++;console.error('EINV_C4_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failures)process.exitCode=1;
