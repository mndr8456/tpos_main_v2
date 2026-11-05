import {z} from 'zod';
import {AttendanceError,attendanceDate,attendanceTime,calculateAttendance,approvalReady,attendanceStatuses,attendanceSources,attendanceImportHeaders,attendanceCsvTemplate,parseAttendanceCsv} from './attendance-rules.js';
const fail=(c,status=400)=>{throw new AttendanceError(c,status);};
const managers=new Set(['OWNER','ADMIN','HR']);
const isManager=req=>managers.has(req.auth.user.role_code);
const canView=req=>isManager(req)||req.auth.user.role_code==='MANAGER';
const check=(req,kind='view')=>{if((['manage','approve'].includes(kind)&&!isManager(req))||(kind==='view'&&!canView(req)))fail('ATTENDANCE_ACCESS_DENIED',403);};
const numeric=z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const notes=z.string().trim().max(5000).optional().default('');
const datetime=z.union([z.string().max(30),z.null()]).optional();
const attendanceInput=z.object({
 staff_profile_id:numeric,attendance_date:z.string().max(12),session_no:z.coerce.number().int().min(1).max(99).default(1),
 scheduled_clock_in:datetime,scheduled_clock_out:datetime,clock_in:datetime,clock_out:datetime,
 break_minutes:z.coerce.number().int().min(0).max(1440).default(0),
 attendance_status:z.enum(attendanceStatuses).default('Present'),attendance_source:z.literal('Manual').optional().default('Manual'),
 clock_in_notes:notes,clock_out_notes:notes,status:z.enum(['active','inactive']).default('active')
}).strict();
const importBlocked=new Set(['Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave']);
const previewError=e=>{
 if(Array.isArray(e?.issues))return e.issues.map(i=>`${String(i.path?.[0]||'Field').replaceAll('_',' ')}: invalid or missing value`).join('; ');
 const messages={STAFF_NUMBER_NOT_AVAILABLE:'Staff No. is not linked to an active Staff Profile.',INVALID_ATTENDANCE_DATE:'Attendance date is invalid. Use DD/MM/YYYY or YYYY-MM-DD.',INVALID_ATTENDANCE_TIME:'Clock time is invalid. Use DD/MM/YYYY HH:mm or YYYY-MM-DD HH:mm.',INVALID_CLOCK_RANGE:'Clock Out must be after Clock In.',CLOCK_IN_REQUIRED:'Clock In is required before Clock Out.',NON_WORK_STATUS_CANNOT_HAVE_CLOCK:'Off Day / leave / absence must not contain clock punches.',INVALID_BREAK_MINUTES:'Break minutes must be between 0 and 1440.'};
 return messages[e?.message]||String(e?.message||'Invalid attendance row').replaceAll('_',' ');
};

const outputColumns=`a.id,a.staff_profile_id,DATE_FORMAT(a.attendance_date,'%Y-%m-%d') AS attendance_date,a.session_no,
 DATE_FORMAT(a.scheduled_clock_in,'%Y-%m-%d %H:%i') AS scheduled_clock_in,
 DATE_FORMAT(a.scheduled_clock_out,'%Y-%m-%d %H:%i') AS scheduled_clock_out,
 DATE_FORMAT(a.clock_in,'%Y-%m-%d %H:%i') AS clock_in,
 DATE_FORMAT(a.clock_out,'%Y-%m-%d %H:%i') AS clock_out,
 a.break_minutes,a.working_minutes,a.overtime_minutes,a.late_minutes,a.early_leave_minutes,
 a.attendance_status,a.attendance_source,a.approval_status,a.approved_by_user_id,
 DATE_FORMAT(a.approved_at,'%Y-%m-%d %H:%i') AS approved_at,a.clock_in_notes,a.clock_out_notes,a.status,
 DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i') AS created_at,
 sp.staff_no,sp.department,sp.job_title,sp.standard_working_hours_per_day,
 u.id AS user_id,u.full_name,approver.full_name AS approved_by_name`;
