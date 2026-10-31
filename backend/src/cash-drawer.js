import {z} from 'zod';

const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const allowed=(req,permission)=>req.auth.user.permissions.includes(permission);
const role=req=>req.auth.user.role_code;
const ownerAdmin=req=>['OWNER','ADMIN'].includes(role(req));
const seeAll=req=>['OWNER','ADMIN','MANAGER','ACCOUNTANT'].includes(role(req))&&allowed(req,'cash_drawer.view.all');
const manageOther=req=>['OWNER','ADMIN','MANAGER'].includes(role(req));
const deny=(code,status=403)=>Object.assign(new Error(code),{status});
const ensureBranch=(req,branchId)=>{if(!ownerAdmin(req)&&!req.auth.user.branchIds.includes(String(branchId)))throw deny('BRANCH_ACCESS_DENIED');};
const observedOnly='MANUAL_OBSERVATION_ONLY';
const selectEvents=`SELECT e.id,e.shift_id,e.branch_id,b.name AS branch_name,e.actor_user_id,u.full_name AS actor_name,
 s.cashier_user_id,cu.full_name AS cashier_name,e.event_type,e.reason,e.request_key,
 DATE_FORMAT(e.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at
 FROM cash_drawer_events e JOIN cash_shifts s ON s.id=e.shift_id JOIN branches b ON b.id=e.branch_id
 JOIN users u ON u.id=e.actor_user_id JOIN users cu ON cu.id=s.cashier_user_id`;
const csvSafe=x=>{const value=String(x??'');return `"${(/^[=+@-]/.test(value)?"'":'')+value.replaceAll('"','""')}"`;};

