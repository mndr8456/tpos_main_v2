// Discount Print Settings R2; read-only without --apply, independent of original 009 SQL.
import {centralPool,tenantPool,executeSchema,closePools,tenantDatabase} from '../src/database.js';
const apply=process.argv.includes('--apply');let failed=0;
try{
 const [tenants]=await centralPool().execute("SELECT id,db_name FROM tenants WHERE status='ACTIVE' ORDER BY id");
 for(const t of tenants){
  try{
   if(t.db_name!==tenantDatabase(t.id))throw Error('DISCOUNT_PRINT_TENANT_DATABASE_MISMATCH');
   const pool=tenantPool(t.id);
   async function inspect(){
    const [tables]=await pool.execute("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('discount_print_settings','discount_print_settings_audit')");
    const found=new Set(tables.map(x=>x.TABLE_NAME));
    const missingTables=['discount_print_settings','discount_print_settings_audit'].filter(x=>!found.has(x));
    let missingSeed=true;
    if(!missingTables.includes('discount_print_settings')){const [[row]]=await pool.execute('SELECT id FROM discount_print_settings WHERE id=1');missingSeed=!row;}
    return {missingTables,missingSeed,missing:missingTables.length>0||missingSeed};
   }
   let state=await inspect(),changed=false;
   if(state.missing&&apply){await executeSchema(t.db_name,'020_tenant_discount_print_settings.sql');state=await inspect();changed=!state.missing;}
   if(state.missing&&apply)failed++;
   console.log(JSON.stringify({tenantId:String(t.id),status:state.missing?'MISSING':changed?'APPLIED':'CURRENT',applied:apply,missingTables:state.missingTables,missingSeed:state.missingSeed}));
  }catch(e){failed++;console.error(JSON.stringify({tenantId:String(t.id),status:'FAILED',error:e.code||e.message}));}
 }
 console.log(JSON.stringify({event:'discount_print_settings_complete',tenants:tenants.length,failed,applied:apply}));
}catch(e){failed++;console.error('DISCOUNT_PRINT_SETUP_FAILED',e.code||e.message);}finally{await closePools();}
if(failed)process.exitCode=1;