const from=`FROM hr_attendances a JOIN staff_profiles sp ON sp.id=a.staff_profile_id JOIN users u ON u.id=sp.user_id LEFT JOIN users approver ON approver.id=a.approved_by_user_id`;
const selectRow=`SELECT ${outputColumns} ${from}`;
const asOutput=row=>({...row,id:String(row.id),staff_profile_id:String(row.staff_profile_id),user_id:String(row.user_id),approved_by_user_id:row.approved_by_user_id?String(row.approved_by_user_id):null});
async function tx(pool,callback){const c=await pool.getConnection();try{await c.beginTransaction();const result=await callback(c);await c.commit();return result;}catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')fail('ATTENDANCE_SESSION_ALREADY_EXISTS',409);throw e;}finally{c.release();}}
async function audit(c,req,attendanceId,action,details={}){await c.execute('INSERT INTO hr_attendance_audit_logs(attendance_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[attendanceId,req.auth.user.id,action,JSON.stringify(details)]);}
async function staff(c,id,lock=false){const [[row]]=await c.execute(`SELECT sp.id,sp.staff_no,sp.status,u.status AS user_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.id=? ${lock?'FOR UPDATE':''}`,[id]);if(!row||row.status!=='active'||row.user_status!=='ACTIVE')fail('STAFF_NOT_ACTIVE',422);return row;}
async function get(c,id,lock=false){const [[r]]=await c.execute(`${selectRow} WHERE a.id=? ${lock?'FOR UPDATE':''}`,[id]);if(!r)fail('ATTENDANCE_NOT_FOUND',404);return r;}
export function attendancePayload(input){const body=attendanceInput.parse(input);if(body.attendance_status==='Emergency Leave')fail('EMERGENCY_LEAVE_REQUIRES_LEAVE_REQUEST',422);return {...body,attendance_date:attendanceDate(body.attendance_date),...calculateAttendance(body)};}
const valuesFor=(body)=>[body.staff_profile_id,body.attendance_date,body.session_no,body.scheduled_clock_in,body.scheduled_clock_out,body.clock_in,body.clock_out,body.break_minutes,body.working_minutes,body.overtime_minutes,body.late_minutes,body.early_leave_minutes,body.attendance_status,body.attendance_source,body.clock_in_notes,body.clock_out_notes,body.status];
const fields='staff_profile_id,attendance_date,session_no,scheduled_clock_in,scheduled_clock_out,clock_in,clock_out,break_minutes,working_minutes,overtime_minutes,late_minutes,early_leave_minutes,attendance_status,attendance_source,clock_in_notes,clock_out_notes,status'.split(',');
// Approved leave always owns its date; a second manual/import session must never override it.
async function ensureNotApprovedLeave(c,staffId,date,exceptId=0){
 const [[leave]]=await c.execute("SELECT id FROM hr_attendances WHERE staff_profile_id=? AND attendance_date=? AND attendance_source='Leave' AND status='active' AND id<>? LIMIT 1 FOR UPDATE",[staffId,date,exceptId]);
 if(leave)fail('APPROVED_LEAVE_ATTENDANCE_CONFLICT',409);
}
async function insert(c,req,body,action='CREATE'){await ensureNotApprovedLeave(c,body.staff_profile_id,body.attendance_date);const vals=valuesFor(body);const [result]=await c.execute(`INSERT INTO hr_attendances(${fields.join(',')},created_by_user_id,updated_by_user_id) VALUES(${fields.map(()=>'?').join(',')},?,?)`,[...vals,req.auth.user.id,req.auth.user.id]);await audit(c,req,result.insertId,action,{source:body.attendance_source,attendanceStatus:body.attendance_status,fields:['schedule','clock','status']});return result.insertId;}
export async function attendanceMeta(req,res){check(req);const [rows]=await req.auth.pool.execute(`SELECT sp.id,sp.staff_no,u.full_name,sp.department,sp.job_title,sp.standard_working_hours_per_day FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.status='active' AND u.status='ACTIVE' ORDER BY SUBSTRING_INDEX(sp.staff_no,'-',1),CAST(SUBSTRING_INDEX(sp.staff_no,'-',-1) AS UNSIGNED),sp.id`);res.set('Cache-Control','no-store').json({staff:rows.map(x=>({...x,id:String(x.id)})),statuses:attendanceStatuses,sources:attendanceSources,canManage:isManager(req),canApprove:isManager(req),timezone:'Asia/Kuala_Lumpur'});}
export async function attendanceList(req,res){check(req);const f=z.object({search:z.string().max(160).optional().default(''),staffId:z.string().regex(/^\d+$/).optional(),department:z.string().max(160).optional(),attendanceStatus:z.enum(attendanceStatuses).optional(),approvalStatus:z.enum(['Pending','Approved','Rejected']).optional(),source:z.enum(attendanceSources).optional(),status:z.enum(['active','inactive']).optional(),dateFrom:z.string().max(12).optional(),dateTo:z.string().max(12).optional(),limit:z.coerce.number().int().min(1).max(1000).default(100)}).strict().parse(req.query);
 const where=['1=1'],args=[];
 if(f.staffId){where.push('a.staff_profile_id=?');args.push(f.staffId);}
 if(f.department){where.push('sp.department=?');args.push(f.department);}
 if(f.attendanceStatus){where.push('a.attendance_status=?');args.push(f.attendanceStatus);}
 if(f.approvalStatus){where.push('a.approval_status=?');args.push(f.approvalStatus);}
 if(f.source){where.push('a.attendance_source=?');args.push(f.source);}
 if(f.status){where.push('a.status=?');args.push(f.status);}
 if(f.dateFrom){where.push('a.attendance_date>=?');args.push(attendanceDate(f.dateFrom));}
 if(f.dateTo){where.push('a.attendance_date<=?');args.push(attendanceDate(f.dateTo));}
 if(f.search){const q=`%${f.search}%`;where.push('(sp.staff_no LIKE ? OR u.full_name LIKE ? OR sp.department LIKE ? OR sp.job_title LIKE ?)');args.push(q,q,q,q);}
 const [rows]=await req.auth.pool.execute(`${selectRow} WHERE ${where.join(' AND ')} ORDER BY a.attendance_date DESC,SUBSTRING_INDEX(sp.staff_no,'-',1) ASC,CAST(SUBSTRING_INDEX(sp.staff_no,'-',-1) AS UNSIGNED) ASC,sp.id ASC,a.session_no ASC,a.id ASC LIMIT ${f.limit}`,args);
 const summary={totalRecords:rows.length,present:rows.filter(x=>x.attendance_status==='Present').length,absentLeave:rows.filter(x=>['Absent','Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave'].includes(x.attendance_status)).length,pendingApproval:rows.filter(x=>x.approval_status==='Pending').length,workingMinutes:rows.reduce((n,x)=>n+Number(x.working_minutes),0),overtimeMinutes:rows.reduce((n,x)=>n+Number(x.overtime_minutes),0)};
 res.set('Cache-Control','no-store').json({attendance:rows.map(asOutput),summary});}
export async function attendanceDetails(req,res){check(req);const r=await get(req.auth.pool,numeric.parse(req.params.id));res.set('Cache-Control','no-store').json({attendance:asOutput(r)});}
export async function createAttendance(req,res){check(req,'manage');const body=attendancePayload(req.body);const result=await tx(req.auth.pool,async c=>{await staff(c,body.staff_profile_id,true);return insert(c,req,body);});res.status(201).json({message:'ATTENDANCE_CREATED',id:String(result)});}
export async function updateAttendance(req,res){check(req,'manage');const id=numeric.parse(req.params.id),body=attendancePayload(req.body);await tx(req.auth.pool,async c=>{const row=await get(c,id,true);if(row.attendance_source==='Leave')fail('LEAVE_ATTENDANCE_READ_ONLY',409);await staff(c,body.staff_profile_id,true);await ensureNotApprovedLeave(c,body.staff_profile_id,body.attendance_date,id);const effective={...body,attendance_source:row.attendance_source};const v=valuesFor(effective);await c.execute(`UPDATE hr_attendances SET ${fields.map(k=>`${k}=?`).join(',')},approval_status='Pending',approved_by_user_id=NULL,approved_at=NULL,updated_by_user_id=? WHERE id=?`,[...v,req.auth.user.id,id]);await audit(c,req,id,'UPDATE',{approvalReset:true,manualCorrection:row.attendance_source!=='Manual',fields:['schedule','clock','status']});});res.json({message:'ATTENDANCE_UPDATED'});}
export async function approveAttendance(req,res){check(req,'approve');const id=numeric.parse(req.params.id);const input=z.object({decision:z.enum(['Approved','Rejected'])}).strict().parse(req.body);await tx(req.auth.pool,async c=>{const r=await get(c,id,true);if(r.attendance_source==='Leave')fail('LEAVE_ATTENDANCE_READ_ONLY',409);if(r.status!=='active')fail('ATTENDANCE_INACTIVE',409);if(r.approval_status!=='Pending')fail('ATTENDANCE_DECISION_ALREADY_FINAL',409);if(input.decision==='Approved'&&!approvalReady(r))fail('CLOCK_IN_AND_OUT_REQUIRED_BEFORE_APPROVAL',409);await c.execute('UPDATE hr_attendances SET approval_status=?,approved_by_user_id=?,approved_at=NOW(6),updated_by_user_id=? WHERE id=?',[input.decision,req.auth.user.id,req.auth.user.id,id]);await audit(c,req,id,input.decision==='Approved'?'APPROVE':'REJECT',{decision:input.decision});});res.json({message:'ATTENDANCE_DECISION_SAVED'});}
export async function statusAttendance(req,res){check(req,'manage');const id=numeric.parse(req.params.id),input=z.object({status:z.enum(['active','inactive'])}).strict().parse(req.body);await tx(req.auth.pool,async c=>{const r=await get(c,id,true);if(r.attendance_source==='Leave')fail('LEAVE_ATTENDANCE_READ_ONLY',409);await c.execute('UPDATE hr_attendances SET status=?,updated_by_user_id=? WHERE id=?',[input.status,req.auth.user.id,id]);await audit(c,req,id,input.status==='active'?'REACTIVATE':'DEACTIVATE',{status:input.status});});res.json({message:'ATTENDANCE_STATUS_UPDATED'});}
export async function attendanceAudit(req,res){check(req,'manage');const id=numeric.parse(req.params.id);await get(req.auth.pool,id);const [rows]=await req.auth.pool.execute('SELECT l.id,l.action_type,l.details,DATE_FORMAT(l.recorded_at,\'%Y-%m-%d %H:%i\') AS recorded_at,u.full_name AS actor_name FROM hr_attendance_audit_logs l JOIN users u ON u.id=l.actor_user_id WHERE l.attendance_id=? ORDER BY l.id DESC LIMIT 100',[id]);res.set('Cache-Control','no-store').json({logs:rows.map(r=>({...r,id:String(r.id)}))});}
export async function attendanceTemplate(req,res){check(req,'manage');res.set('Cache-Control','no-store').type('text/csv').attachment('attendances-template.csv').send(attendanceCsvTemplate());}
async function validateCsv(req,c,source,withLock=false){const rows=parseAttendanceCsv(source),errors=[],ready=[],seen=new Set();for(let i=0;i<rows.length;i++){const raw=rows[i],number=i+2;try{
 if(!raw.staff_no)fail('staff_no is required');const [[sp]]=await c.execute(`SELECT sp.id FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.staff_no=? AND sp.status='active' AND u.status='ACTIVE' ${withLock?'FOR UPDATE':''}`,[raw.staff_no]);if(!sp)fail('STAFF_NUMBER_NOT_AVAILABLE');
 const payload=attendancePayload({staff_profile_id:sp.id,attendance_date:raw.attendance_date,session_no:raw.session_no||1,scheduled_clock_in:raw.scheduled_clock_in||null,scheduled_clock_out:raw.scheduled_clock_out||null,clock_in:raw.clock_in||null,clock_out:raw.clock_out||null,break_minutes:raw.break_minutes||0,attendance_status:raw.attendance_status,attendance_source:'Manual',clock_in_notes:raw.clock_in_notes||'',clock_out_notes:raw.clock_out_notes||'',status:raw.status||'active'});
 if(importBlocked.has(payload.attendance_status))fail('Leave types must be managed through Leave Requests');
 const key=`${sp.id}:${payload.attendance_date}:${payload.session_no}`;if(seen.has(key))fail('Duplicate attendance session in CSV');seen.add(key);
 const [[exist]]=await c.execute(`SELECT id FROM hr_attendances WHERE staff_profile_id=? AND attendance_date=? AND session_no=? ${withLock?'FOR UPDATE':''}`,[sp.id,payload.attendance_date,payload.session_no]);if(exist)fail('Attendance session already exists');await ensureNotApprovedLeave(c,sp.id,payload.attendance_date);ready.push(payload);
 }catch(e){errors.push({row:number,message:previewError(e)});}}
 return {rows:rows.length,validRows:ready.length,errors,ready};}
export async function previewAttendanceImport(req,res){check(req,'manage');const input=z.object({csv:z.string().min(1).max(1_048_576)}).strict().parse(req.body);const result=await validateCsv(req,req.auth.pool,input.csv);res.set('Cache-Control','no-store').json({rows:result.rows,validRows:result.validRows,errors:result.errors});}
export async function confirmAttendanceImport(req,res){check(req,'manage');const input=z.object({csv:z.string().min(1).max(1_048_576)}).strict().parse(req.body);const count=await tx(req.auth.pool,async c=>{const v=await validateCsv(req,c,input.csv,true);if(v.errors.length)fail('ATTENDANCE_IMPORT_VALIDATION_FAILED',422);for(const body of v.ready)await insert(c,req,{...body,attendance_source:'Import'},'IMPORT_CREATE');return v.ready.length;});res.json({message:'ATTENDANCE_IMPORT_COMPLETE',imported:count});}
