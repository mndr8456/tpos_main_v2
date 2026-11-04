// R1.3 regression: dated attendance approval preflight and silent Refresh notice reset.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {refreshPage} from '../../frontend/src/refresh-page.js';
import {approvalBlocker,approvalErrorMessage} from '../../frontend/src/leave-request-approval.js';
const base=dirname(fileURLToPath(import.meta.url));
const source=path=>readFileSync(resolve(base,path),'utf8');

test('R1.3 Refresh clears existing notice before reloading without inventing a success notification',async()=>{
 const events=[];const result=refreshPage(()=>{events.push('reload');return Promise.resolve('loaded');},(message,error=false)=>events.push(['notice',message,error]));
 assert.equal(await result,'loaded');assert.deepEqual(events,[['notice','',false],'reload']);
});
test('R1.3 approval explains an open Clock In on requested dates without bypassing it',()=>{
 assert.match(approvalBlocker('OPEN_PUNCH'),/Clock In/);
 assert.match(approvalBlocker('OPEN_PUNCH'),/Clock Out/);
 assert.match(approvalErrorMessage(new Error('UNCLOSED_CLOCK_PUNCH')),/Clock Out/);
 assert.equal(approvalBlocker('CLEAR'),null);
 assert.equal(approvalBlocker('POSTED'),null);
});
test('R1.3 approval explains an existing completed attendance and never permits silent overwrite',()=>{
 assert.match(approvalBlocker('EXISTING_ATTENDANCE'),/Attendance record already exists/);
 assert.match(approvalBlocker('EXISTING_ATTENDANCE'),/must not be deleted or overwritten/);
 assert.match(approvalErrorMessage({message:'EXISTING_ATTENDANCE_REQUIRES_HR_REVIEW'}),/cannot be overwritten/);
});
test('R1.3 Leave Request detail checks the requested period, not unrelated historic open punches',()=>{
 const api=source('../src/leave-requests.js');
 const detail=api.split('export async function requestDetail')[1].split('export async function requestCreate')[0];
 assert.match(detail,/attendance_date BETWEEN \? AND \?/);
 assert.match(detail,/AS open_punches/);
 assert.match(detail,/const attendanceState=/);
 assert.match(detail,/attendanceState\}/);
 assert.doesNotMatch(detail,/otherOpen|clock_in IS NOT NULL AND clock_out IS NULL AND status='active'/);
});
test('R1.3 Approve locks same-date attendance and blocks overlaps, but not an unrelated historical day',()=>{
 const api=source('../src/leave-requests.js');
 const review=api.split('export async function requestReview')[1].split('export async function requestCancel')[0];
 assert.match(review,/await tx\(req\.auth\.pool,async c=>/);
 assert.match(review,/attendance_date BETWEEN \? AND \? FOR UPDATE/);
 assert.match(review,/conflicts\.some\(x=>x\.clock_in&&!x\.clock_out\).*UNCLOSED_CLOCK_PUNCH/);
 assert.match(review,/if\(conflicts\.length\)fail\('EXISTING_ATTENDANCE_REQUIRES_HR_REVIEW'/);
 assert.doesNotMatch(review,/WHERE staff_profile_id=\? AND status='active' AND clock_in IS NOT NULL AND clock_out IS NULL/);
 assert.ok(review.indexOf('if(conflicts.length)')<review.indexOf('INSERT INTO hr_attendances'));
 assert.ok(review.indexOf('INSERT INTO hr_attendances')<review.indexOf("'APPROVE',dayCents"));
});
test('R1.3 frontend Refresh uses shared helper; approval performs fresh preflight before POST',()=>{
 const ui=source('../../frontend/src/LeaveRequests.jsx');
 assert.match(ui,/Refresh Leave Requests',RefreshCw,\(\)=>refreshPage\(load,notify\)/);
 const action=ui.split('const act=async(row,decision)=>')[1].split('const cancel=')[0];
 assert.match(action,/const latest=await request\(`\/leave-requests\/\$\{row\.id\}`\)/);
 assert.ok(action.indexOf('const latest=')<action.indexOf('window.confirm'));
 assert.ok(action.indexOf('approvalBlocker(latest.attendanceState)')<action.indexOf("method:'POST'"));
 assert.match(ui,/role="alert"/);
 assert.match(ui,/disabled=\{busy\|\|Boolean\(blocker\)\}/);
 assert.match(ui,/Recheck Attendance/);
});
test('R1.3 protects approved R1.2 spacing, removes CSV Import and preserves Export PDF',()=>{
 const ui=source('../../frontend/src/LeaveRequests.jsx'),css=source('../../frontend/src/LeaveRequests.css');
 assert.match(css,/\.lr-request-details > \.field \+ \.form-two,\.lr-request-details > \.form-two \+ \.field\{margin-top:14px\}/);
 assert.match(ui,/Export PDF A4 Landscape/);
 assert.doesNotMatch(ui,/Import Leave Requests|ImportRequests|CSV Template/);
});