export async function cashDrawerMeta(req,res){
 const [shifts]=await req.auth.pool.execute(`SELECT s.id,s.cashier_user_id,u.full_name AS cashier_name,
 s.branch_id,b.name AS branch_name FROM cash_shifts s JOIN users u ON u.id=s.cashier_user_id
 JOIN branches b ON b.id=s.branch_id WHERE s.status='OPEN' ${seeAll(req)?'':'AND s.cashier_user_id=?'} ORDER BY s.id DESC LIMIT 150`,seeAll(req)?[]:[req.auth.user.id]);
 const openShifts=shifts.filter(shift=>{
  const own=String(shift.cashier_user_id)===String(req.auth.user.id);
  return own&&allowed(req,'cash_drawer.record.own') ||
   manageOther(req)&&allowed(req,'cash_drawer.record.any')&&(ownerAdmin(req)||req.auth.user.branchIds.includes(String(shift.branch_id)));
 });
 res.set('Cache-Control','no-store').json({shifts:openShifts,scope:seeAll(req)?'ALL':'OWN',hardwareIntegration:'NOT_CONNECTED',recordMode:observedOnly});
}
export async function listCashDrawer(req,res){
 const filter=z.object({shiftId:z.string().regex(/^[1-9][0-9]*$/).optional(),limit:z.coerce.number().int().min(1).max(500).default(200)}).strict().parse(req.query);
 const where=[],params=[];
 if(!seeAll(req)){where.push('s.cashier_user_id=?');params.push(req.auth.user.id);}
 if(filter.shiftId){where.push('e.shift_id=?');params.push(filter.shiftId);}
 const [events]=await req.auth.pool.execute(`${selectEvents}${where.length?' WHERE '+where.join(' AND '):''} ORDER BY e.id DESC LIMIT ${filter.limit}`,params);
 return res.set('Cache-Control','no-store').json({events,scope:seeAll(req)?'ALL':'OWN',hardwareIntegration:'NOT_CONNECTED',recordMode:observedOnly});
}
export async function recordCashDrawerOpen(req,res){
 const data=z.object({shiftId:id,reason:z.string().trim().min(8).max(300),requestKey:z.uuid()}).strict().parse(req.body);
 if(!allowed(req,'cash_drawer.record.own')&&!allowed(req,'cash_drawer.record.any'))throw deny('DRAWER_RECORD_DENIED');
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[shift]]=await conn.execute(`SELECT id,branch_id,cashier_user_id,status FROM cash_shifts WHERE id=? FOR UPDATE`,[data.shiftId]);
  if(!shift)throw deny('SHIFT_NOT_FOUND',404);
  const own=String(shift.cashier_user_id)===String(req.auth.user.id);
  if(own){if(!allowed(req,'cash_drawer.record.own'))throw deny('DRAWER_RECORD_DENIED');ensureBranch(req,shift.branch_id);}
  else{if(!manageOther(req)||!allowed(req,'cash_drawer.record.any'))throw deny('DRAWER_RECORD_DENIED');ensureBranch(req,shift.branch_id);}
  const [[existing]]=await conn.execute('SELECT id,shift_id,actor_user_id,reason FROM cash_drawer_events WHERE request_key=?',[data.requestKey]);
  if(existing){
   if(String(existing.shift_id)!==String(shift.id)||String(existing.actor_user_id)!==String(req.auth.user.id)||existing.reason!==data.reason)throw deny('DRAWER_REQUEST_KEY_CONFLICT',409);
   await conn.commit();return res.json({message:'DRAWER_EVENT_ALREADY_RECORDED',eventId:String(existing.id),idempotent:true,hardwareIntegration:'NOT_CONNECTED'});
  }
  if(shift.status!=='OPEN')throw deny('SHIFT_ALREADY_CLOSED',409);
  const [entry]=await conn.execute(`INSERT INTO cash_drawer_events(shift_id,branch_id,actor_user_id,event_type,reason,request_key,recorded_at)
 VALUES(?,?,?,'MANUAL_OPEN',?,?,UTC_TIMESTAMP(6))`,[shift.id,shift.branch_id,req.auth.user.id,data.reason,data.requestKey]);
  await conn.execute(`INSERT INTO cash_drawer_audit_logs(event_id,actor_user_id,action_type,details,recorded_at)
 VALUES(?,?,'RECORD_MANUAL_OPEN',?,UTC_TIMESTAMP(6))`,[entry.insertId,req.auth.user.id,JSON.stringify({shiftId:String(shift.id),branchId:String(shift.branch_id),reason:data.reason,hardwareIntegration:'NOT_CONNECTED'})]);
  await conn.commit();
  return res.status(201).json({message:'DRAWER_OPENING_RECORDED',eventId:String(entry.insertId),idempotent:false,hardwareIntegration:'NOT_CONNECTED'});
 }catch(error){await conn.rollback();if(error.code==='ER_DUP_ENTRY')throw deny('DRAWER_REQUEST_KEY_CONFLICT',409);throw error;}finally{conn.release();}
}
export async function cashDrawerAudit(req,res){
 if(!allowed(req,'cash_drawer.audit'))throw deny('PERMISSION_DENIED');
 const where=seeAll(req)?'':'WHERE s.cashier_user_id=?';
 const [logs]=await req.auth.pool.execute(`SELECT a.id,a.event_id,a.action_type,a.details,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,
 u.full_name AS actor_name,e.shift_id,e.reason FROM cash_drawer_audit_logs a JOIN cash_drawer_events e ON e.id=a.event_id
 JOIN cash_shifts s ON s.id=e.shift_id JOIN users u ON u.id=a.actor_user_id ${where} ORDER BY a.id DESC LIMIT 300`,seeAll(req)?[]:[req.auth.user.id]);
 return res.set('Cache-Control','no-store').json({logs});
}
export async function exportCashDrawer(req,res){
 if(!allowed(req,'cash_drawer.export'))throw deny('PERMISSION_DENIED');
 const where=seeAll(req)?'':' WHERE s.cashier_user_id=?';
 const [events]=await req.auth.pool.execute(`${selectEvents}${where} ORDER BY e.id DESC LIMIT 2000`,seeAll(req)?[]:[req.auth.user.id]);
 const header=['Event ID','Shift ID','Branch','Cashier','Recorded By','Time (UTC)','Event','Reason','Hardware Status'];
 const rows=events.map(e=>[e.id,e.shift_id,e.branch_name,e.cashier_name,e.actor_name,e.recorded_at,'Manual opening observed',e.reason,'Not connected']);
 return res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('cash-drawer-log.csv').send('\ufeff'+[header,...rows].map(x=>x.map(csvSafe).join(',')).join('\r\n'));
}
