// HR Attendance Clock: self-only server-time punches with tenant office IP policy.
import {z} from 'zod';
import {attendanceDate,attendanceTime,calculateAttendance,nonWorkStatuses,AttendanceError} from './attendance-rules.js';
import {canonicalClockNetwork,clockNetworkObservation,clockAccessDecision} from './attendance-clock-ip.js';
const managerRoles=new Set(['OWNER','ADMIN','HR']);
const fail=(code,status=400)=>{throw new AttendanceError(code,status);};
const id=z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const note=z.string().trim().max(2000).optional().default('');
const strTime=z.string().min(16).max(24);
const isManager=req=>managerRoles.has(req.auth?.user?.role_code);
const canSelf=req=>req.auth?.user?.permissions.includes('attendance_clock.view');
const protect=(req,manage=false)=>{if(manage?!isManager(req):!canSelf(req))fail('ATTENDANCE_CLOCK_ACCESS_DENIED',403);};
const rowFields=`a.id,a.staff_profile_id,DATE_FORMAT(a.attendance_date,'%Y-%m-%d') AS attendance_date,a.session_no,
 DATE_FORMAT(a.scheduled_clock_in,'%Y-%m-%d %H:%i:%s') AS scheduled_clock_in,
 DATE_FORMAT(a.scheduled_clock_out,'%Y-%m-%d %H:%i:%s') AS scheduled_clock_out,
 DATE_FORMAT(a.clock_in,'%Y-%m-%d %H:%i:%s') AS clock_in,DATE_FORMAT(a.clock_out,'%Y-%m-%d %H:%i:%s') AS clock_out,
 a.break_minutes,a.working_minutes,a.overtime_minutes,a.late_minutes,a.early_leave_minutes,
 a.attendance_status,a.attendance_source,a.approval_status,a.status`;
