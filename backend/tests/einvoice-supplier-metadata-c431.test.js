import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getStateCodeCandidatesC431,stateCodeMatchesC431,MYINVOIS_STATES_C431} from '../src/einvoice-supplier-state-c431.js';
const src=filename=>readFileSync(new URL(filename,import.meta.url),'utf8');
test('R3.1 Selangor maps to official MyInvois 10 without mutating original state',()=>{
 assert.deepEqual(getStateCodeCandidatesC431('SELANGOR','MY'),['10']);
 assert.equal(stateCodeMatchesC431('SELANGOR','MY','10'),true);
 assert.equal(stateCodeMatchesC431('SELANGOR','MY','11'),false);
});
test('R3.1 rejects ambiguous/unrecognized Malaysian state and never guesses a code',()=>{
 assert.deepEqual(getStateCodeCandidatesC431('UNKNOWN STATE','MY'),[]);
 assert.equal(stateCodeMatchesC431('UNKNOWN STATE','MY','10'),false);
 assert.equal(MYINVOIS_STATES_C431.length,16);
 assert.deepEqual(getStateCodeCandidatesC431('Kuala Lumpur','MY'),['14']);
 assert.deepEqual(getStateCodeCandidatesC431('SELANGOR','SG'),[]);
});
test('R3.1 metadata endpoints are authentication+permission guarded and separately routed',()=>{
 const app=src('../src/app.js');
 assert.match(app,/app\.get\('\/api\/v2\/company-profile\/einvoice-supplier',authenticate,permitted\('company_profile\.view'\),getSupplierMetadataC431\)/);
 assert.match(app,/app\.put\('\/api\/v2\/company-profile\/einvoice-supplier',authenticate,permitted\('company_profile\.manage'\),saveSupplierMetadataC431\)/);
 const code=src('../src/einvoice-supplier-metadata-c431.js');
 assert.match(code,/\['OWNER','ADMIN'\]/);
 assert.match(code,/z\.string\(\)\.regex\(\/\^\\d\{5\}\$\//);
 assert.match(code,/stateCodeMatchesC431\(before\.state,before\.country,input\.stateCode\)/);
});
test('R3.1 issuer source only uses confirmed supplier values and retains fail-closed R3',()=>{
 const code=src('../src/einvoice-ubl-invoice-c43-r3.js');
 assert.match(code,/p\.einvoice_state_code AS state/);
 assert.match(code,/p\.msic_code AS msicCode/);
 assert.match(code,/p\.business_activity_description AS businessActivityDescription/);
 assert.doesNotMatch(code,/COLUMN_NAME IN \('msic_code'/);
 assert.match(code,/SOURCE_DATA_INCOMPLETE/);
 assert.match(code,/submissionEnabled:false/);
});
test('R3.1 uses additive columns, separate installer and preserves Company Profile identity transaction',()=>{
 const schema=src('../../database/051_tenant_einvoice_supplier_metadata.sql');
 assert.match(schema,/ADD COLUMN einvoice_state_code CHAR\(2\)/);
 assert.match(schema,/ADD COLUMN msic_code CHAR\(5\)/);
 assert.match(schema,/ADD COLUMN business_activity_description VARCHAR\(300\)/);
 assert.doesNotMatch(schema,/\b(?:DROP|TRUNCATE|DELETE FROM)\b/i);
 const tenants=src('../src/tenants.js');
 assert.ok(tenants.indexOf('050_tenant_pos_reduction_settlement.sql')<tenants.indexOf('051_tenant_einvoice_supplier_metadata.sql'));
 const installer=src('../scripts/setup-einvoice-supplier-metadata.js');
 assert.match(installer,/const apply=process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/s\.missingColumns\.includes\(name\)/);
 const company=src('../src/company-profile.js');
 assert.match(company,/UPDATE \$\{centralDb\}\.tenants SET business_name/);
 assert.doesNotMatch(company,/msic_code/);
});
test('R3.1 has separate UI form with dedicated save and no invoice submission',()=>{
 const ui=src('../../frontend/src/CompanyProfile.jsx');
 assert.match(ui,/e-Invoice Supplier Metadata/);
 assert.match(ui,/saveSupplier/);
 assert.match(ui,/company-profile\/einvoice-supplier/);
 assert.match(ui,/Save Supplier Metadata/);
 assert.doesNotMatch(ui,/submit.*MyInvois/i);
});
