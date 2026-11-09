// Read-only by default; --apply only after 049 verified and an operator backup.
import {centralPool,tenantPool,tenantDatabase,closePools,executeSchema} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   if(t.db_name!==tenantDatabase(t.id))throw Error('POS_REDUCTION_TENANT_MISMATCH');
   const db=tenantPool(t.id);
   const inspect=async()=>{
    const [rows]=await db.execute("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('pos_sale_reductions','pos_payment_attempt_reductions','einvoice_line_mapping_evidence_c42b')");
    const [triggers]=await db.execute("SELECT TRIGGER_NAME AS name FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('psr_no_update','psr_no_delete','ppar_no_delete')");
    const [history]=await db.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('einvoice_verified_mapping_c42b_049','pos_reduction_settlement_050')");
    return {tables:rows.map(r=>r.name),triggers:triggers.map(r=>r.name),has049:history.some(r=>r.feature_code==='einvoice_verified_mapping_c42b_049'),marker:history.some(r=>r.feature_code==='pos_reduction_settlement_050')};
   };
   let state=await inspect();
   if(!state.has049||!state.tables.includes('einvoice_line_mapping_evidence_c42b'))throw Error('POS_REDUCTION_REQUIRES_049');
   const any=state.tables.includes('pos_sale_reductions')||state.tables.includes('pos_payment_attempt_reductions')||state.triggers.length>0||state.marker;
   const current=state.tables.includes('pos_sale_reductions')&&state.tables.includes('pos_payment_attempt_reductions')&&state.triggers.length===3&&state.marker;
   if(any&&!current)throw Error('POS_REDUCTION_PARTIAL_SCHEMA_MANUAL_REVIEW');
   let status=current?'CURRENT':'MISSING';
   if(apply&&!current){await executeSchema(t.db_name,'050_tenant_pos_reduction_settlement.sql');state=await inspect();status=state.tables.includes('pos_sale_reductions')&&state.tables.includes('pos_payment_attempt_reductions')&&state.triggers.length===3&&state.marker?'APPLIED':'FAILED';}
   if(status==='FAILED')failed++;
   console.log(JSON.stringify({event:'pos_reduction_tenant',tenantId:String(t.id),status,state}));
  }catch(e){failed++;console.error(JSON.stringify({event:'pos_reduction_tenant',tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'pos_reduction_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('POS_REDUCTION_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
