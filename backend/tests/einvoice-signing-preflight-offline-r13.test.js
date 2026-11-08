import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMyInvoisSigningMaterial,EINV_R13_SIGNED_SUBMISSION_ENABLED} from '../src/einvoice-signing-preflight-r13.js';
test('no certificate cannot pass identity preflight',()=>{
 const answer=inspectMyInvoisSigningMaterial({certificatePem:'',privateKeyPem:'',expectedTin:'X',expectedRegistration:'Y'});
 assert.deepEqual(answer,{ok:false,code:'EINV_R13_SIGNING_MATERIAL_INCOMPLETE',canSign:false});
});
test('invalid certificate or key never discloses content',()=>{
 const secret='SENSITIVE_TEST_PRIVATE_KEY';
 const result=inspectMyInvoisSigningMaterial({certificatePem:'BAD',privateKeyPem:secret,expectedTin:'X',expectedRegistration:'Y'});
 assert.equal(result.canSign,false);
 assert.equal(JSON.stringify(result).includes(secret),false);
});
test('Phase C1 never enables signed submission',()=>assert.equal(EINV_R13_SIGNED_SUBMISSION_ENABLED,false));
