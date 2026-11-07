import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
test('Company Profile R1 is additive migration 042 after locked Customer Display 041',()=>{
 const tenant=read('backend/src/tenants.js');
 assert.ok(tenant.indexOf("'042_tenant_company_profile.sql'")>tenant.indexOf("'041_tenant_customer_display.sql'"));
 const migration=read('database/042_tenant_company_profile.sql');
 assert.match(migration,/ADD COLUMN address_line3/);
 assert.doesNotMatch(migration,/(?:DROP TABLE|DELETE FROM|TRUNCATE|UPDATE pos_|UPDATE customer_display)/i);
});
test('Company Profile R1 keeps TIN in registrations without modifying SST settings',()=>{
 const code=read('backend/src/company-profile.js');
 assert.match(code,/company_registrations SET ssm_registration_number=\?,ssm_old_registration_number=\?,tin=\?/);
 assert.doesNotMatch(code,/UPDATE company_registrations SET sst_/);
 assert.match(code,/beginTransaction/);assert.match(code,/rollback/);
});
test('Company Profile R1 API is authenticated and permission-gated',()=>{
 const app=read('backend/src/app.js');
 assert.ok(app.includes("app.get('/api/v2/company-profile',authenticate,permitted('company_profile.view')"));
 assert.ok(app.includes("app.put('/api/v2/company-profile',authenticate,permitted('company_profile.manage')"));
 assert.match(app,/company-profile\/audit',authenticate,permitted\('company_profile.audit'\)/);
});
test('Locked CD scripts and receipt template are not altered by phase 1 wiring',()=>{
 const ui=read('frontend/src/CompanyProfile.jsx');
 assert.match(ui,/readOnly/);assert.match(ui,/Address 3/);assert.match(ui,/TIN \(LHDN\)/);
 assert.doesNotMatch(ui,/customer-display\.html|PosCashReceipt|Print Receipt/);
});

test('R1.1 identity edits synchronize central tenant and legal SSM in one transaction',()=>{
 const code=read('backend/src/company-profile.js');
 assert.match(code,/centralPool\(\)\.getConnection\(\)/);
 assert.match(code,/UPDATE \${centralDb}\.tenants SET business_name=\?,business_type=\?/);
 assert.match(code,/registered_name=\?,trading_name=\?,business_type=\?/);
 assert.match(code,/ssm_registration_number=\?,ssm_old_registration_number=\?,tin=\?/);
 assert.match(code,/COMPANY_IDENTITY_OUT_OF_SYNC/);
 assert.match(code,/await conn\.commit\(\)/);
 assert.match(code,/await conn\.rollback\(\)/);
 const ui=read('frontend/src/CompanyProfile.jsx');
 assert.match(ui,/identityFields\.map/);
 assert.match(ui,/businessTypes\.map/);
 assert.match(ui,/readOnly=\{!canManage\|\|busy\}/);
});
