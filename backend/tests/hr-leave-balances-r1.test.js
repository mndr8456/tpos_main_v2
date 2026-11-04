import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const code=async()=>({sql:await read('database/029_tenant_hr_leave_balances.sql'),api:await read('backend/src/leave-balances.js'),rules:await read('backend/src/leave-balance-rules.js'),app:await read('backend/src/app.js'),ui:await read('frontend/src/LeaveBalances.jsx')});
test('R1 tenant 029 has unique staff, type and year plus generated balance and append-only audit',async()=>{
 const {sql}=await code();
 for(const col of ['staff_profile_id','leave_type_id','balance_year','entitlement_days','carried_forward_days','adjustment_days','used_days','pending_days','expired_days','remaining_days','adjustment_notes','status'])assert.match(sql,new RegExp(`\\b${col}\\b`));
 assert.match(sql,/UNIQUE KEY uq_hr_balance_year\(staff_profile_id,leave_type_id,balance_year\)/);
 assert.match(sql,/remaining_days DECIMAL\(9,2\) GENERATED ALWAYS AS/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS hr_leave_balance_audit_logs/);
 assert.match(sql,/previous_data JSON NULL/);assert.match(sql,/next_data JSON NULL/);
 assert.doesNotMatch(sql,/\bDROP\s+|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});
test('R1 no request posting or attendance mutation and recalculate is locked',async()=>{
 const {sql,api,app,ui}=await code();
 for(const file of [sql,api])assert.doesNotMatch(file,/UPDATE\s+hr_attendances|INSERT\s+INTO\s+hr_attendances|UPDATE\s+leave_requests|UPDATE\s+hr_leave_requests/i);
 assert.doesNotMatch(app,/\/leave-balances\/:id\/recalculate/);
 assert.match(ui,/Recalculate \(available after Leave Requests integration\)/);
 assert.match(ui,/RefreshCw,\(\)=>\{\},true/);
});
test('R1 permissions restricted to Owner Admin HR and Manager view',async()=>{
 const {sql,api,app}=await code();
 assert.match(sql,/r\.code IN \('OWNER','ADMIN','HR'\)/);
 assert.match(sql,/r\.id,'leave_balances\.view'[\s\S]+r\.code='MANAGER'/);
 assert.match(api,/new Set\(\['OWNER','ADMIN','HR'\]\)/);
 for(const p of ['view','manage','generate','import','audit'])assert.match(app,new RegExp(`leave_balances\\.${p}`));
 assert.match(sql,/leave_balances\.export/);
});
test('R1 CSV preview is read-only and Confirm is transactional with revalidation',async()=>{
 const {api,rules}=await code();
 const preview=api.slice(api.indexOf('export async function balanceImportPreview'),api.indexOf('export async function balanceImportConfirm'));
 assert.doesNotMatch(preview,/INSERT INTO|UPDATE hr_leave_balances/);
 assert.match(api,/await transaction\(req\.auth\.pool,async c=>\{const review=await reviewImport\(c,csv\)/);
 assert.match(api,/if\(!review\.canConfirm\)fail\('IMPORT_PREVIEW_HAS_ERRORS'/);
 assert.match(rules,/CSV_MAX_1000_ROWS/);
 assert.match(rules,/Duplicate Staff \/ Leave Type \/ Year in file/);
});
test('R1 accurate two decimal quantities and half-day steps without float multiplication',async()=>{
 const text=await read('backend/src/leave-balance-rules.js');
 const portable=text.replace("import {z} from 'zod';",'const z={};');
 const module=await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(portable)}`);
 assert.equal(module.daysToHundredths('14.00'),1400);
 assert.equal(module.daysToHundredths('0.50'),50);
 assert.equal(module.daysToHundredths('0.5'),50);
 assert.equal(module.daysToHundredths('-0.50',{negative:true}),-50);
 assert.equal(module.hundredthsToDays(1200),'12.00');
 assert.throws(()=>module.daysToHundredths('0.25'),/DAYS_MUST_BE_IN_HALF_DAY_STEPS/);
 assert.throws(()=>module.daysToHundredths('1.001'),/INVALID_DAY_DECIMAL/);
 assert.throws(()=>module.daysToHundredths('-1.00'),/NEGATIVE_DAYS_NOT_ALLOWED/);
});
test('R1 Generate inserts only missing active staff and active Leave Types with audit',async()=>{
 const {api}=await code();
 assert.match(api,/INSERT IGNORE INTO hr_leave_balances/);
 assert.match(api,/u\.status='ACTIVE'/);
 assert.match(api,/lt\.status='active'/);
 assert.match(api,/if\(saved\.affectedRows===1\)/);
 assert.match(api,/await audit\(c,req,saved\.insertId,'GENERATE'/);
});
test('R1 UI has six stats, twelve columns, form sections, CSV styled choices and landscape PDF',async()=>{
 const {ui}=await code();const pdf=await read('frontend/src/leave-balances-pdf.js');const css=await read('frontend/src/LeaveBalances.css');
 for(const term of ['Total Records','Entitlement','Carry Forward','Used','Pending','Remaining','Staff and Leave Type','Balance Calculation','Adjustment Notes & Record Status','CSV Template','Choose File','Preview','Confirm Import','Generate Leave Balances','Activity Log'])assert.ok(ui.includes(term),term);
 assert.match(ui,/refreshPage\(load,notify\)/);
 assert.match(pdf,/widthPt:841\.89,heightPt:595\.276/);
 assert.match(pdf,/Leave Balances\.pdf/);
 assert.match(css,/\.lb-filter select,\.lb-filter \.lb-search/);
});
test('R1 new tenant migration and independent installer are read-only by default',async()=>{
 const tenant=await read('backend/src/tenants.js'),installer=await read('backend/scripts/setup-leave-balances.js'),packageJson=await read('backend/package.json'),app=await read('frontend/src/App.jsx');
 assert.match(tenant,/028_tenant_hr_leave_types\.sql'[\s\S]*029_tenant_hr_leave_balances\.sql'/);
 assert.match(installer,/process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/if\(apply&&!current\)await executeSchema/);
 assert.match(packageJson,/db:leave-balances/);
 assert.match(app,/page==='leave-balances'&&canViewLeaveBalances/);
 assert.match(app,/id:'leave-balances',label:'Leave Balances'/);
});
