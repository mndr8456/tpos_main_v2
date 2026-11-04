import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {leavePeriod,dayCents,centsDays,calculateBalanceDelta,reconcileBalance} from '../src/leave-request-engine.js';
const src=file=>readFileSync(new URL(file,import.meta.url),'utf8');
test('calendar days inclusive, without implicit weekends or public holiday exclusion',()=>{
 const result=leavePeriod('2026-11-09','2026-11-10','Full Day',null);
 assert.equal(result.days,'2.00');assert.equal(result.year,2026);assert.deepEqual(result.dates,['2026-11-09','2026-11-10']);
 assert.equal(leavePeriod('2026-11-07','2026-11-09','Full Day',null).days,'3.00');
});
test('half day requires one date, valid period and exact half day',()=>{
 assert.equal(leavePeriod('2026-11-09','2026-11-09','Half Day','First Half').days,'0.50');
 assert.throws(()=>leavePeriod('2026-11-09','2026-11-10','Half Day','Second Half'),/INVALID_HALF_DAY_PERIOD/);
 assert.throws(()=>leavePeriod('2026-11-09','2026-11-09','Full Day','First Half'),/HALF_DAY_PERIOD_NOT_APPLICABLE/);
});
test('invalid ISO date and year rollover fail safely',()=>{
 for(const dates of [['2026-02-29','2026-03-01'],['2026-12-30','2027-01-02'],['2026-11-10','2026-11-09']])
  assert.throws(()=>leavePeriod(dates[0],dates[1],'Full Day',null));
 assert.equal(leavePeriod('2028-02-28','2028-03-01','Full Day',null).days,'3.00');
});
test('new posting retains imported opening Used and Pending, and settles approval atomically in cents',()=>{
 const opening={entitlement_days:'14.00',carried_forward_days:'2.00',adjustment_days:'0.00',expired_days:'0.00',used_days:'3.00',pending_days:'0.00'};
 const submit=calculateBalanceDelta(opening,{pending:dayCents('2.00')});assert.deepEqual(submit,{used:'3.00',pending:'2.00',remaining:'11.00'});
 const approval=calculateBalanceDelta({...opening,used_days:submit.used,pending_days:submit.pending},{used:200,pending:-200});
 assert.deepEqual(approval,{used:'5.00',pending:'0.00',remaining:'11.00'});
 const reject=calculateBalanceDelta({...opening,used_days:submit.used,pending_days:submit.pending},{pending:-200});
 assert.equal(reject.remaining,'13.00');
 assert.deepEqual(reconcileBalance({opening_used_days:'3.00',opening_pending_days:'0.00'},{used_delta:'2.00',pending_delta:'0.00'},{used_days:approval.used,pending_days:approval.pending}),{used:'5.00',pending:'0.00'});
});
test('excess balance, negative used and inconsistent posting are refused',()=>{
 const opening={entitlement_days:'2.00',carried_forward_days:'0.00',adjustment_days:'0.00',expired_days:'0.00',used_days:'1.00',pending_days:'0.00'};
 assert.throws(()=>calculateBalanceDelta(opening,{pending:200}),/INSUFFICIENT_LEAVE_BALANCE/);
 assert.throws(()=>calculateBalanceDelta(opening,{used:-200}),/INSUFFICIENT_LEAVE_BALANCE/);
 assert.throws(()=>reconcileBalance({opening_used_days:'1.00',opening_pending_days:'0.00'},{used_delta:'0.50',pending_delta:'0.00'},{used_days:'1.00',pending_days:'0.00'}),/BALANCE_RECONCILIATION_MISMATCH/);
 assert.equal(centsDays(dayCents('-0.50')),'-0.50');
});
test('migration 030 isolated from 026–029 and contains immutable posting + attendance linkage',()=>{
 const sql=src('../../database/030_tenant_hr_leave_requests.sql');
 for(const name of ['hr_leave_requests','hr_leave_request_attachments','hr_leave_request_audit_logs','hr_leave_balance_openings','hr_leave_request_postings'])assert.match(sql,new RegExp(name));
 assert.match(sql,/ALTER TABLE hr_attendances ADD COLUMN leave_request_id/);
 assert.doesNotMatch(sql,/UPDATE\s+hr_leave_balances\s+SET\s+(?:used_days|pending_days)/i);
 assert.match(sql,/leave_requests\.self/);
});
test('state transitions and permissions use transactions, row locks, and audited writes',()=>{
 const api=src('../src/leave-requests.js'),app=src('../src/app.js'),ui=src('../../frontend/src/LeaveRequests.jsx');
 for(const signal of ['FOR UPDATE','await c.beginTransaction()','await c.commit()','await c.rollback()','LEAVE_REQUEST_DECISION_ALREADY_FINAL','OVERLAPPING_LEAVE_REQUEST','UNCLOSED_CLOCK_PUNCH','EXISTING_ATTENDANCE_REQUIRES_HR_REVIEW','REQUIRED_SUPPORTING_DOCUMENT_MISSING','reconcileBalance('])assert.ok(api.includes(signal),signal);
 assert.match(app,/requestReview\)/);assert.match(ui,/\['Request','Staff','Leave Type','Leave Period','Days','Status','Balance','Attachments','Actions'\]/);
 assert.match(ui,/\['Total Requests'/);assert.match(ui,/Search request, staff, leave type or reason/);
});

