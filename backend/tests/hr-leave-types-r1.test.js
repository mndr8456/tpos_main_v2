import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=async path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
test('R1 migration 028 has V1 15 policy fields, isolated tenant catalog and append-only audit',async()=>{
 const sql=await source('database/028_tenant_hr_leave_types.sql');
 for(const field of ['leave_code','leave_name','description','attendance_status','default_entitlement_days','is_paid','requires_attachment','allow_half_day','allow_carry_forward','max_carry_forward_days','max_days_per_request','minimum_service_months','gender_restriction','sort_order','status'])assert.match(sql,new RegExp(`\\b${field}\\b`));
 assert.match(sql,/CREATE TABLE IF NOT EXISTS hr_leave_types/);assert.match(sql,/CREATE TABLE IF NOT EXISTS hr_leave_type_audit_logs/);
 assert.match(sql,/UNIQUE KEY uq_hr_leave_code\(leave_code\)/);
 assert.doesNotMatch(sql,/\bDROP\s+|\bTRUNCATE\s+|\bDELETE\s+FROM\b/i);
});
test('R1 V1 AL/MC/UL policies and inactive isolated EL are seeded without overwriting old data',async()=>{
 const sql=await source('database/028_tenant_hr_leave_types.sql');
 assert.match(sql,/INSERT IGNORE INTO hr_leave_types/);
 for(const code of ['AL','MC','UL','EL'])assert.match(sql,new RegExp(`\\('${code}'`));
 assert.match(sql,/\('EL',.*,'inactive'\)/);assert.match(sql,/\('AL',[^;]+?,14\.00,1,0,1,1,7\.00/);
});
test('R1 role grants are restricted to Owner Admin HR; Manager receives view only',async()=>{
 const sql=await source('database/028_tenant_hr_leave_types.sql');const backend=await source('backend/src/leave-types.js');
 assert.match(sql,/r\.code IN \('OWNER','ADMIN','HR'\)/);
 assert.match(sql,/r\.id,'leave_types\.view'[\s\S]+r\.code='MANAGER'/);
 assert.match(backend,/const adminRoles=new Set\(\['OWNER','ADMIN','HR'\]\)/);
 assert.match(backend,/action==='view'\? !roles\.has\(role\):!adminRoles\.has\(role\)/);
});
test('R1 API routes are permission guarded for all operations and use audit',async()=>{
 const app=await source('backend/src/app.js');const backend=await source('backend/src/leave-types.js');
 for(const perm of ['view','manage','import','audit'])assert.match(app,new RegExp(`leave_types\\.${perm}`));
 assert.match(await source('database/028_tenant_hr_leave_types.sql'),/leave_types\.export/);
 for(const route of ['/leave-types/meta','/leave-types/import/preview','/leave-types/import/confirm','/leave-types/:id/approval']){
  if(route.endsWith('/approval'))assert.doesNotMatch(app,/\/leave-types\/:id\/approval/);
  else assert.ok(app.includes(route));
 }
 assert.match(backend,/await audit\(conn,req/);
 assert.match(backend,/UPDATE hr_leave_types SET status=\?/);
 assert.doesNotMatch(backend,/DELETE FROM hr_leave_types/);
});
test('R1 robust CSV parsing uses 15 V1 headers, BOM, escaped quotes and max 1000 rows',async()=>{
 const rules=await source('backend/src/leave-type-rules.js');
 for(const name of ['leave_code','attendance_status','max_days_per_request','gender_restriction'])assert.ok(rules.includes(name));
 assert.match(rules,/replace\(\/\^\\uFEFF\/,'\'\)/);assert.match(rules,/rows\.length>1001/);
 assert.match(rules,/Malformed CSV quotation/);assert.match(rules,/Duplicate Leave Code in this file/);
});
test('R1 CSV Preview does not write; Confirm uses tenant transaction and rejects existing Leave Codes',async()=>{
 const backend=await source('backend/src/leave-types.js');
 const preview=backend.slice(backend.indexOf('export async function leaveTypeImportPreview'),backend.indexOf('export async function leaveTypeImportConfirm'));
 assert.doesNotMatch(preview,/INSERT INTO|UPDATE hr_leave_types|beginTransaction/);
 assert.match(backend,/await transaction\(req\.auth\.pool,async conn=>/);
 assert.match(backend,/UNIQUE|ER_DUP_ENTRY/);
 assert.match(backend,/Leave Code already exists in this tenant/);
});
test('R1 importer exposes template Choose File Preview Confirm in matching button styles',async()=>{
 const ui=await source('frontend/src/LeaveTypes.jsx'),css=await source('frontend/src/LeaveTypes.css');
 for(const label of ['CSV Template','Choose File','Preview','Confirm Import'])assert.ok(ui.includes(label));
 assert.match(ui,/lt-file-btn/);assert.match(css,/\.lt-import-actions \.lt-file-btn/);
 assert.match(ui,/preview\?\.canConfirm/);
});
test('R1 UI has 4 stats 6 columns, 3 sections, silently refreshes, icon actions and permission guard',async()=>{
 const ui=await source('frontend/src/LeaveTypes.jsx');
 for(const label of ['Total Records','Active','Paid Leave','Attachment Required','Leave Type Information','Leave Entitlement & Eligibility Rules','Record Settings & Description','Attendance Status','Entitlement','Rules','Actions'])assert.ok(ui.includes(label));
 assert.match(ui,/refreshPage\(load,notify\)/);assert.match(ui,/canManage&&icon\('Edit Leave Type'/);
 assert.match(ui,/canAudit&&icon\('Leave Type Activity Log'/);assert.match(ui,/\.sort\(\(a,b\)=>Number\(a\.sort_order\)/);
});
test('R1 A4 landscape PDF follows visible filter, uses business name and excludes staff private info',async()=>{
 const pdf=await source('frontend/src/leave-types-pdf.js'),ui=await source('frontend/src/LeaveTypes.jsx');
 assert.match(pdf,/widthPt:841\.89,heightPt:595\.276/);
 assert.match(pdf,/name='Leave Types\.pdf'/);assert.match(ui,/createLeaveTypesPdf\(visible/);
 assert.doesNotMatch(pdf,/ic_no|bank_account_no|epf_no|socso_no|basic_salary/);
});
test('R1 new tenant provisioning and installer preserve migrations 025-027',async()=>{
 const tenants=await source('backend/src/tenants.js'),installer=await source('backend/scripts/setup-leave-types.js'),packageFile=await source('backend/package.json');
 assert.match(tenants,/025_tenant_staff_profiles\.sql'[\s\S]*026_tenant_hr_attendances\.sql'[\s\S]*027_tenant_attendance_clock\.sql'[\s\S]*028_tenant_hr_leave_types\.sql'/);
 assert.match(installer,/process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/if\(apply&&!current\)/);
 assert.match(packageFile,/"db:leave-types"/);
});
test('R1 navigation is permission-scoped and follows Attendance Clock',async()=>{
 const app=await source('frontend/src/App.jsx');
 assert.match(app,/canViewLeaveTypes=profile\.user\.permissions\.includes\('leave_types\.view'\)/);
 assert.match(app,/\{id:'attendance-clock'[^\n]+\n   \{id:'leave-types'/);
 assert.match(app,/page==='leave-types'&&canViewLeaveTypes\?<LeaveTypes/);
});
test('R1 Activity Log shows readable descriptions; no raw audit JSON on UI',async()=>{
 const ui=await source('frontend/src/LeaveTypes.jsx');
 assert.match(ui,/Leave Type settings updated\./);
 assert.match(ui,/Leave Type imported from CSV\./);
 assert.doesNotMatch(ui,/JSON\.stringify\(log\.details\)/);
});
