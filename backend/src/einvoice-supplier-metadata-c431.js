// C4.3 R3.1: Explicit Owner/Admin-confirmed supplier metadata, tenant-local.
// Leaves locked Company Profile identity and its Central DB transaction unchanged.
import {z} from 'zod';
import {findMsicCodeC432} from './einvoice-msic-c432.js';
import {getStateCodeCandidatesC431, stateCodeMatchesC431} from './einvoice-supplier-state-c431.js';
const error=(code,status=409)=>Object.assign(new Error(code),{status});
const schema=z.object({
 stateCode:z.string().regex(/^(0[1-9]|1[0-7])$/),
 msicCode:z.string().regex(/^\d{5}$/),
 businessActivityDescription:z.string().trim().min(1).max(300)
}).strict();
const checkRole=req=>['OWNER','ADMIN'].includes(req.auth?.user?.role_code)&&req.auth?.user?.permissions?.includes('company_profile.manage');
const getRow=async conn=>{
 const [[row]]=await conn.execute(`SELECT state,country,einvoice_state_code AS stateCode,msic_code AS msicCode,
 business_activity_description AS businessActivityDescription FROM company_profiles WHERE id=1`);
 if(!row)throw error('EINV_SUPPLIER_PROFILE_NOT_FOUND');
 return row;
};
export async function getSupplierMetadataC431(req,res){
 const row=await getRow(req.auth.pool);
 return res.set('Cache-Control','no-store').json({metadata:{stateName:row.state,country:row.country,
   stateCode:row.stateCode??'',msicCode:row.msicCode??'',businessActivityDescription:row.businessActivityDescription??''},
   suggestedStateCodes:getStateCodeCandidatesC431(row.state,row.country),canManage:checkRole(req),submissionEnabled:false});
}
export async function saveSupplierMetadataC431(req,res){
 if(!checkRole(req))throw error('EINV_SUPPLIER_MANAGE_REQUIRED',403);
 const input=schema.parse(req.body);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[before]]=await conn.execute(`SELECT state,country,einvoice_state_code AS stateCode,msic_code AS msicCode,
  business_activity_description AS businessActivityDescription FROM company_profiles WHERE id=1 FOR UPDATE`);
  if(!before)throw error('EINV_SUPPLIER_PROFILE_NOT_FOUND');
  if(!stateCodeMatchesC431(before.state,before.country,input.stateCode))throw error('EINV_SUPPLIER_STATE_CODE_MISMATCH',422);
  if(!await findMsicCodeC432(input.msicCode))throw error('EINV_SUPPLIER_MSIC_NOT_IN_OFFICIAL_CATALOG',422);
  await conn.execute(`UPDATE company_profiles SET einvoice_state_code=?,msic_code=?,business_activity_description=? WHERE id=1`,
   [input.stateCode,input.msicCode,input.businessActivityDescription]);
  const after={...before,stateCode:input.stateCode,msicCode:input.msicCode,businessActivityDescription:input.businessActivityDescription};
  if(before.stateCode!==input.stateCode||before.msicCode!==input.msicCode||before.businessActivityDescription!==input.businessActivityDescription){
   await conn.execute(`INSERT INTO company_profile_audit_logs(actor_user_id,previous_data,next_data,recorded_at)
    VALUES(?,?,?,UTC_TIMESTAMP(6))`,
    [req.auth.user.id,JSON.stringify({einvoiceSupplier:{stateCode:before.stateCode,msicCode:before.msicCode,businessActivityDescription:before.businessActivityDescription}}),
     JSON.stringify({einvoiceSupplier:{stateCode:after.stateCode,msicCode:after.msicCode,businessActivityDescription:after.businessActivityDescription}})]);
  }
  await conn.commit();
  return res.set('Cache-Control','no-store').json({metadata:{stateName:after.state,country:after.country,
   stateCode:after.stateCode,msicCode:after.msicCode,businessActivityDescription:after.businessActivityDescription},submissionEnabled:false});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