const stamp=()=>"DATE_ADD(UTC_TIMESTAMP(6), INTERVAL 8 HOUR)";
async function serverClock(c){const [[time]]=await c.execute(`SELECT DATE_FORMAT(${stamp()},'%Y-%m-%d %H:%i:%s') AS local_now,DATE_FORMAT(${stamp()},'%Y-%m-%d') AS local_date`);return time;}
async function ownStaff(c,req,lock=false){const [[r]]=await c.execute(`SELECT sp.id,sp.user_id,sp.staff_no,sp.department,sp.job_title,sp.standard_working_hours_per_day,sp.status,u.full_name,u.status AS account_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.user_id=? ${lock?'FOR UPDATE':''}`,[req.auth.user.id]);if(!r||r.status!=='active'||r.account_status!=='ACTIVE')fail('ACTIVE_STAFF_PROFILE_REQUIRED',403);return r;}
async function staffById(c,staffId){const [[r]]=await c.execute("SELECT sp.id,sp.staff_no,sp.status,u.status AS account_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.id=?",[staffId]);if(!r||r.status!=='active'||r.account_status!=='ACTIVE')fail('ACTIVE_STAFF_PROFILE_REQUIRED',422);return r;}
async function policy(c,req,sp,now,lock=false){
 const observed=clockNetworkObservation(req);
 const branchIds=req.auth.user.branchIds||[];
 const [networks]=branchIds.length?await c.execute(`SELECT network_cidr FROM hr_clock_office_networks WHERE is_active=1 AND branch_id IN (${branchIds.map(()=>'?').join(',')}) ${lock?'FOR SHARE':''}`,branchIds):[[]];
 const [[grant]]=await c.execute(`SELECT id,reason,DATE_FORMAT(ends_at,'%Y-%m-%d %H:%i') AS ends_at FROM hr_clock_remote_grants WHERE staff_profile_id=? AND revoked_at IS NULL AND starts_at<=? AND ends_at>=? ORDER BY id DESC LIMIT 1 ${lock?'FOR SHARE':''}`,[sp.id,now.local_now,now.local_now]);
 const access=clockAccessDecision(observed,networks.map(r=>r.network_cidr),Boolean(grant));
 return {...access,ip:observed.ip,channel:observed.channel,grantId:access.mode==='REMOTE'?grant?.id:null,remoteUntil:access.mode==='REMOTE'?grant?.ends_at:null,configuredOfficeNetworks:networks.length};
}
async function inTx(pool,operation){const c=await pool.getConnection();try{await c.beginTransaction();const result=await operation(c);await c.commit();return result;}catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')fail('CLOCK_ALREADY_RECORDED',409);throw e;}finally{c.release();}}
function ownAttendance(row){return {...row,id:String(row.id),staff_profile_id:String(row.staff_profile_id),session_no:Number(row.session_no)};}
async function todays(c,staffId,now){const [rows]=await c.execute(`SELECT ${rowFields} FROM hr_attendances a WHERE a.staff_profile_id=? AND a.attendance_date=? AND a.status='active' ORDER BY a.session_no,a.id`,[staffId,now.local_date]);return rows.map(ownAttendance);}
async function openSessions(c,staffId,lock=false){const [rows]=await c.execute(`SELECT ${rowFields} FROM hr_attendances a WHERE a.staff_profile_id=? AND a.status='active' AND a.clock_in IS NOT NULL AND a.clock_out IS NULL ORDER BY a.id ${lock?'FOR UPDATE':''}`,[staffId]);return rows;}
async function upcoming(c,staffId,now,lock=false){
 const [rows]=await c.execute(`SELECT ${rowFields} FROM hr_attendances a WHERE a.staff_profile_id=? AND a.status='active' AND a.approval_status='Pending' AND a.clock_in IS NULL AND a.clock_out IS NULL AND a.attendance_date IN (?,DATE_SUB(?, INTERVAL 1 DAY)) ORDER BY a.attendance_date,a.session_no,a.id ${lock?'FOR UPDATE':''}`,[staffId,now.local_date,now.local_date]);
 const eligible=rows.filter(r=>r.attendance_source!=='Leave'&&r.scheduled_clock_in&&r.scheduled_clock_out&&!nonWorkStatuses.includes(r.attendance_status));
 // Use the MySQL-provided Malaysian wall-clock for choosing a session, not a browser clock.
 const millis=s=>Date.parse(`${s.replace(' ','T')}+08:00`),nowMs=millis(now.local_now);
 const started=eligible.filter(r=>millis(r.scheduled_clock_in)<=nowMs&&millis(r.scheduled_clock_out)+12*3600000>=nowMs);
 started.sort((a,b)=>millis(b.scheduled_clock_in)-millis(a.scheduled_clock_in));
 if(started.length)return started[0];
 return eligible.find(r=>r.attendance_date===now.local_date)||null;
}

async function activeState(c,req){const staff=await ownStaff(c,req);const now=await serverClock(c);const access=await policy(c,req,staff,now);const today=await todays(c,staff.id,now);const open=await openSessions(c,staff.id);const next=open.length?null:await upcoming(c,staff.id,now);
 let mode='UNSCHEDULED',reason='NO_SCHEDULE';
 if(open.length){mode='WORKING';reason='CLOCK_OUT_AVAILABLE';}
 else if(next){mode='READY';reason='CLOCK_IN_AVAILABLE';}
 else if(today.some(r=>nonWorkStatuses.includes(r.attendance_status))){mode='OFF_DAY';reason='NON_WORK_DAY';}
 else if(today.some(r=>r.clock_out)){mode='COMPLETE';reason='NO_REMAINING_SESSION';}
 return {staff:{id:String(staff.id),staffNo:staff.staff_no,name:staff.full_name,department:staff.department,jobTitle:staff.job_title,standardHours:staff.standard_working_hours_per_day},now:now.local_now,date:now.local_date,access:{allowed:access.allowed,mode:access.mode,reason:access.reason,channel:access.channel,remoteUntil:access.remoteUntil},mode,reason,canClockIn:!open.length&&!!next&&access.allowed,canClockOut:open.length===1&&access.allowed,today,open:open.length?ownAttendance(open[0]):null,next:next?ownAttendance(next):null};
}
export async function attendanceClockToday(req,res){protect(req);const data=await activeState(req.auth.pool,req);res.set('Cache-Control','no-store').json(data);}
export async function attendanceClockHistory(req,res){protect(req);const input=z.object({dateFrom:z.string().max(12).optional(),dateTo:z.string().max(12).optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).strict().parse(req.query);const sp=await ownStaff(req.auth.pool,req);const now=await serverClock(req.auth.pool);const cutoff=new Date(`${now.local_date}T00:00:00+08:00`);cutoff.setUTCDate(cutoff.getUTCDate()-30);const from=input.dateFrom?attendanceDate(input.dateFrom):cutoff.toISOString().slice(0,10),to=input.dateTo?attendanceDate(input.dateTo):now.local_date;if(from>to)fail('INVALID_DATE_RANGE');const [rows]=await req.auth.pool.execute(`SELECT ${rowFields} FROM hr_attendances a WHERE a.staff_profile_id=? AND a.attendance_date BETWEEN ? AND ? ORDER BY a.attendance_date DESC,a.session_no DESC,a.id DESC LIMIT ${input.limit}`,[sp.id,from,to]);const data=rows.map(ownAttendance);res.set('Cache-Control','no-store').json({rows:data,summary:{sessions:data.length,working:data.reduce((n,r)=>n+Number(r.working_minutes||0),0),overtime:data.reduce((n,r)=>n+Number(r.overtime_minutes||0),0),late:data.reduce((n,r)=>n+Number(r.late_minutes||0),0)}});}
export async function attendanceClockPunch(req,res){protect(req);if(!req.auth.user.permissions.includes('attendance_clock.punch'))fail('ATTENDANCE_CLOCK_ACCESS_DENIED',403);const kind=req.params.kind;if(!['in','out'].includes(kind))fail('INVALID_CLOCK_ACTION',400);const data=z.object({notes:note,breakMinutes:z.coerce.number().int().min(0).max(1440).optional()}).strict().parse(req.body);
 const result=await inTx(req.auth.pool,async c=>{
  const staff=await ownStaff(c,req,true);const now=await serverClock(c);const access=await policy(c,req,staff,now,true);if(!access.allowed)fail(access.reason,403);
  const open=await openSessions(c,staff.id,true);
  if(open.length>1)fail('MULTIPLE_OPEN_SESSIONS_REQUIRE_HR',409);
  let row;
  if(kind==='in'){
   if(open.length)fail('ALREADY_CLOCKED_IN',409);
   row=await upcoming(c,staff.id,now,true);
   if(!row)fail('SCHEDULE_NOT_AVAILABLE',409);
   if(row.approval_status!=='Pending'||row.clock_in||row.clock_out||nonWorkStatuses.includes(row.attendance_status))fail('CLOCK_IN_NOT_ALLOWED',409);
  }else{
   if(!open.length)fail('CLOCK_IN_REQUIRED',409);
   row=open[0];
   if(row.approval_status!=='Pending'||row.attendance_source==='Leave')fail('CLOCK_OUT_NOT_ALLOWED',409);
  }
  const clocked=calculateAttendance({...row,clock_in:kind==='in'?now.local_now:row.clock_in,clock_out:kind==='out'?now.local_now:null,break_minutes:kind==='out'?(data.breakMinutes??row.break_minutes):row.break_minutes});
  if(kind==='out'&&clocked.clock_in===clocked.clock_out)fail('CLOCK_OUT_TOO_SOON',409);
  if(kind==='out'&&clocked.clock_in){
   const duration=Math.floor((Date.parse(`${clocked.clock_out.replace(' ','T')}+08:00`)-Date.parse(`${clocked.clock_in.replace(' ','T')}+08:00`))/60000);
   if(clocked.break_minutes>duration)fail('BREAK_EXCEEDS_WORK_DURATION',422);
  }
  const attendanceStatus=kind==='in'&&clocked.late_minutes>0?'Late':row.attendance_status;
  const update=kind==='in'?`clock_in=?,late_minutes=?,attendance_status=?,clock_in_notes=?,attendance_source='Web',updated_by_user_id=?`:`clock_out=?,break_minutes=?,working_minutes=?,overtime_minutes=?,late_minutes=?,early_leave_minutes=?,clock_out_notes=?,updated_by_user_id=?`;
  const params=kind==='in'?[now.local_now,clocked.late_minutes,attendanceStatus,data.notes,req.auth.user.id,row.id]:[now.local_now,clocked.break_minutes,clocked.working_minutes,clocked.overtime_minutes,clocked.late_minutes,clocked.early_leave_minutes,data.notes,req.auth.user.id,row.id];
  const [changed]=await c.execute(`UPDATE hr_attendances SET ${update} WHERE id=? AND approval_status='Pending' AND status='active' AND ${kind==='in'?'clock_in IS NULL AND clock_out IS NULL':'clock_in IS NOT NULL AND clock_out IS NULL'}`,params);
  if(changed.affectedRows!==1)fail('CLOCK_STATE_CHANGED',409);
  await c.execute(`INSERT INTO hr_clock_events(attendance_id,staff_profile_id,actor_user_id,event_type,clock_time,observed_ip,network_channel,access_mode,remote_grant_id) VALUES(?,?,?,?,?,?,?,?,?)`,[row.id,staff.id,req.auth.user.id,kind==='in'?'CLOCK_IN':'CLOCK_OUT',now.local_now,access.ip,access.channel,access.mode,access.grantId]);
  return {message:kind==='in'?'CLOCK_IN_RECORDED':'CLOCK_OUT_RECORDED',attendanceId:String(row.id),clockTime:now.local_now,accessMode:access.mode};
 });res.set('Cache-Control','no-store').json(result);
}
export async function attendanceClockAdminMeta(req,res){protect(req,true);const [branches,staff,networks,grants]=await Promise.all([
 req.auth.pool.execute('SELECT id,code,name FROM branches ORDER BY id'),
 req.auth.pool.execute("SELECT sp.id,sp.staff_no,u.full_name FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.status='active' AND u.status='ACTIVE' ORDER BY sp.staff_no"),
 req.auth.pool.execute('SELECT o.id,o.branch_id,b.name AS branch_name,o.network_cidr,o.label,o.is_active FROM hr_clock_office_networks o JOIN branches b ON b.id=o.branch_id ORDER BY o.id DESC LIMIT 100'),
 req.auth.pool.execute("SELECT g.id,g.staff_profile_id,sp.staff_no,u.full_name,DATE_FORMAT(g.starts_at,'%Y-%m-%d %H:%i') AS starts_at,DATE_FORMAT(g.ends_at,'%Y-%m-%d %H:%i') AS ends_at,g.reason,DATE_FORMAT(g.revoked_at,'%Y-%m-%d %H:%i') AS revoked_at FROM hr_clock_remote_grants g JOIN staff_profiles sp ON sp.id=g.staff_profile_id JOIN users u ON u.id=sp.user_id ORDER BY g.id DESC LIMIT 100")
 ]);res.set('Cache-Control','no-store').json({branches:branches[0].map(x=>({...x,id:String(x.id)})),staff:staff[0].map(x=>({...x,id:String(x.id)})),networks:networks[0].map(x=>({...x,id:String(x.id)})),grants:grants[0].map(x=>({...x,id:String(x.id)}))});}
async function policyAudit(c,req,type,targetId,details){await c.execute('INSERT INTO hr_clock_policy_audit(actor_user_id,event_type,target_id,details) VALUES(?,?,?,?)',[req.auth.user.id,type,targetId,JSON.stringify(details)]);}
export async function addOfficeNetwork(req,res){protect(req,true);const v=z.object({branchId:id,label:z.string().trim().min(2).max(120),network:z.string().trim().min(2).max(64)}).strict().parse(req.body);let network;try{network=canonicalClockNetwork(v.network);}catch{fail('INVALID_OFFICE_IP_RANGE');}
 if(network.includes('/') && Number(network.split('/')[1])<16)fail('OFFICE_RANGE_TOO_BROAD',422);
 const result=await inTx(req.auth.pool,async c=>{const [[branch]]=await c.execute('SELECT id FROM branches WHERE id=? FOR UPDATE',[v.branchId]);if(!branch)fail('BRANCH_NOT_FOUND',404);const [created]=await c.execute('INSERT INTO hr_clock_office_networks(branch_id,network_cidr,label,created_by_user_id) VALUES(?,?,?,?)',[v.branchId,network,v.label,req.auth.user.id]);await policyAudit(c,req,'OFFICE_ADD',created.insertId,{branchId:v.branchId,network,label:v.label});return created.insertId;});res.status(201).json({message:'OFFICE_NETWORK_ADDED',id:String(result)});}
export async function disableOfficeNetwork(req,res){protect(req,true);const networkId=id.parse(req.params.id);await inTx(req.auth.pool,async c=>{const [changed]=await c.execute('UPDATE hr_clock_office_networks SET is_active=0 WHERE id=? AND is_active=1',[networkId]);if(changed.affectedRows!==1)fail('OFFICE_NETWORK_NOT_ACTIVE',409);await policyAudit(c,req,'OFFICE_DISABLE',networkId,{});});res.json({message:'OFFICE_NETWORK_DISABLED'});}
export async function grantRemoteClock(req,res){protect(req,true);const v=z.object({staffId:id,startsAt:strTime,endsAt:strTime,reason:z.string().trim().min(8).max(500)}).strict().parse(req.body);const from=attendanceTime(v.startsAt),to=attendanceTime(v.endsAt);const duration=(Date.parse(to.replace(' ','T')+'+08:00')-Date.parse(from.replace(' ','T')+'+08:00'))/60000;if(!Number.isFinite(duration)||duration<1||duration>43200)fail('REMOTE_DUTY_WINDOW_INVALID',422);
 const result=await inTx(req.auth.pool,async c=>{await staffById(c,v.staffId);const [created]=await c.execute('INSERT INTO hr_clock_remote_grants(staff_profile_id,starts_at,ends_at,reason,approved_by_user_id) VALUES(?,?,?,?,?)',[v.staffId,from,to,v.reason,req.auth.user.id]);await policyAudit(c,req,'REMOTE_GRANT',created.insertId,{staffId:v.staffId,startsAt:from,endsAt:to,reason:v.reason});return created.insertId;});res.status(201).json({message:'REMOTE_DUTY_APPROVED',id:String(result)});}
export async function revokeRemoteClock(req,res){protect(req,true);const grantId=id.parse(req.params.id);await inTx(req.auth.pool,async c=>{const [changed]=await c.execute(`UPDATE hr_clock_remote_grants SET revoked_at=${stamp()},revoked_by_user_id=? WHERE id=? AND revoked_at IS NULL`,[req.auth.user.id,grantId]);if(changed.affectedRows!==1)fail('REMOTE_DUTY_NOT_ACTIVE',409);await policyAudit(c,req,'REMOTE_REVOKE',grantId,{});});res.json({message:'REMOTE_DUTY_REVOKED'});}
