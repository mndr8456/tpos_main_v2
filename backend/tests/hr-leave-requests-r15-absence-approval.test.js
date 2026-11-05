// R1.5: absence requests (EL/UL/MC) are valid without physical attendance.
// V1 reference: a schedule is different from clocked work; actual punches stay immutable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isConvertibleSchedule,assessLeaveAttendance} from '../src/leave-request-attendance.js';
import {approvalBlocker,approvalScheduleNotice} from '../../frontend/src/leave-request-approval.js';
const src=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const row=(overrides={})=>({
 id:31,attendance_date:'2026-11-05',session_no:1,
 scheduled_clock_in:'2026-11-05 08:00:00',scheduled_clock_out:'2026-11-05 17:00:00',
 clock_in:null,clock_out:null,break_minutes:60,working_minutes:0,
 overtime_minutes:0,late_minutes:0,early_leave_minutes:0,
 attendance_status:'Present',attendance_source:'Manual',approval_status:'Pending',status:'active',
 approved_by_user_id:null,approved_at:null,leave_request_id:null,
 clock_in_notes:'Roster planned for the day',clock_out_notes:'',punch_events:0,...overrides
});

test('R1.5: EL, UL and MC Full Day do not need Clock In or Clock Out to approve a scheduled absence',()=>{
 for(const leaveCode of ['EL','UL','MC']){
  assert.equal(isConvertibleSchedule(row()),true,leaveCode);
  assert.equal(assessLeaveAttendance([row()],'Full Day'),'SCHEDULE_ONLY',leaveCode);
  assert.equal(approvalBlocker('SCHEDULE_ONLY'),null,leaveCode);
 }
 assert.match(approvalScheduleNotice('SCHEDULE_ONLY',1),/OWNER \/ ADMIN \/ HR/);
});
test('R1.5: notes and planned breaks are not evidence of attendance',()=>{
 assert.equal(isConvertibleSchedule(row({clock_in_notes:'Work roster notes',clock_out_notes:'Planned shift',break_minutes:90})),true);
});
test('R1.5: previously administratively approved schedule without punches is still convertible with approval audit',()=>{
 const planned=row({approval_status:'Approved',approved_by_user_id:8,approved_at:'2026-11-05 08:00:00'});
 assert.equal(isConvertibleSchedule(planned),true);
 assert.equal(assessLeaveAttendance([planned]),'SCHEDULE_ONLY');
});
test('R1.5: two scheduled sessions on one day can both be linked without posting double leave days',()=>{
 assert.equal(assessLeaveAttendance([row(),row({id:32,session_no:2})]),'SCHEDULE_ONLY');
 const api=src('../src/leave-requests.js');
 assert.match(api,/for\(const existing of existingRows\)/);
 assert.match(api,/if\(paid\)await post\(c,req,requestId,balance,'APPROVE'/);
});
test('R1.5: Clock In without Clock Out means ACTUAL attendance, not a demand that absent staff punch',()=>{
 assert.equal(assessLeaveAttendance([row({clock_in:'2026-11-05 08:03:00'})]),'OPEN_PUNCH');
 assert.match(approvalBlocker('OPEN_PUNCH'),/actual attendance conflict/);
});
test('R1.5: completed actual work, historical event and nonzero minutes remain protected',()=>{
 for(const r of [
  row({clock_in:'2026-11-05 08:00:00',clock_out:'2026-11-05 17:00:00'}),
  row({punch_events:1}),row({working_minutes:240}),row({overtime_minutes:20}),
  row({late_minutes:3})]){
  assert.equal(assessLeaveAttendance([r]),'EXISTING_ATTENDANCE');
 }
});
test('R1.5: linked leave, inactive, rejected schedule and missing authorization cannot be converted',()=>{
 for(const r of [row({leave_request_id:55}),row({attendance_source:'Leave'}),row({status:'inactive'}),row({approval_status:'Rejected'}),row({attendance_source:'Web'})]){
  assert.equal(isConvertibleSchedule(r),false);
 }
 const api=src('../src/leave-requests.js');
 assert.match(api,/const privileged=new Set\(\['OWNER','ADMIN','HR'\]\)/);
 assert.match(api,/access\(req,'approve'\)/);
 assert.match(api,/allow_schedule_conversion:z.boolean\(\).optional\(\).default\(false\)/);
});
test('R1.5: Approve remains enabled for Pending request, but final decisions cannot be altered',()=>{
 const ui=src('../../frontend/src/LeaveRequests.jsx');
 assert.match(ui,/disabled=\{busy\} title=\{blocker\|\|'Approve Leave Request'\}/);
 assert.doesNotMatch(ui,/disabled=\{busy\|\|Boolean\(blocker\)\}/);
 assert.match(ui,/r.request_status==='Pending'&&/);
 const api=src('../src/leave-requests.js');
 assert.match(api,/if\(r.request_status!=='Pending'\)fail\('LEAVE_REQUEST_DECISION_ALREADY_FINAL'/);
});
test('R1.5: approval preserves source schedule and any previous approver/notes in an immutable audit',()=>{
 const api=src('../src/leave-requests.js');
 const review=api.split('export async function requestReview')[1].split('export async function requestCancel')[0];
 for(const field of ['approvalStatus:existing.approval_status','approvedAt:existing.approved_at','approvedByUserId:existing.approved_by_user_id','clockInNotes:existing.clock_in_notes','clockOutNotes:existing.clock_out_notes'])assert.ok(review.includes(field));
 assert.match(review,/hr_attendance_audit_logs/);
 assert.match(review,/hr_leave_request_audit_logs|await note\(/);
 assert.doesNotMatch(review,/(DELETE FROM hr_attendances|DELETE FROM hr_clock_events)/);
 assert.ok(review.indexOf('FOR UPDATE')<review.indexOf('UPDATE hr_attendances'));
});
test('R1.5: UL and unpaid EL do not post an Annual Leave balance',()=>{
 const api=src('../src/leave-requests.js');
 assert.match(api,/if\(!paid\)return null/);
 assert.match(api,/if\(paid\)await post\(c,req,requestId,balance,'APPROVE'/);
 const sql=src('../../database/032_tenant_hr_leave_emergency_attendance.sql');
 assert.match(sql,/leave_code='EL' AND is_paid=0 AND attendance_status='Annual Leave'/);
 assert.doesNotMatch(sql,/(UPDATE\s+hr_leave_balances|ALTER\s+TABLE\s+hr_leave_balances|DELETE\s+FROM\s+hr_leave_balances)/i);
});
test('R1.5: MC still checks Medical Certificate policy and rejects missing required documents',()=>{
 const api=src('../src/leave-requests.js');
 assert.match(api,/if\(Number\(policy.requires_attachment\)\)/);
 assert.match(api,/attachment_type='Medical Certificate'/);
 assert.match(api,/REQUIRED_SUPPORTING_DOCUMENT_MISSING/);
});
test('R1.5: distinct Emergency Leave status is supported by Attendance and Leave Types',()=>{
 const sql=src('../../database/032_tenant_hr_leave_emergency_attendance.sql');
 assert.match(sql,/ALTER TABLE hr_attendances MODIFY COLUMN attendance_status ENUM/);
 assert.match(sql,/ALTER TABLE hr_leave_types MODIFY COLUMN attendance_status ENUM/);
 for(const f of ['../src/attendance-rules.js','../src/leave-type-rules.js','../../frontend/src/LeaveTypes.jsx','../../frontend/src/Attendances.jsx'])assert.match(src(f),/Emergency Leave/,f);
 assert.match(src('../src/leave-type-rules.js'),/v.leave_code==='EL' && v.attendance_status!=='Emergency Leave'/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM/);
});
test('R1.5: migration 032 read-only by default, applies only active tenants and follows 031',()=>{
 const provision=src('../src/tenants.js'),installer=src('../scripts/setup-leave-request-attendance-policy.js'),pkg=src('../package.json');
 assert.match(provision,/executeSchema\(dbName,'031_tenant_hr_leave_requests_no_import.sql'\);\s*await executeSchema\(dbName,'032_tenant_hr_leave_emergency_attendance.sql'\)/);
 assert.match(installer,/process.argv.includes\('--apply'\)/);
 assert.match(installer,/WHERE status='ACTIVE'/);
 assert.match(installer,/if\(apply&&!current\)await executeSchema/);
 assert.match(pkg,/db:leave-requests:attendance-policy/);
});
test('R1.5: half-day still needs a separately supported working session; it is not silently consumed',()=>{
 assert.equal(assessLeaveAttendance([row()],'Half Day'),'HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW');
 assert.equal(assessLeaveAttendance([],'Half Day'),'CLEAR');
});

test('R1.5: Emergency Leave cannot be manually created or imported without a Leave Request',()=>{
 const api=src('../src/attendances.js'),ui=src('../../frontend/src/Attendances.jsx');
 assert.match(api,/EMERGENCY_LEAVE_REQUIRES_LEAVE_REQUEST/);
 assert.match(api,/importBlocked=new Set\(\['Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave'\]\)/);
 assert.match(ui,/disabled=\{x==='Emergency Leave'\}/);
});
