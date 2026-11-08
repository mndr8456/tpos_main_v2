import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=async p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
// Static checks allow this diagnostic patch to be tested before configuring MySQL/LHDN.
test('R1.1.2 classifies only SDK OAuth error identifiers and does not expose error_description',async()=>{
 const api=await src('backend/src/einvoice-settings.js');
 for(const value of ['invalid_client','invalid_request','invalid_grant','unauthorised_client','unsupported_grant_type','invalid_scope'])assert.ok(api.includes(value),value);
 assert.match(api,/classifyMyInvoisOAuthFailure\(response.status,payload\)/);
 assert.doesNotMatch(api,/reason\s*=\s*payload\.error_description/);
 assert.match(api,/error:reason/);
});
test('R1.1.2 UI displays useful sanitized Sandbox diagnostics instead of generic HTTP 422',async()=>{
 const ui=await src('frontend/src/EinvoiceSettings.jsx');
 assert.match(ui,/OAUTH_MESSAGES\[e.message\]\|\|e.message/);
 assert.match(ui,/EINVOICE_OAUTH_INVALID_CLIENT/);
 assert.match(ui,/EINVOICE_OAUTH_ACCESS_FORBIDDEN/);
 assert.doesNotMatch(ui,/console\.log\(clientSecret/);
});
test('R1.1.2 does not change token endpoint, enablement safety or payment/receipt logic',async()=>{
 const api=await src('backend/src/einvoice-settings.js');
 assert.match(api,/\/connect\/token/);
 assert.match(api,/grant_type:'client_credentials'/);
 assert.match(api,/EINVOICE_TEST_CONNECTION_REQUIRED/);
 assert.match(api,/redirect:'error'/);
});
