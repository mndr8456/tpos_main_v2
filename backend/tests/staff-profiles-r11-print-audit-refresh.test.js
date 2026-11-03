import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {staffFormHtml,staffPrintDate} from '../../frontend/src/staff-print.js';
import {formatStaffAuditDetails} from '../../frontend/src/staff-audit-display.js';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const file=p=>readFileSync(resolve(root,p),'utf8');

test('Staff R1.1 A4 filled form shows DD/MM/YYYY for every employment date',()=>{
 const html=staffFormHtml({staff_no:'SAT-0001',full_name:'Example Staff',
   join_date:'2012-01-01',confirmation_date:'2012/03/30',resignation_date:'2015-09-16T00:00:00.000Z'},
  {businessName:'Example Business'});
 for(const expected of ['01/01/2012','30/03/2012','16/09/2015'])assert.ok(html.includes(expected),expected);
 assert.doesNotMatch(html,/2012-01-01|2012\/03\/30|2015-09-16T/);
 assert.equal(staffPrintDate('2024-02-29'),'29/02/2024');
 assert.equal(staffPrintDate('2024-02-30'),'2024-02-30');
 assert.equal(staffPrintDate(''),'');
 assert.equal(staffPrintDate(null),'');
});
test('Staff R1.1 A4 blank form removes Blank from visible header and document title',()=>{
 const html=staffFormHtml({staff_no:'SECRET-1234',ic_no:'010101123456'}, {blank:true,businessName:'Example Business'});
 assert.match(html,/<h1>STAFF FORM<\/h1>/);
 assert.match(html,/<title>Staff Form<\/title>/);
 assert.doesNotMatch(html,/\bBLANK\b|\bBlank\b/);
 assert.doesNotMatch(html,/SECRET-1234|010101123456/);
 assert.match(html,/@page\{size:A4 portrait/);
 assert.match(staffFormHtml({staff_no:'SAT-0001'},{businessName:'Example Business'}),/STAFF PROFILE FORM/);
});
test('Staff R1.1 audit displays human readable actions and group names, not database JSON',()=>{
 const example=JSON.stringify({fields:['address_line_1','address_line_2','employment_status','bank_account_name','notes'],sensitiveChanged:true});
 const text=formatStaffAuditDetails('UPDATE',example);
 assert.match(text,/Staff profile saved/);
 for(const label of ['Residential Address','Bank Information','Employment Information','Notes'])assert.ok(text.includes(label));
 assert.match(text,/Sensitive information included/);
 assert.doesNotMatch(text,/address_line_1|fields|sensitiveChanged|[{\[}]/);
 assert.equal(formatStaffAuditDetails('IMAGE_UPDATE','{"fields":[],"sensitiveChanged":false}'),'Staff image updated.');
 assert.equal(formatStaffAuditDetails('IMAGE_REMOVED',{}),'Staff image removed.');
 assert.equal(formatStaffAuditDetails('STATUS_CHANGE',{fields:['status']}),'Staff record status updated. Sections submitted: Employment Information.');
 assert.equal(formatStaffAuditDetails('CREATE','not-json'),'Staff profile created.');
 assert.equal(formatStaffAuditDetails('UPDATE',{fields:['ic_no','bank_account_no'],sensitiveChanged:true}),'Staff profile saved. Sections submitted: User & Staff Identity, Bank Information. Sensitive information included; values are hidden.');
 assert.doesNotMatch(formatStaffAuditDetails('UPDATE',{fields:['SECRET-987654321'],sensitiveChanged:false}),/SECRET-987654321/);
});
test('Staff R1.2 Refresh re-reads API data silently, matching other pages',()=>{
 const ui=file('frontend/src/StaffProfiles.jsx');
 assert.match(ui,/import \{refreshPage\} from '\.\/refresh-page\.js'/);
 assert.match(ui,/const manualRefresh=\(\)=>refreshPage\(load,notify\)/);
 assert.match(ui,/action\(refreshing\?'Refreshing Staff Profiles':'Refresh Staff Profiles',RefreshCw,manualRefresh,refreshing\)/);
 assert.match(ui,/setMeta\(m\);setStaff\(s\.staff\|\|\[\]\);setOwn\(o\.staff\|\|null\)/);
 assert.doesNotMatch(ui,/Staff Profiles refreshed\.|Last refreshed:|lastRefreshed|setLastRefreshed|sp-last-refreshed/);
 const helper=file('frontend/src/refresh-page.js');
 assert.match(helper,/notify\(''\)/);
 assert.match(helper,/return load\(\)/);
 const api=file('frontend/src/api.js');
 assert.match(api,/cache:\(options\.method\|\|'GET'\)/);
 assert.match(api,/\?'no-store'/);
});
test('Staff R1.1 audit UI no longer prints raw JSON and keeps original tenant audit storage unchanged',()=>{
 const ui=file('frontend/src/StaffProfiles.jsx');
 assert.match(ui,/formatStaffAuditDetails\(l\.action_type,l\.details\)/);
 assert.doesNotMatch(ui,/JSON\.stringify\(l\.details\)/);
 assert.equal(file('backend/src/staff-profiles.js').includes('INSERT INTO staff_profile_audit_logs'),true);
 assert.match(file('frontend/src/StaffProfiles.css'),/sp-audit-details/);
});
