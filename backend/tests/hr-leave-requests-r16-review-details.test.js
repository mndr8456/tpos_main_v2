// R1.6 regression: professional approval/rejection modal and mandatory audited details.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validReviewDetails,formatLeaveAuditDetails} from '../../frontend/src/leave-request-review.js';
const source=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('R1.6: only meaningful 4..5000 character review details enable confirmation',()=>{
 for(const value of ['', ' ', '\n\t ', 'abc', ' abc ', null, 123, 'a'.repeat(5001)])
  assert.equal(validReviewDetails(value),false,String(value));
 for(const value of ['Approved after review', '  Medical certificate verified  ', 'a'.repeat(5000)])
  assert.equal(validReviewDetails(value),true);
});
test('R1.6: frontend uses one app-owned accessible modal for approval and rejection',()=>{
 const ui=source('../../frontend/src/LeaveRequests.jsx');
 assert.match(ui,/function ReviewDecisionModal\(/);
 assert.match(ui,/role="dialog" aria-modal="true" aria-labelledby="lr-review-title"/);
 assert.match(ui,/approve\?'Approval Details \*':'Rejection Details \*'/);
 assert.match(ui,/disabled=\{busy\|\|!allowed\}/);
 assert.match(ui,/rows=\{4\} required minLength=\{4\} maxLength=\{5000\}/);
 assert.match(ui,/onDetails\(e.target.value\)/);
 assert.doesNotMatch(ui,/window\.confirm\(|window\.prompt\('Review Remarks/);
 assert.match(ui,/approve\?'Approve':'Reject'/);
});
test('R1.6: both approval and rejection require server-side remarks, including direct API calls',()=>{
 const api=source('../src/leave-requests.js');
 const review=api.split('export async function requestReview')[1].split('export async function requestCancel')[0];
 assert.match(review,/access\(req,'approve'\)/);
 assert.match(review,/remarks:z\.string\(\)\.trim\(\)\.min\(4\)\.max\(5000\)/);
 assert.doesNotMatch(review,/remarks:z\.string\(\).*\.default\(''\)/);
 assert.match(review,/request_status!=='Pending'/);
 assert.match(review,/review_remarks=\?/);
 assert.match(review,/await note\(c,req,requestId,data.decision==='Approved'\?'APPROVE':'REJECT',\{remarks:data.remarks/);
 assert.match(review,/allow_schedule_conversion:z\.boolean\(\)\.optional\(\)\.default\(false\)/);
});
test('R1.6: confirmation runs authenticated preflight, then sends trimmed details and rechecks transactionally',()=>{
 const ui=source('../../frontend/src/LeaveRequests.jsx');
 const preflight=ui.split('const openReview=async(row,decision)=>')[1].split('const submitReview=')[0];
 const submit=ui.split('const submitReview=async()=>')[1].split('const cancel=')[0];
 assert.match(preflight,/latest.item.request_status!=='Pending'/);
 assert.match(preflight,/approvalBlocker\(latest.attendanceState\)/);
 assert.match(preflight,/setReview\(\{row:latest.item,decision,remarks:''/);
 assert.match(submit,/!validReviewDetails\(review.remarks\)/);
 assert.match(submit,/remarks:remarks.trim\(\)/);
 assert.match(submit,/allow_schedule_conversion:decision==='Approved'&&attendanceState==='SCHEDULE_ONLY'/);
 assert.match(submit,/request\(`\/leave-requests\/\$\{row\.id\}\/review`,\{method:'POST'/);
 assert.doesNotMatch(submit,/window\.confirm\(/);
});
test('R1.6: new approval and rejection details are shown in audit from structured JSON',()=>{
 for(const raw of [
  {remarks:'Approved for medical recovery',reviewedScheduleConversion:true},
  JSON.stringify({remarks:'Approved for medical recovery',reviewedScheduleConversion:true})
 ]){
  assert.match(formatLeaveAuditDetails('APPROVE',raw),/Approved for medical recovery/);
  assert.match(formatLeaveAuditDetails('APPROVE',raw),/Scheduled Attendance marked as Leave/);
 }
 assert.equal(formatLeaveAuditDetails('REJECT',{remarks:'Supporting document not provided'}),'Supporting document not provided');
 assert.equal(formatLeaveAuditDetails('CANCEL',{reason:'Request withdrawn'}),'Request withdrawn');
});
test('R1.6: old audit logs are not fabricated, and Submit/Edit show human readable details',()=>{
 assert.match(formatLeaveAuditDetails('APPROVE',{remarks:''}),/No approval details recorded \(earlier version\)/);
 assert.match(formatLeaveAuditDetails('REJECT',null),/No rejection details recorded \(earlier version\)/);
 assert.equal(formatLeaveAuditDetails('SUBMIT',JSON.stringify({year:2026,days:1,paid:0})), 'Submitted 1.00 day for 2026.');
 assert.equal(formatLeaveAuditDetails('EDIT',{before:{days:1},after:{days:2}}),'Updated requested days: 1.00 → 2.00.');
 assert.equal(formatLeaveAuditDetails('EDIT','not json'),'Leave request updated.');
});
test('R1.6: Activity Log renders readable details and multiline text instead of raw JSON',()=>{
 const ui=source('../../frontend/src/LeaveRequests.jsx');
 const css=source('../../frontend/src/LeaveRequests.css');
 assert.match(ui,/formatLeaveAuditDetails\(l.action_type,l.details\)/);
 assert.match(css,/\.lr-audit-details\{[^}]*white-space:pre-wrap/);
 assert.match(css,/\.lr-review-dialog/);
 assert.match(ui,/Saved in Activity Log/);
});
test('R1.6: all OWNER / ADMIN / HR keep Approve/Reject, with historical corrections intact',()=>{
 const ui=source('../../frontend/src/LeaveRequests.jsx');
 assert.match(ui,/\['OWNER','ADMIN','HR'\].*leave_requests.approve/);
 assert.match(ui,/r.request_status==='Pending'&&/);
 assert.match(ui,/onReview=\{decision=>openReview\(view.item,decision\)\}/);
 assert.doesNotMatch(ui,/Import Leave Requests|CSV Template/);
 assert.match(ui,/Export PDF A4 Landscape/);
 assert.match(source('../../frontend/src/LeaveRequests.css'),/\.lr-request-details > \.field \+ \.form-two/);
});