test('new tenants provision Leave Requests migration 030 after historical 029',()=>{
 const provision=src('../src/tenants.js');
 assert.match(provision,/executeSchema\(dbName,'029_tenant_hr_leave_balances\.sql'\);\s*await executeSchema\(dbName,'030_tenant_hr_leave_requests\.sql'\)/);
});

test('R1.1 removes import UI, CSV parser, API routes and permission advertisement',()=>{
 const api=src('../src/leave-requests.js');
 const routes=src('../src/app.js');
 const rules=src('../src/leave-request-rules.js');
 const ui=src('../../frontend/src/LeaveRequests.jsx');
 for(const source of [api,routes,rules,ui]){
  assert.doesNotMatch(source,/leave-requests\/import|leave_requests\.import|requestImportPreview|requestImportConfirm|requestCsvTemplate|parseRequestCsv|ImportRequests|canImport/i);
 }
 assert.doesNotMatch(rules,/csvHeaders|csvTemplate|parseRequestCsv/);
 assert.doesNotMatch(ui,/Import CSV|CSV Template|Confirm Import/);
 assert.match(routes,/app\.post\('\/api\/v2\/leave-requests',requestCreate\)/);
 assert.match(routes,/app\.post\('\/api\/v2\/leave-requests\/:id\/review'/);
 assert.match(ui,/Export PDF A4 Landscape/);
});
test('R1.1 security cleanup is limited to import permission and is idempotent',()=>{
 const cleanup=src('../../database/031_tenant_hr_leave_requests_no_import.sql');
 assert.match(cleanup,/START TRANSACTION;[\s\S]*COMMIT;/);
 assert.match(cleanup,/DELETE FROM role_permissions WHERE permission_code = 'leave_requests\.import'/);
 assert.match(cleanup,/DELETE FROM permissions WHERE code = 'leave_requests\.import'/);
 assert.equal((cleanup.match(/\bDELETE FROM\b/g)||[]).length,2);
 assert.doesNotMatch(cleanup,/(?:INSERT|UPDATE|DELETE FROM)\s+hr_leave_(?:requests|balances|request_postings|balance_openings)/i);
 assert.doesNotMatch(cleanup,/\bDROP\b|\bTRUNCATE\b|\bALTER\b/);
 const old=src('../../database/030_tenant_hr_leave_requests.sql');
 assert.match(old,/\('leave_requests\.import','Preview and confirm/); // Historical migration retained exactly.
});
test('R1.1 migration installer is read-only by default, verifies cleanup and provisions new tenants',()=>{
 const installer=src('../scripts/setup-leave-requests-no-import.js');
 const provision=src('../src/tenants.js');
 const pkg=src('../package.json');
 assert.match(installer,/process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/LEAVE_REQUESTS_R1_NOT_INSTALLED/);
 const previousInstaller=src('../scripts/setup-leave-requests.js');
 assert.doesNotMatch(previousInstaller,/\['view','self','manage','approve','import'/);
 assert.match(previousInstaller,/migration 031/);
 assert.match(installer,/if\(apply&&!current\)await executeSchema/);
 assert.match(installer,/LEAVE_REQUEST_IMPORT_PERMISSION_NOT_REMOVED/);
 assert.match(provision,/executeSchema\(dbName,'030_tenant_hr_leave_requests\.sql'\);\s*await executeSchema\(dbName,'031_tenant_hr_leave_requests_no_import\.sql'\)/);
 assert.match(pkg,/db:leave-requests:no-import/);
});
