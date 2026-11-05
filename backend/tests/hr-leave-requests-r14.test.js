// R1.4 regression: safe authorized schedule conversion; never reclassify clocked work.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isConvertibleSchedule, assessLeaveAttendance} from '../src/leave-request-attendance.js';
import {approvalBlocker, approvalScheduleNotice, approvalErrorMessage} from '../../frontend/src/leave-request-approval.js';
const src = filename => readFileSync(new URL(filename, import.meta.url),'utf8');
const planned = overrides => ({id:41,attendance_date:'2026-11-05',session_no:1,
 clock_in:null,clock_out:null,clock_in_notes:'',clock_out_notes:'',
 scheduled_clock_in:'2026-11-05 09:00:00',scheduled_clock_out:'2026-11-05 17:00:00',
 break_minutes:0,working_minutes:0,overtime_minutes:0,late_minutes:0,early_leave_minutes:0,
 attendance_status:'Present',attendance_source:'Manual',approval_status:'Pending',status:'active',
 approved_by_user_id:null,approved_at:null,leave_request_id:null,punch_events:0,...overrides});

test('R1.4: new UL with an unpunched Pending schedule can be reviewed (not a worked conflict)',()=>{
 assert.equal(isConvertibleSchedule(planned()),true);
 assert.equal(assessLeaveAttendance([planned()],'Full Day'),'SCHEDULE_ONLY');
 assert.equal(assessLeaveAttendance([],'Full Day'),'CLEAR');
 assert.equal(approvalBlocker('SCHEDULE_ONLY'),null);
 assert.match(approvalScheduleNotice('SCHEDULE_ONLY',1),/OWNER \/ ADMIN \/ HR confirmation/);
});
test('R1.4: unclosed Clock In remains blocked',()=>{
 assert.equal(assessLeaveAttendance([planned({clock_in:'2026-11-05 09:00:00'})]),'OPEN_PUNCH');
 assert.match(approvalBlocker('OPEN_PUNCH'),/Clock Out/);
});
test('R1.4: completed punches and immutable event history remain protected even if clock fields are cleared',()=>{
 for(const row of [planned({clock_in:'2026-11-05 09:00:00',clock_out:'2026-11-05 18:00:00'}),planned({punch_events:1}),planned({working_minutes:200})]){
  assert.equal(isConvertibleSchedule(row),false);
  assert.equal(assessLeaveAttendance([row]),'EXISTING_ATTENDANCE');
 }
});
test('R1.5: rejected/inactive/linked and Web-source records cannot be converted',()=>{
 for(const row of [planned({approval_status:'Rejected'}),planned({status:'inactive'}),planned({leave_request_id:17}),planned({attendance_source:'Leave'}),planned({attendance_source:'Web'}),planned({attendance_status:'Unpaid Leave'})]){
  assert.equal(isConvertibleSchedule(row),false);
  assert.equal(assessLeaveAttendance([row]),'EXISTING_ATTENDANCE');
 }
});
test('R1.5: multiple unpunched sessions can be converted together but duplicate session keys are rejected',()=>{
 assert.equal(assessLeaveAttendance([planned(),planned({id:42,session_no:2})]),'SCHEDULE_ONLY');
 assert.equal(assessLeaveAttendance([planned(),planned({id:42})]),'EXISTING_ATTENDANCE');
});
test('R1.4: one-day and multi-day schedule conversion works only for Full Day',()=>{
 assert.equal(assessLeaveAttendance([planned(),planned({id:44,attendance_date:'2026-11-06'})],'Full Day'),'SCHEDULE_ONLY');
 assert.equal(assessLeaveAttendance([planned()],'Half Day'),'HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW');
 assert.equal(assessLeaveAttendance([],'Half Day'),'CLEAR');
 assert.match(approvalErrorMessage({message:'HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW'}),/half-day/);
});
test('R1.4: OWNER, ADMIN or HR permission and explicit schedule confirmation are mandatory for changes',()=>{
 const api=src('../src/leave-requests.js');const action=api.split('export async function requestReview')[1].split('export async function requestCancel')[0];
 assert.match(api,/access\(req,'approve'\)/);
 assert.match(action,/allow_schedule_conversion:z.boolean\(\).optional\(\).default\(false\)/);
 assert.match(action,/attendanceState==='SCHEDULE_ONLY'&&!data.allow_schedule_conversion/);
 assert.match(action,/SCHEDULE_CONVERSION_CONFIRMATION_REQUIRED/);
 assert.match(action,/leaveAttendanceSelect} FOR UPDATE/);
 assert.match(action,/approved_at=NOW\(6\),leave_request_id=\?/);
 assert.match(action,/clock_in IS NULL AND clock_out IS NULL AND leave_request_id IS NULL/);
 assert.match(action,/if\(changed.affectedRows!==1\)fail\('ATTENDANCE_SCHEDULE_CHANGED_RECHECK'/);
});
test('R1.4: approved leave links existing schedule without deleting punches, and retains both audit ledgers',()=>{
 const api=src('../src/leave-requests.js');const action=api.split('export async function requestReview')[1].split('export async function requestCancel')[0];
 assert.match(action,/hr_attendance_audit_logs/);
 assert.match(action,/reviewedScheduleConversion:true/);
 assert.match(action,/hr_leave_request_audit_logs|await note\(/);
 assert.doesNotMatch(action,/DELETE FROM hr_attendances|UPDATE hr_clock_events|DELETE FROM hr_clock_events/);
 assert.ok(action.indexOf('SELECT * FROM hr_leave_types')<action.indexOf('leaveAttendanceSelect} FOR UPDATE'));
 assert.ok(action.indexOf('leaveAttendanceSelect} FOR UPDATE')<action.indexOf('UPDATE hr_attendances SET attendance_status='));
 assert.ok(action.indexOf('UPDATE hr_attendances SET attendance_status=')<action.indexOf("'APPROVE',dayCents"));
 assert.ok(action.indexOf("'APPROVE',dayCents")<action.indexOf('UPDATE hr_leave_requests SET request_status'));
});
test('R1.4: frontend preflights the schedule and requires an explicit approval confirmation',()=>{
 const ui=src('../../frontend/src/LeaveRequests.jsx');
 assert.match(ui,/decision==='Approved'&&attendanceState==='SCHEDULE_ONLY'/);
 assert.match(ui,/setReview\(\{row:latest.item,decision,remarks:''/);
 assert.match(ui,/allow_schedule_conversion:decision==='Approved'&&attendanceState==='SCHEDULE_ONLY'/);
 assert.doesNotMatch(ui,/window\.confirm\(/);
 assert.match(ui,/details.attendanceState==='SCHEDULE_ONLY'/);
 assert.match(ui,/disabled=\{busy\} title=\{blocker/);
 const css=src('../../frontend/src/LeaveRequests.css');
 assert.match(css,/\.lr-approval-schedule/);
 assert.match(css,/\.lr-request-details > \.field \+ \.form-two/);
 assert.doesNotMatch(ui,/CSV Template|Import Leave Requests/);
});


test('R1.4: all three approver roles OWNER ADMIN HR (and no others) can approve with explicit permission',()=>{
 const api=src('../src/leave-requests.js');
 const ui=src('../../frontend/src/LeaveRequests.jsx');
 const migration=src('../../database/030_tenant_hr_leave_requests.sql');
 assert.match(api,/const privileged=new Set\(\['OWNER','ADMIN','HR'\]\)/);
 assert.match(api,/mode==='approve'&&\(!isPriv\(req\)\|\|!p.includes\('leave_requests.approve'\)\)/);
 assert.match(migration,/WHERE r.code IN \('OWNER','ADMIN','HR'\)/);
 assert.match(ui,/canApprove=\['OWNER','ADMIN','HR'\]\.includes\(String\(profile.user.role\|\|''\)\.toUpperCase\(\)\)\&\&perms.includes\('leave_requests.approve'\)/);
 const messages=src('../../frontend/src/leave-request-approval.js');
 assert.match(messages,/OWNER \/ ADMIN \/ HR confirmation/);
 assert.doesNotMatch(ui,/· HR confirmation/);
});
