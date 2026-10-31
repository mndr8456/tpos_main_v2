import {z} from 'zod';

// Merchant-imposed service charge. Never treat this as a JKDM SST registration or liability.
const configSchema=z.object({
 isEnabled:z.boolean(),
 chargeRate:z.string().regex(/^(?:0|[1-9]\d?|100)(?:\.\d{1,2})?$/).refine(v=>Number(v)<=100),
 applyDineIn:z.boolean(),applyTakeAway:z.boolean()
}).strict();
const httpError=(code,status=400)=>Object.assign(new Error(code),{status});
const owner=req=>req.auth.user.role_code==='OWNER';
const shape=row=>({isEnabled:Boolean(row.is_enabled),chargeRate:String(row.charge_rate),applyDineIn:Boolean(row.apply_dine_in),applyTakeAway:Boolean(row.apply_take_away)});
export async function readServiceChargeSettings(pool){
 const [[row]]=await pool.execute('SELECT is_enabled,charge_rate,apply_dine_in,apply_take_away FROM service_charge_settings WHERE id=1');
 if(!row)throw httpError('SERVICE_CHARGE_SETUP_REQUIRED',409);
 return shape(row);
}
export async function getServiceChargeSettings(req,res){
 const settings=await readServiceChargeSettings(req.auth.pool);
 return res.set('Cache-Control','no-store').json({settings,canManage:owner(req)});
}
export async function saveServiceChargeSettings(req,res){
 if(!owner(req))throw httpError('SERVICE_CHARGE_OWNER_REQUIRED',403);
 const input=configSchema.parse(req.body);
 if(input.isEnabled&&(Number(input.chargeRate)<=0||!(input.applyDineIn||input.applyTakeAway)))throw httpError('SERVICE_CHARGE_RATE_AND_SCOPE_REQUIRED',409);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[prior]]=await conn.execute('SELECT is_enabled,charge_rate,apply_dine_in,apply_take_away FROM service_charge_settings WHERE id=1 FOR UPDATE');
  if(!prior)throw httpError('SERVICE_CHARGE_SETUP_REQUIRED',409);
  const previous=shape(prior);
  await conn.execute('UPDATE service_charge_settings SET is_enabled=?,charge_rate=?,apply_dine_in=?,apply_take_away=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE id=1',
   [Number(input.isEnabled),input.chargeRate,Number(input.applyDineIn),Number(input.applyTakeAway),req.auth.user.id]);
  await conn.execute('INSERT INTO service_charge_audit_logs(actor_user_id,previous_data,next_data) VALUES(?,?,?)',
   [req.auth.user.id,JSON.stringify(previous),JSON.stringify(input)]);
  await conn.commit();
  return res.set('Cache-Control','no-store').json({settings:input});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function listServiceChargeAudit(req,res){
 const [rows]=await req.auth.pool.execute(`SELECT a.id,a.previous_data,a.next_data,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,u.full_name AS actor_name FROM service_charge_audit_logs a JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 200`);
 const decode=v=>{if(typeof v!=='string')return v;try{return JSON.parse(v);}catch{return null;}};
 return res.set('Cache-Control','no-store').json({logs:rows.map(x=>({...x,id:String(x.id),previous_data:decode(x.previous_data),next_data:decode(x.next_data)}))});
}
export {serviceChargeForOrder} from './service-charge-policy.js';
