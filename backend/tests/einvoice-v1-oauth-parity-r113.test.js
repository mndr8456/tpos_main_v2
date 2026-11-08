import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async p=>readFile(new URL('../../'+p,import.meta.url),'utf8');
test('EINV R1.1.3 request matches V1 OAuth body and Accept header',async()=>{
 const current=await load('backend/src/einvoice-settings.js');
 assert.match(current,/grant_type:'client_credentials',scope:'InvoicingAPI'/);
 assert.match(current,/headers:\{'Content-Type':'application\/x-www-form-urlencoded',Accept:'application\/json'\}/);
 assert.match(current,/\$\{BASE_URLS\[environment\]\}\/connect\/token/);
 assert.match(current,/redirect:'error'/);
});
test('EINV R1.1.3 preserves MyInvois safety gates and credentials encryption',async()=>{
 const current=await load('backend/src/einvoice-settings.js');
 assert.match(current,/decryptCredential\(rows\[0\]\.client_id_cipher\)/);
 assert.match(current,/decryptCredential\(rows\[0\]\.client_secret_cipher\)/);
 assert.match(current,/EINVOICE_TEST_CONNECTION_REQUIRED/);
 assert.match(current,/classifyMyInvoisOAuthFailure\(response.status,payload\)/);
 assert.match(current,/verified_at=NULL/);
});
