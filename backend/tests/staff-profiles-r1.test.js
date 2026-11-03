import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {staffFormHtml,blankStaffPrintFields} from '../../frontend/src/staff-print.js';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const file=p=>readFileSync(resolve(root,p),'utf8');

test('Staff R1 SQL is tenant-isolated and links existing Users without altering earlier schemas',()=>{
 const sql=file('database/025_tenant_staff_profiles.sql');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS staff_profiles/);
 assert.match(sql,/FOREIGN KEY\(user_id\) REFERENCES users\(id\)/);
 assert.match(sql,/UNIQUE KEY uq_staff_profile_user/);
 assert.match(sql,/CHECK \(ic_no IS NULL OR ic_no REGEXP '\^\[0-9\]\{12\}\$'\)/);
 assert.match(sql,/staff_profile_audit_logs/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE)\s+TABLE/i);
});
test('Role grants separate manage/print/import HR from manager view and own profile',()=>{
 const sql=file('database/025_tenant_staff_profiles.sql');
 assert.match(sql,/role_permissions/);
 assert.match(sql,/\('OWNER','ADMIN','HR'\)/);
 assert.match(sql,/r\.code='MANAGER'/);
 assert.match(sql,/r\.code IN \('MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'\)/);
 const js=file('backend/src/staff-profiles.js');
 assert.match(js,/function safeStaff\(/);
 assert.match(js,/result\[key\]=row\[key\]\?'\*\*\*\*\*\*\*\*\*\*\*\*'/);
 assert.match(js,/const selfFields=\[/);
 assert.match(js,/selfBody\.parse\(req\.body\)/);
 assert.match(js,/checkAccess\(req,'manage'\)/);
});
test('Staff R1 uses same authenticated multi-tenant API and no unguarded print endpoint',()=>{
 const app=file('backend/src/app.js');
 assert.match(app,/staff-profiles\/me',authenticate,permitted\('staff_profiles\.self'\)/);
 assert.match(app,/staff-profiles\/import\/confirm',authenticate,permitted\('staff_profiles\.import'\)/);
 assert.match(app,/staff-profiles\/:id\/image',authenticate,staffImage/);
 assert.match(app,/staff-profiles\/:id',authenticate,getStaff/);
 assert.match(file('backend/src/tenants.js'),/025_tenant_staff_profiles\.sql/);
 assert.match(file('backend/package.json'),/db:staff-profiles/);
});
test('Staff No supports short business prefix and backend-generated running number',()=>{
 const api=file('backend/src/staff-profiles.js');
 assert.match(api,/function autoPrefix\(/);
 assert.match(api,/nextStaffNo\(/);
 assert.match(api,/staffNextNumber\(/);
 assert.match(api,/staff_prefix:z\.string\(\)/);
 assert.match(api,/hourlyRate\(/);
 assert.match(api,/days<=0\|\|hours<=0/);
});
test('Print Blank Staff Form and Print Form Staff have exact same eight sections',()=>{
 const sections=blankStaffPrintFields.map(([name])=>name);
 assert.deepEqual(sections,['User & Staff Identity','Residential Address','Emergency Contact','Statutory Information','Bank Information','Employment Information','Salary & Working Standard','Notes']);
 const blank=staffFormHtml(null,{blank:true,businessName:'Example Sdn Bhd'});
 const actual=staffFormHtml({staff_no:'SAT-0001',full_name:'Test Staff',ic_no:'010203123456',bank_account_no:'1234567890'}, {businessName:'Example Sdn Bhd'});
 for(const name of sections){assert.ok(blank.includes(name.replaceAll('&','&amp;')),`blank missing ${name}`);assert.ok(actual.includes(name.replaceAll('&','&amp;')),`filled missing ${name}`);}
 assert.match(blank,/@page\{size:A4 portrait/);
 assert.match(blank,/BLANK STAFF FORM/);
 assert.match(actual,/STAFF PROFILE FORM/);
 assert.doesNotMatch(blank,/010203123456|1234567890|SAT-0001|Test Staff/);
 assert.match(actual,/010203123456/);
 assert.match(blank,/>PHOTO</);
 const mixed=staffFormHtml({full_name:'PRIVATE NAME',ic_no:'990101105555',bank_account_no:'998877'}, {blank:true,businessName:'Example Sdn Bhd'});
 assert.doesNotMatch(mixed,/PRIVATE NAME|990101105555|998877/);
 assert.doesNotMatch(blank,/<table\b/);
});
test('Blank form escapes content, never reads API, and does not persist any staff record',()=>{
 const html=staffFormHtml(null,{blank:true,businessName:'<img src=x onerror=alert(1)>'});
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.doesNotMatch(html,/<img src=x onerror/);
 const code=file('frontend/src/staff-print.js');
 assert.doesNotMatch(code,/\bfetch\(/);
 assert.doesNotMatch(code,/\brequest\(/);
 const ui=file('frontend/src/StaffProfiles.jsx');
 assert.match(ui,/Print Blank Staff Form \(A4\)/);
 assert.match(ui,/blank:true,businessName:meta\.businessName/);
 assert.match(ui,/canPrint&&action\('Print Blank Staff Form/);
});
test('Staff UI places image at top-right and uses masked IC, statutory, and bank numbers',()=>{
 const ui=file('frontend/src/StaffProfiles.jsx');
 assert.match(ui,/sp-identity/);
 assert.match(ui,/sp-photo/);
 assert.match(ui,/sp-password-input/);
 assert.match(ui,/canRevealSensitive&&inspectKeys.includes\(name\)/);
 assert.match(ui,/No\. IC \(12 digits\)/);
 assert.match(ui,/Select Employment/);
 assert.match(ui,/disabled=\{disabled\|\|name==='overtime_rate_per_hour'\}/);
 assert.match(ui,/\{busy\?'Saving\.\.\.':'Save'\}/);
 assert.doesNotMatch(ui,/Create Staff Profile<\/button>/);
});
