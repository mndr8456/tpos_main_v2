// C4.3 R3.1 installer: read-only unless --apply. No previous schema replay.
import {centralPool,tenantPool,tenantDatabase,closePools} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
const columns=['einvoice_state_code','msic_code','business_activity_description'];
async function inspect(pool){
 const [rows]=await pool.execute("SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='company_profiles' AND COLUMN_NAME IN ('einvoice_state_code','msic_code','business_activity_description')");
 const actual=new Map(rows.map(r=>[r.name,r]));
 for(const [name,type] of [['einvoice_state_code','char(2)'],['msic_code','char(5)'],['business_activity_description','varchar(300)']]){
  const r=actual.get(name);
  if(r&&(r.type.toLowerCase()!==type||r.nullable!=='YES'))throw Error('EINV_SUPPLIER_COLUMN_INCOMPATIBLE:'+name);
 }
 const [marker]=await pool.execute("SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code='einvoice_supplier_metadata_r31_051'");
 return {missingColumns:columns.filter(c=>!actual.has(c)),marker:marker.length>0};
}
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   if(t.db_name!==tenantDatabase(t.id))throw Error('TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(t.id);let s=await inspect(pool),status=s.missingColumns.length||!s.marker?'MISSING_OR_PARTIAL':'CURRENT';
   if(apply&&status!=='CURRENT'){
    // No DROP, no rollback of previous Company Profile columns; each ADD individually checked.
    for(const [name,definition] of [['einvoice_state_code','CHAR(2) NULL'],['msic_code','CHAR(5) NULL'],['business_activity_description','VARCHAR(300) NULL']]){
     if(s.missingColumns.includes(name))await pool.query(`ALTER TABLE company_profiles ADD COLUMN ${name} ${definition}`);
    }
    await pool.query("INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('einvoice_supplier_metadata_r31_051')");
    s=await inspect(pool);status=s.missingColumns.length||!s.marker?'FAILED':'APPLIED';
   }
   if(status==='FAILED')failed++;
   console.log(JSON.stringify({event:'einvoice_supplier_metadata_r31',tenantId:String(t.id),status,...s,applied:status==='APPLIED'}));
  }catch(e){failed++;console.error(JSON.stringify({event:'einvoice_supplier_metadata_r31',tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'einvoice_supplier_metadata_complete',failed,applied:apply}));
}catch(e){failed++;console.error('EINV_SUPPLIER_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
