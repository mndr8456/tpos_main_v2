import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {attendanceDecisionAllowed,attendanceApprovalHint} from '../../frontend/src/attendance-approval.js';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const record = (override={}) => ({status:'active',attendance_source:'Manual',attendance_status:'Present',clock_in:null,clock_out:null,...override});

test('R1.1 Reject is available for incomplete active attendance; Approve requires both clock punches',()=>{
 const incomplete=record();
 assert.equal(attendanceDecisionAllowed(incomplete,'Rejected'),true);
 assert.equal(attendanceDecisionAllowed(incomplete,'Approved'),false);
 assert.match(attendanceApprovalHint(incomplete),/Clock In and Clock Out/);
 assert.equal(attendanceDecisionAllowed(record({clock_in:'2026-11-03 09:00',clock_out:'2026-11-03 18:00'}),'Approved'),true);
 assert.equal(attendanceDecisionAllowed(record({clock_in:'2026-11-03 09:00'}),'Approved'),false);
});
test('R1.1 non-working statuses remain approvable without punches',()=>{
 for (const attendance_status of ['Rest Day','Public Holiday','Absent','Annual Leave','Medical Leave','Unpaid Leave']) {
  assert.equal(attendanceDecisionAllowed(record({attendance_status}),'Approved'),true,attendance_status);
 }
});
test('R1.1 rejects decisions for inactive and leave-linked attendance',()=>{
 for (const invalid of [record({status:'inactive'}),record({attendance_source:'Leave'})]) {
  assert.equal(attendanceDecisionAllowed(invalid,'Approved'),false);
  assert.equal(attendanceDecisionAllowed(invalid,'Rejected'),false);
 }
 assert.equal(attendanceDecisionAllowed(record(),'BadDecision'),false);
});
test('R1.1 Owner, Admin and HR retain explicit permission-gated Approve/Reject; Manager excluded',()=>{
 const ui=read('../../frontend/src/Attendances.jsx');
 assert.match(ui,/\['OWNER','ADMIN','HR'\]\.includes\(String\(profile\.user\.role/);
 assert.match(ui,/permissions\.includes\('attendances\.approve'\)/);
 assert.match(ui,/canApprove&&r\.status==='active'.*icon\(attendanceApprovalHint\(r\)/);
 assert.match(ui,/canApprove&&r\.status==='active'.*icon\('Reject Attendance'/);
 const api=read('../src/attendances.js');
 assert.match(api,/approveAttendance\(req,res\)\{check\(req,'approve'\)/);
 assert.match(api,/input\.decision==='Approved'&&!approvalReady\(r\)/);
 const routes=read('../src/app.js');
 assert.match(routes,/permitted\('attendances\.approve'\),approveAttendance/);
 const migration=read('../../database/026_tenant_hr_attendances.sql');
 assert.match(migration,/OWNER','ADMIN','HR/);
});
test('R1.1 Attendance filters share Search visual treatment with matching border, radius and focus',()=>{
 const css=read('../../frontend/src/Attendances.css');
 for(const s of ['.att-page .att-filter select','.att-page .att-filter .att-filter-date','.att-page .att-filter .search:focus-within','.att-page .att-filter select:focus'])assert.ok(css.includes(s),s);
 assert.match(css,/min-height:44px/);
 assert.match(css,/border-radius:10px/);
 const ui=read('../../frontend/src/Attendances.jsx');
 for(const s of ['All Staff','All Departments','All Attendance Statuses','All Approval Statuses','All Sources','All Record Status','Date From','Date To','Row Limit'])assert.ok(ui.includes(s),s);
});
