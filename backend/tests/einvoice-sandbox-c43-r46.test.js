import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,X509Certificate,verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {assessSandboxDocumentC43R46,signSdkInvoiceJsonC43R46,buildSubmitEnvelopeC43R46,summarizeSubmitReplyC43R46,verifySignerIdentityC43R46} from '../src/einvoice-sandbox-c43-r46-core.js';
const asset=n=>readFileSync(fileURLToPath(new URL('./fixtures/'+n,import.meta.url)),'utf8');
const cert=asset('r46-test-only.pem'),key=asset('r46-test-only.key');
const doc={_D:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',_A:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',_B:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',Invoice:[{ID:[{_:'INV-TEST-01'}],IssueDate:[{_:'2026-11-10'}],IssueTime:[{_:'10:00:00Z'}],InvoiceTypeCode:[{_:'01',listVersionID:'1.1'}],InvoiceLine:[{ID:[{_:'1'}]}]}]};
const now=new Date('2026-11-10T12:00:00Z');
test('R4.6 never permits stale, future, production or non-XSD document',()=>{
 assert.equal(assessSandboxDocumentC43R46(doc,{now,xsdValid:true,maxAgeMinutes:180}).ready,true);
 assert.equal(assessSandboxDocumentC43R46(doc,{now,xsdValid:false}).code,'R46_NORMATIVE_XSD_REQUIRED');
 assert.equal(assessSandboxDocumentC43R46(doc,{now,environment:'PRODUCTION',xsdValid:true}).code,'R46_SANDBOX_ONLY');
 assert.equal(assessSandboxDocumentC43R46(doc,{now:new Date('2026-11-11T12:00:00Z'),xsdValid:true,maxAgeMinutes:180}).ready,false);
 const fake=structuredClone(doc);fake.Invoice[0].UBLExtensions=[{}];assert.equal(assessSandboxDocumentC43R46(fake,{now,xsdValid:true}).ready,false);
});
test('R4.6 cryptographically signs canonical JSON with RSA SHA256, binds digests and certificate',()=>{
 const signed=signSdkInvoiceJsonC43R46(doc,{certificatePem:cert,privateKeyPem:key,now});
 const final=JSON.parse(signed.json),signature=final.Invoice[0].UBLExtensions[0].UBLExtension[0].ExtensionContent[0].UBLDocumentSignatures[0].SignatureInformation[0].Signature[0];
 const digest=createHash('sha256').update(JSON.stringify(doc)).digest('base64');
 assert.equal(signature.SignedInfo[0].Reference[1].DigestValue[0]._,digest);
 assert.equal(signature.SignedInfo[0].Reference[0].URI,'#id-xades-signed-props');
 assert.equal(verify('RSA-SHA256',Buffer.from(JSON.stringify(doc)),new X509Certificate(cert).publicKey,Buffer.from(signature.SignatureValue[0]._, 'base64')),true);
 const packed=buildSubmitEnvelopeC43R46(signed);assert.equal(packed.documents.length,1);
 assert.equal(packed.documents[0].format,'JSON');
 assert.equal(packed.documents[0].documentHash,createHash('sha256').update(Buffer.from(signed.json)).digest('hex'));
 assert.equal(Buffer.from(packed.documents[0].document,'base64').toString(),signed.json);
 assert.equal(packed.documents[0].codeNumber,'INV-TEST-01');
 assert.equal(doc.Invoice[0].UBLExtensions,undefined);
});
test('R4.6 signer rejects wrong private key and unsigned-only false claims',()=>{
 assert.throws(()=>signSdkInvoiceJsonC43R46(doc,{certificatePem:cert,privateKeyPem:'BAD'}),/R46_KEY_OR_CERT_INVALID/);
 assert.equal(verifySignerIdentityC43R46(cert,{tin:'FAKE',registration:'FAKE',now}).ready,false);
 assert.throws(()=>buildSubmitEnvelopeC43R46({documentHash:'0'.repeat(64),codeNumber:'BAD',json:'{}'}),/R46_SIGNED_DOCUMENT_REQUIRED/);
});
test('R4.6 submission 202 remains pending, never final VALID, and response binds exact invoice code',()=>{
 const response={submissionUID:'SUBMISSION12345678901234',acceptedDocuments:[{uuid:'DOC12345678901234567890123',invoiceCodeNumber:'INV-TEST-01'}],rejectedDocuments:[]};
 assert.equal(summarizeSubmitReplyC43R46(202,response,'INV-TEST-01').status,'SUBMITTED');
 assert.equal(summarizeSubmitReplyC43R46(202,response,'OTHER').status,'SUBMISSION_UNKNOWN');
 assert.equal(summarizeSubmitReplyC43R46(422,{error:{code:'DuplicateSubmission'}},'INV-TEST-01').status,'REJECTED');
 assert.equal(summarizeSubmitReplyC43R46(503,{},'INV-TEST-01').status,'SUBMISSION_UNKNOWN');
 assert.equal(summarizeSubmitReplyC43R46(202,{...response,rejectedDocuments:[{invoiceCodeNumber:'OTHER'}]},'INV-TEST-01').status,'SUBMISSION_UNKNOWN');
});
test('R4.6 requires OWNER confirmation, one 046 attempt, fixed sandbox host and explicit status POST',()=>{
 const source=readFileSync(fileURLToPath(new URL('../src/einvoice-sandbox-c43-r46.js',import.meta.url)),'utf8');
 const app=readFileSync(fileURLToPath(new URL('../src/app.js',import.meta.url)),'utf8');
 assert.match(source,/EINVOICE_R46_SANDBOX_SEND_ENABLED/);
 assert.match(source,/I_CONFIRM_SANDBOX_SUBMISSION/);
 assert.match(source,/R46_SUBMISSION_ALREADY_RESERVED/);
 assert.match(source,/SUBMISSION_UNKNOWN/);
 assert.match(source,/preprod-api\.myinvois\.hasil\.gov\.my/);
 assert.doesNotMatch(source,/https:\/\/api\.myinvois\.hasil\.gov\.my/);
 assert.match(source,/attempt_number,result\) VALUES \(\?,1,'STARTED'\)/);
 assert.match(app,/permitted\('einvoice_documents\.submit'\),sandboxSubmitC43R46/);
 assert.match(app,/sandbox\/status\/:saleId\/refresh/);
});
