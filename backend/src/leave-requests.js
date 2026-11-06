// HR Leave Requests R1: one tenant transaction for request, attachment, balance posting and Leave attendance.
import {z} from 'zod';
import {fail,requestInput,leavePeriod,dayCents,centsDays,validateAttachments} from './leave-request-rules.js';
import {calculateBalanceDelta,reconcileBalance} from './leave-request-engine.js';
import {assessLeaveAttendance,leaveAttendanceSelect} from './leave-request-attendance.js';
const privileged=new Set(['OWNER','ADMIN','HR']);
const viewer=new Set([...privileged,'MANAGER']);
const id=z.coerce.number().int().positive();
const role=req=>String(req.auth.user.role_code).toUpperCase();
const isPriv=req=>privileged.has(role(req));
function access(req,mode='self'){
 const p=req.auth.user.permissions;
 if(mode==='view'&&!(p.includes('leave_requests.view')||p.includes('leave_requests.self')))fail('LEAVE_REQUESTS_ACCESS_DENIED',403);
 if(mode==='self'&&!(p.includes('leave_requests.manage')||p.includes('leave_requests.self')))fail('LEAVE_REQUESTS_ACCESS_DENIED',403);
 if(mode==='create'&&!(p.includes('leave_requests.create')||p.includes('leave_requests.self')))fail('LEAVE_REQUESTS_ACCESS_DENIED',403);
 if(mode==='update'&&!(p.includes('leave_requests.update')||p.includes('leave_requests.self')))fail('LEAVE_REQUESTS_ACCESS_DENIED',403);
 if(mode==='approve'&&(!isPriv(req)||!p.includes('leave_requests.approve')))fail('LEAVE_REQUESTS_APPROVAL_DENIED',403);
 if(['audit','recalculate'].includes(mode)&&(!isPriv(req)||!p.includes(`leave_requests.${mode}`)))fail('LEAVE_REQUESTS_ACCESS_DENIED',403);
}
const select=`r.id,r.request_no,r.staff_profile_id,r.leave_type_id,r.balance_year,DATE_FORMAT(r.start_date,'%Y-%m-%d') AS start_date,DATE_FORMAT(r.end_date,'%Y-%m-%d') AS end_date,r.duration_type,r.half_day_period,r.total_days,r.reason,r.emergency_contact_no,r.handover_notes,r.request_status,r.requested_by_user_id,DATE_FORMAT(r.submitted_at,'%Y-%m-%d %H:%i:%s.%f') AS submitted_at,r.reviewed_by_user_id,DATE_FORMAT(r.reviewed_at,'%Y-%m-%d %H:%i') AS reviewed_at,r.review_remarks,r.cancelled_by_user_id,DATE_FORMAT(r.cancelled_at,'%Y-%m-%d %H:%i') AS cancelled_at,r.cancel_reason,DATE_FORMAT(r.created_at,'%Y-%m-%d %H:%i') AS created_at,sp.staff_no,sp.department,sp.employment_type,u.full_name,lt.leave_code,lt.leave_name,lt.attendance_status,lt.requires_attachment,lt.allow_half_day,lt.is_paid,b.remaining_days AS balance_remaining_days,(SELECT COUNT(*) FROM hr_leave_request_attachments att WHERE att.leave_request_id=r.id AND att.is_removed=0) AS attachment_count`;
const joins=`FROM hr_leave_requests r JOIN staff_profiles sp ON sp.id=r.staff_profile_id JOIN users u ON u.id=sp.user_id JOIN hr_leave_types lt ON lt.id=r.leave_type_id LEFT JOIN hr_leave_balances b ON b.staff_profile_id=r.staff_profile_id AND b.leave_type_id=r.leave_type_id AND b.balance_year=r.balance_year`;
const publicRow=r=>({...r,id:String(r.id),staff_profile_id:String(r.staff_profile_id),leave_type_id:String(r.leave_type_id),requested_by_user_id:String(r.requested_by_user_id),reviewed_by_user_id:r.reviewed_by_user_id?String(r.reviewed_by_user_id):null});
async function tx(pool,cb){const c=await pool.getConnection();try{await c.beginTransaction();const result=await cb(c);await c.commit();return result;}catch(e){await c.rollback();if(['ER_DUP_ENTRY','ER_CHECK_CONSTRAINT_VIOLATED'].includes(e.code))fail('LEAVE_REQUEST_CONFLICT',409);throw e;}finally{c.release();}}
const note=async(c,req,requestId,action,details={})=>c.execute('INSERT INTO hr_leave_request_audit_logs(leave_request_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[requestId,req.auth.user.id,action,JSON.stringify(details)]);
async function staff(c,req,staffId,lock=false,allowTeam=false){
 const [[s]]=await c.execute(`SELECT sp.id,sp.user_id,sp.staff_no,sp.department,sp.employment_type,sp.employment_status,sp.status,sp.join_date,u.full_name,u.status AS user_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.id=? ${lock?'FOR UPDATE':''}`,[staffId]);
 if(!s)fail('STAFF_PROFILE_NOT_FOUND',404);
 if(!isPriv(req)&&!(allowTeam&&viewer.has(role(req)))&&String(s.user_id)!==String(req.auth.user.id))fail('OWN_LEAVE_REQUESTS_ONLY',403);
 return s;
}
async function lockRequest(c,req,requestId){
 const [[ref]]=await c.execute('SELECT staff_profile_id FROM hr_leave_requests WHERE id=?',[requestId]);
 if(!ref)fail('LEAVE_REQUEST_NOT_FOUND',404);
 const s=await staff(c,req,ref.staff_profile_id,true);
 const [[r]]=await c.execute('SELECT * FROM hr_leave_requests WHERE id=? FOR UPDATE',[requestId]);
 if(!r)fail('LEAVE_REQUEST_NOT_FOUND',404);return {r,s};
}
async function typePolicy(c,id){const [[t]]=await c.execute('SELECT * FROM hr_leave_types WHERE id=? AND is_deleted=0',[id]);if(!t||t.status!=='active')fail('LEAVE_TYPE_NOT_ACTIVE',422);return t;}
async function validate(c,req,raw,{skipId=0,lock=false}={}){
 const input=requestInput.parse(raw),period=leavePeriod(input.start_date,input.end_date,input.duration_type,input.half_day_period);
 const s=await staff(c,req,input.staff_profile_id,lock);
 if(s.status!=='active'||s.user_status!=='ACTIVE'||!['Active','Probation'].includes(s.employment_status))fail('STAFF_NOT_ACTIVE',422);
 const t=await typePolicy(c,input.leave_type_id);
 // V2 Staff Profiles does not yet record verified gender; never bypass restricted leave rules.
 if(t.gender_restriction!=='All')fail('GENDER_RESTRICTED_LEAVE_REQUIRES_VERIFIED_STAFF_DATA',422);
 if(input.duration_type==='Half Day'&&!Number(t.allow_half_day))fail('HALF_DAY_NOT_ALLOWED_FOR_LEAVE_TYPE',422);
 if(t.max_days_per_request!==null&&dayCents(period.days)>dayCents(t.max_days_per_request))fail('LEAVE_TYPE_MAX_DAYS_EXCEEDED',422);
 if(s.join_date){
  const joined=s.join_date instanceof Date?s.join_date.toISOString().slice(0,10):String(s.join_date).slice(0,10);
  if(input.start_date<joined)fail('LEAVE_BEFORE_JOIN_DATE',422);
  const [y,m,d]=joined.split('-').map(Number),months=(y*12+m-1)+Number(t.minimum_service_months);
  const targetY=Math.floor(months/12),targetM=months%12+1;
  const last=new Date(Date.UTC(targetY,targetM,0)).getUTCDate();
  const eligible=`${targetY}-${String(targetM).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`;
  if(input.start_date<eligible)fail('MINIMUM_SERVICE_NOT_MET',422);
 }
 const attachmentData=validateAttachments(input.attachments);
 // Same calendar day cannot be submitted twice even when requests use different leave types.
 const [overlap]=await c.execute(`SELECT id FROM hr_leave_requests WHERE staff_profile_id=? AND id<>? AND request_status IN ('Pending','Approved') AND start_date<=? AND end_date>=? LIMIT 1`,[input.staff_profile_id,skipId,input.end_date,input.start_date]);
 if(overlap.length)fail('OVERLAPPING_LEAVE_REQUEST',409);
 return {input,period,s,t,attachmentData};
}
async function lockBalance(c,staffId,typeId,year,paid,{release=false}={}){
 if(!paid)return null;
 const [[b]]=await c.execute('SELECT * FROM hr_leave_balances WHERE staff_profile_id=? AND leave_type_id=? AND balance_year=? FOR UPDATE',[staffId,typeId,year]);
 if(!b)fail('LEAVE_BALANCE_NOT_FOUND_GENERATE_FIRST',422);
 if(b.status!=='active'&&!release)fail('LEAVE_BALANCE_INACTIVE',422);
 return b;
}
async function post(c,req,requestId,b,action,deltaUsed,deltaPending){
 if(!b||(!deltaUsed&&!deltaPending))return;
 // Never change imported historical days; capture opening snapshot exactly once.
 await c.execute('INSERT IGNORE INTO hr_leave_balance_openings(balance_id,opening_used_days,opening_pending_days) VALUES(?,?,?)',[b.id,b.used_days,b.pending_days]);
 const [[opening]]=await c.execute('SELECT opening_used_days,opening_pending_days FROM hr_leave_balance_openings WHERE balance_id=?',[b.id]);
 const [[previous]]=await c.execute('SELECT COALESCE(SUM(delta_used_days),0) AS used_delta,COALESCE(SUM(delta_pending_days),0) AS pending_delta FROM hr_leave_request_postings WHERE balance_id=?',[b.id]);
 reconcileBalance(opening,previous,b); // Fail closed if a historical opening/ledger was changed out of band.
 const result=calculateBalanceDelta(b,{used:deltaUsed,pending:deltaPending});
 const [changed]=await c.execute('UPDATE hr_leave_balances SET used_days=?,pending_days=?,updated_by_user_id=? WHERE id=?',[result.used,result.pending,req.auth.user.id,b.id]);
 if(changed.affectedRows!==1)fail('LEAVE_BALANCE_CHANGED',409);
 await c.execute(`INSERT INTO hr_leave_request_postings(leave_request_id,balance_id,actor_user_id,action_type,delta_used_days,delta_pending_days,used_after,pending_after) VALUES(?,?,?,?,?,?,?,?)`,[requestId,b.id,req.auth.user.id,action,centsDays(deltaUsed),centsDays(deltaPending),result.used,result.pending]);
 b.used_days=result.used;b.pending_days=result.pending;
}
function requiredAttachment(t,list){return !Number(t.requires_attachment)||list.some(x=>t.leave_code==='MC'?x.attachment_type==='Medical Certificate':true);}
async function retainAttachments(c,req,requestId,input,uploaded){
 const [existing]=await c.execute('SELECT id,attachment_type FROM hr_leave_request_attachments WHERE leave_request_id=? AND is_removed=0 FOR UPDATE',[requestId]);
 const keep=input.keep_attachment_ids===undefined?existing.map(x=>Number(x.id)):input.keep_attachment_ids;
 if(new Set(keep).size!==keep.length||keep.some(x=>!existing.some(e=>Number(e.id)===x)))fail('INVALID_ATTACHMENT_SELECTION',422);
 if(keep.length+uploaded.length>5)fail('ATTACHMENT_MAX_5_FILES',422);
 const kept=existing.filter(x=>keep.includes(Number(x.id)));
 if(!requiredAttachment(input._policy,[...kept,...uploaded]))fail('REQUIRED_SUPPORTING_DOCUMENT_MISSING',422);
 for(const old of existing){if(!keep.includes(Number(old.id)))await c.execute('UPDATE hr_leave_request_attachments SET is_removed=1 WHERE id=?',[old.id]);}
 for(const a of uploaded)await c.execute('INSERT INTO hr_leave_request_attachments(leave_request_id,file_name,mime_type,file_bytes,file_data,attachment_type,uploaded_by_user_id) VALUES(?,?,?,?,?,?,?)',[requestId,a.file_name,a.mime,a.bytes.length,a.bytes,a.attachment_type,req.auth.user.id]);
}
async function submit(c,req,raw){
 const {input,period,t,attachmentData}=await validate(c,req,raw,{lock:true});
 const b=await lockBalance(c,input.staff_profile_id,input.leave_type_id,period.year,Number(t.is_paid));
 if(!requiredAttachment(t,attachmentData))fail('REQUIRED_SUPPORTING_DOCUMENT_MISSING',422);
 const [newRow]=await c.execute(`INSERT INTO hr_leave_requests(staff_profile_id,leave_type_id,balance_year,start_date,end_date,duration_type,half_day_period,total_days,reason,emergency_contact_no,handover_notes,requested_by_user_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[input.staff_profile_id,input.leave_type_id,period.year,input.start_date,input.end_date,input.duration_type,input.half_day_period||null,period.days,input.reason,input.emergency_contact_no||null,input.handover_notes||null,req.auth.user.id]);
 const requestId=newRow.insertId;
 await c.execute('UPDATE hr_leave_requests SET request_no=? WHERE id=?',[`LR-${String(requestId).padStart(6,'0')}`,requestId]);
 await retainAttachments(c,req,requestId,{...input,_policy:t},attachmentData);
 await post(c,req,requestId,b,'SUBMIT',0,Number(t.is_paid)?dayCents(period.days):0);
 await note(c,req,requestId,'SUBMIT',{year:period.year,days:period.days,paid:Number(t.is_paid),attachments:attachmentData.length});
 return requestId;
}
export async function requestMeta(req,res){access(req,'view');const onlySelf=!viewer.has(role(req));const [staffRows,types,balances]=await Promise.all([
 req.auth.pool.execute(`SELECT sp.id,sp.user_id,sp.staff_no,sp.department,sp.employment_type,sp.employment_status,sp.status,u.full_name,u.status AS user_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id ${onlySelf?'WHERE sp.user_id=?':''} ORDER BY CAST(SUBSTRING_INDEX(sp.staff_no,'-',-1) AS UNSIGNED),sp.staff_no LIMIT 2000`,onlySelf?[req.auth.user.id]:[]),
 req.auth.pool.execute('SELECT id,leave_code,leave_name,attendance_status,requires_attachment,allow_half_day,is_paid,max_days_per_request,status FROM hr_leave_types WHERE is_deleted=0 ORDER BY sort_order,leave_code'),
 req.auth.pool.execute(`SELECT b.staff_profile_id,b.leave_type_id,b.balance_year,b.remaining_days,b.pending_days,b.used_days,b.status FROM hr_leave_balances b ${onlySelf?'JOIN staff_profiles sp ON sp.id=b.staff_profile_id WHERE sp.user_id=?':''} ORDER BY b.balance_year DESC LIMIT 5000`,onlySelf?[req.auth.user.id]:[])
 ]);
 res.set('Cache-Control','no-store').json({staff:staffRows[0].map(x=>({...x,id:String(x.id)})),leaveTypes:types[0].map(x=>({...x,id:String(x.id)})),balances:balances[0].map(x=>({...x,staff_profile_id:String(x.staff_profile_id),leave_type_id:String(x.leave_type_id)})),canManage:isPriv(req),canApprove:isPriv(req),canAudit:isPriv(req),selfUserId:String(req.auth.user.id)});
}
export async function requestList(req,res){access(req,'view');const f=z.object({limit:z.coerce.number().int().min(1).max(1000).default(1000)}).strict().parse(req.query);
 const own=!viewer.has(role(req));const where=own?'WHERE sp.user_id=?':'';
 const [rows]=await req.auth.pool.execute(`SELECT ${select} ${joins} ${where} ORDER BY r.submitted_at DESC,CAST(SUBSTRING_INDEX(sp.staff_no,'-',-1) AS UNSIGNED),sp.staff_no,r.id DESC LIMIT ${f.limit}`,own?[req.auth.user.id]:[]);
 res.set('Cache-Control','no-store').json({items:rows.map(publicRow)});
}
export async function requestDetail(req,res){access(req,'view');const requestId=id.parse(req.params.id);const [[r]]=await req.auth.pool.execute(`SELECT ${select} ${joins} WHERE r.id=?`,[requestId]);if(!r)fail('LEAVE_REQUEST_NOT_FOUND',404);
 if(!viewer.has(role(req))){await staff(req.auth.pool,req,r.staff_profile_id,false,true);}
 const [attachments]=await req.auth.pool.execute('SELECT id,file_name,mime_type,file_bytes,attachment_type,DATE_FORMAT(created_at,\'%Y-%m-%d %H:%i\') AS created_at FROM hr_leave_request_attachments WHERE leave_request_id=? AND is_removed=0 ORDER BY id',[requestId]);
 // Only the requested period is checked. Pending work schedules are not actual punches.
 const [attendance]=await req.auth.pool.execute(leaveAttendanceSelect,[r.staff_profile_id,r.start_date,r.end_date]);
 const attendanceState=r.request_status==='Approved'?'POSTED':assessLeaveAttendance(attendance,r.duration_type);
 const attendanceCheck=({POSTED:'Leave attendance created',OPEN_PUNCH:'Unclosed Clock In',EXISTING_ATTENDANCE:'Protected Attendance requires authorized review',HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW:'Half-day schedule requires authorized review',SCHEDULE_ONLY:'Work schedule without recorded punches · approval permitted',CLEAR:'No conflicting punches'})[attendanceState];
 const scheduleConversionCount=attendanceState==='SCHEDULE_ONLY'?attendance.length:0;
 res.set('Cache-Control','no-store').json({item:publicRow(r),attachments:attachments.map(x=>({...x,id:String(x.id)})),attendanceCheck,attendanceState,scheduleConversionCount});
}
export async function requestCreate(req,res){access(req,'create');const requestId=await tx(req.auth.pool,c=>submit(c,req,req.body));res.status(201).json({message:'LEAVE_REQUEST_SUBMITTED',id:String(requestId)});}
export async function requestEdit(req,res){access(req,'update');const requestId=id.parse(req.params.id);await tx(req.auth.pool,async c=>{
 const {r}=await lockRequest(c,req,requestId);if(r.request_status!=='Pending')fail('ONLY_PENDING_LEAVE_EDITABLE',409);
 const {input,period,t,attachmentData}=await validate(c,req,req.body,{skipId:requestId});
 if(Number(r.staff_profile_id)!==input.staff_profile_id)fail('STAFF_CANNOT_CHANGE',409);
 const [[oldType]]=await c.execute('SELECT is_paid FROM hr_leave_types WHERE id=?',[r.leave_type_id]);
 const oldPaid=Number(oldType.is_paid),newPaid=Number(t.is_paid);
 const oldBalance=await lockBalance(c,r.staff_profile_id,r.leave_type_id,r.balance_year,oldPaid,{release:true});
 let newBalance=oldBalance;
 if(!oldBalance||Number(r.leave_type_id)!==input.leave_type_id||Number(r.balance_year)!==period.year)newBalance=await lockBalance(c,input.staff_profile_id,input.leave_type_id,period.year,newPaid);
 if(newPaid&&newBalance?.status!=='active')fail('LEAVE_BALANCE_INACTIVE',422);
 // Verify existing supporting documents when editing, even if no new files are selected.
 await retainAttachments(c,req,requestId,{...input,_policy:t},attachmentData);
 if(oldPaid)await post(c,req,requestId,oldBalance,'EDIT',0,-dayCents(r.total_days));
 if(newPaid)await post(c,req,requestId,newBalance,'EDIT',0,dayCents(period.days));
 await c.execute(`UPDATE hr_leave_requests SET leave_type_id=?,balance_year=?,start_date=?,end_date=?,duration_type=?,half_day_period=?,total_days=?,reason=?,emergency_contact_no=?,handover_notes=? WHERE id=?`,[input.leave_type_id,period.year,input.start_date,input.end_date,input.duration_type,input.half_day_period||null,period.days,input.reason,input.emergency_contact_no||null,input.handover_notes||null,requestId]);
 await note(c,req,requestId,'EDIT',{before:{type:r.leave_type_id,year:r.balance_year,days:r.total_days},after:{type:input.leave_type_id,year:period.year,days:period.days}});
 });res.json({message:'LEAVE_REQUEST_UPDATED'});}
export async function requestReview(req,res){access(req,'approve');const requestId=id.parse(req.params.id),data=z.object({decision:z.enum(['Approved','Rejected']),remarks:z.string().trim().min(4).max(5000),allow_schedule_conversion:z.boolean().optional().default(false)}).strict().parse(req.body);
 if(data.decision==='Rejected'&&data.remarks.length<4)fail('REVIEW_REMARKS_REQUIRED',422);
 await tx(req.auth.pool,async c=>{
 const {r}=await lockRequest(c,req,requestId);if(r.request_status!=='Pending')fail('LEAVE_REQUEST_DECISION_ALREADY_FINAL',409);
 const [[policy]]=await c.execute('SELECT * FROM hr_leave_types WHERE id=?',[r.leave_type_id]);
 if(!policy)fail('LEAVE_TYPE_NOT_FOUND',404);
 if(data.decision==='Approved'&&policy.status!=='active')fail('LEAVE_TYPE_NOT_ACTIVE',422);
 const paid=Number(policy.is_paid);
 const balance=await lockBalance(c,r.staff_profile_id,r.leave_type_id,r.balance_year,paid,{release:data.decision==='Rejected'});
 if(data.decision==='Approved'){
  const period=leavePeriod(r.start_date instanceof Date?r.start_date.toISOString().slice(0,10):String(r.start_date),r.end_date instanceof Date?r.end_date.toISOString().slice(0,10):String(r.end_date),r.duration_type,r.half_day_period);
  // Lock all Attendance rows for exactly the requested leave period. An already
  // finalized/clocked attendance cannot be converted or overwritten.
  const [conflicts]=await c.execute(`${leaveAttendanceSelect} FOR UPDATE`,[r.staff_profile_id,period.dates[0],period.dates.at(-1)]);
  const attendanceState=assessLeaveAttendance(conflicts,r.duration_type);
  if(attendanceState==='OPEN_PUNCH')fail('UNCLOSED_CLOCK_PUNCH',409);
  if(attendanceState==='HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW')fail('HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW',409);
  if(attendanceState==='EXISTING_ATTENDANCE')fail('EXISTING_ATTENDANCE_REQUIRES_HR_REVIEW',409);
  if(attendanceState==='SCHEDULE_ONLY'&&!data.allow_schedule_conversion)fail('SCHEDULE_CONVERSION_CONFIRMATION_REQUIRED',409);
  if(Number(policy.requires_attachment)){
   const [[mc]]=await c.execute(`SELECT COUNT(*) AS n FROM hr_leave_request_attachments WHERE leave_request_id=? AND (attachment_type='Medical Certificate' OR ?<>'MC') AND is_removed=0`,[requestId,policy.leave_code]);if(!Number(mc.n))fail('REQUIRED_SUPPORTING_DOCUMENT_MISSING',422);
  }
  // The same locked transaction creates a Leave record OR converts one
  // explicitly reviewed, unpunched Pending session. Never erase clock history.
  const scheduledByDate=new Map();
  for(const row of conflicts){const list=scheduledByDate.get(row.attendance_date)||[];list.push(row);scheduledByDate.set(row.attendance_date,list);}
  for(const date of period.dates){
   const existingRows=scheduledByDate.get(date)||[];
   const leaveStatus=r.duration_type==='Half Day'?'Half Day':policy.attendance_status;
   if(existingRows.length){
    for(const existing of existingRows){
     // An unpunched shift can be superseded by approved absence even if the
     // roster was administratively approved. Never require Clock In/Out for EL/UL/MC.
     const [changed]=await c.execute(`UPDATE hr_attendances SET attendance_status=?,attendance_source='Leave',break_minutes=0,approval_status='Approved',approved_by_user_id=?,approved_at=NOW(6),leave_request_id=?,updated_by_user_id=? WHERE id=? AND staff_profile_id=? AND status='active' AND approval_status IN ('Pending','Approved') AND attendance_source IN ('Manual','Import') AND clock_in IS NULL AND clock_out IS NULL AND leave_request_id IS NULL`,[leaveStatus,req.auth.user.id,requestId,req.auth.user.id,existing.id,r.staff_profile_id]);
     if(changed.affectedRows!==1)fail('ATTENDANCE_SCHEDULE_CHANGED_RECHECK',409);
     await c.execute(`INSERT INTO hr_attendance_audit_logs(attendance_id,actor_user_id,action_type,details) VALUES(?,?,'UPDATE',?)`,[existing.id,req.auth.user.id,JSON.stringify({source:'Leave',leaveRequestId:requestId,reviewedScheduleConversion:true,leaveCode:policy.leave_code,previous:{attendanceStatus:existing.attendance_status,attendanceSource:existing.attendance_source,approvalStatus:existing.approval_status,approvedAt:existing.approved_at,approvedByUserId:existing.approved_by_user_id,scheduledClockIn:existing.scheduled_clock_in,scheduledClockOut:existing.scheduled_clock_out,clockInNotes:existing.clock_in_notes,clockOutNotes:existing.clock_out_notes,breakMinutes:existing.break_minutes,sessionNo:existing.session_no},noPunchesVerified:true})]);
    }
   }else{
    const [insert]=await c.execute(`INSERT INTO hr_attendances(staff_profile_id,attendance_date,session_no,attendance_status,attendance_source,approval_status,approved_by_user_id,approved_at,leave_request_id,created_by_user_id,updated_by_user_id) VALUES(?,?,1,?,'Leave','Approved',?,NOW(6),?,?,?)`,[r.staff_profile_id,date,leaveStatus,req.auth.user.id,requestId,req.auth.user.id,req.auth.user.id]);
    await c.execute(`INSERT INTO hr_attendance_audit_logs(attendance_id,actor_user_id,action_type,details) VALUES(?,?,'CREATE',?)`,[insert.insertId,req.auth.user.id,JSON.stringify({source:'Leave',leaveRequestId:requestId,leaveCode:policy.leave_code})]);
   }
  }
  if(paid)await post(c,req,requestId,balance,'APPROVE',dayCents(r.total_days),-dayCents(r.total_days));
 }else if(paid)await post(c,req,requestId,balance,'REJECT',0,-dayCents(r.total_days));
 await c.execute('UPDATE hr_leave_requests SET request_status=?,reviewed_by_user_id=?,reviewed_at=NOW(6),review_remarks=? WHERE id=?',[data.decision,req.auth.user.id,data.remarks||null,requestId]);
 await note(c,req,requestId,data.decision==='Approved'?'APPROVE':'REJECT',{remarks:data.remarks,reviewedScheduleConversion:data.decision==='Approved'&&Boolean(data.allow_schedule_conversion),leaveCode:policy.leave_code});
 });res.json({message:'LEAVE_REQUEST_DECISION_SAVED'});}
export async function requestCancel(req,res){access(req,'self');const requestId=id.parse(req.params.id),data=z.object({reason:z.string().trim().min(4).max(1000)}).strict().parse(req.body);
 await tx(req.auth.pool,async c=>{const {r}=await lockRequest(c,req,requestId);if(r.request_status!=='Pending')fail('ONLY_PENDING_LEAVE_CANCELLABLE',409);
 const [[t]]=await c.execute('SELECT is_paid FROM hr_leave_types WHERE id=?',[r.leave_type_id]);
 const b=await lockBalance(c,r.staff_profile_id,r.leave_type_id,r.balance_year,Number(t.is_paid),{release:true});
 if(b)await post(c,req,requestId,b,'CANCEL',0,-dayCents(r.total_days));
 await c.execute(`UPDATE hr_leave_requests SET request_status='Cancelled',cancelled_by_user_id=?,cancelled_at=NOW(6),cancel_reason=? WHERE id=?`,[req.auth.user.id,data.reason,requestId]);
 await note(c,req,requestId,'CANCEL',{reason:data.reason});
 });res.json({message:'LEAVE_REQUEST_CANCELLED'});}
export async function requestAudit(req,res){access(req,'view');const requestId=id.parse(req.params.id);const [[r]]=await req.auth.pool.execute('SELECT staff_profile_id FROM hr_leave_requests WHERE id=?',[requestId]);if(!r)fail('LEAVE_REQUEST_NOT_FOUND',404);await staff(req.auth.pool,req,r.staff_profile_id,false,true);
 const [logs]=await req.auth.pool.execute('SELECT a.id,a.action_type,a.details,DATE_FORMAT(a.recorded_at,\'%Y-%m-%d %H:%i:%s\') AS recorded_at,u.full_name AS actor_name FROM hr_leave_request_audit_logs a JOIN users u ON u.id=a.actor_user_id WHERE a.leave_request_id=? ORDER BY a.id DESC LIMIT 100',[requestId]);res.set('Cache-Control','no-store').json({logs:logs.map(x=>({...x,id:String(x.id)}))});}
export async function requestAttachment(req,res){access(req,'view');const requestId=id.parse(req.params.id),attachmentId=id.parse(req.params.attachmentId);const [[ref]]=await req.auth.pool.execute('SELECT staff_profile_id FROM hr_leave_requests WHERE id=?',[requestId]);if(!ref)fail('LEAVE_REQUEST_NOT_FOUND',404);await staff(req.auth.pool,req,ref.staff_profile_id,false,true);
 const [[row]]=await req.auth.pool.execute('SELECT file_name,mime_type,file_data FROM hr_leave_request_attachments WHERE leave_request_id=? AND id=? AND is_removed=0',[requestId,attachmentId]);if(!row)fail('ATTACHMENT_NOT_FOUND',404);
 res.set({'Cache-Control':'private, no-store','Content-Disposition':`attachment; filename="${row.file_name.replace(/[^A-Za-z0-9_. -]/g,'_')}"`,'X-Content-Type-Options':'nosniff'}).type(row.mime_type).send(row.file_data);
}
// Recalculate is verification-first, never overwrites manually imported opening balances.
export async function requestRecalculate(req,res){access(req,'recalculate');const balanceId=id.parse(req.params.balanceId);
 const result=await tx(req.auth.pool,async c=>{const [[b]]=await c.execute('SELECT id,used_days,pending_days FROM hr_leave_balances WHERE id=? FOR UPDATE',[balanceId]);if(!b)fail('LEAVE_BALANCE_NOT_FOUND',404);
 const [[opening]]=await c.execute('SELECT opening_used_days,opening_pending_days FROM hr_leave_balance_openings WHERE balance_id=?',[balanceId]);
 const [[total]]=await c.execute('SELECT COALESCE(SUM(delta_used_days),0) AS used_delta,COALESCE(SUM(delta_pending_days),0) AS pending_delta,COUNT(*) AS posting_count FROM hr_leave_request_postings WHERE balance_id=?',[balanceId]);
 if(!opening&&Number(total.posting_count)!==0)fail('BALANCE_RECONCILIATION_MISSING_OPENING',409);
 const verified=opening?reconcileBalance(opening,total,b):{used:b.used_days,pending:b.pending_days};
 await c.execute('UPDATE hr_leave_balances SET last_recalculated_at=NOW(6) WHERE id=?',[balanceId]);
 return {balanceId:String(balanceId),...verified,postings:Number(total.posting_count),verified:true,importedOpeningPreserved:true};});res.json(result);
}
