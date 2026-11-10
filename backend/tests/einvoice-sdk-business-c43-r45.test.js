import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditMyInvoisBusinessRulesC43R45} from '../src/einvoice-sdk-business-c43-r45-core.js';
const money=x=>[{_:x,currencyID:'MYR'}];
const document=()=>({_D:'ns',Invoice:[{ID:[{_:'INV3'}],IssueDate:[{_:'2026-11-10'}],IssueTime:[{_:'12:30:00Z'}],InvoiceTypeCode:[{_:'01',listVersionID:'1.1'}],DocumentCurrencyCode:[{_:'MYR'}],InvoiceLine:[{ID:[{_:'1'}]}],AccountingSupplierParty:[{}],AccountingCustomerParty:[{}],LegalMonetaryTotal:[{PayableAmount:money('14.95')}]}]});
const src=()=>({saleId:'3',status:'LOCAL_XSD_VALID',normativeXsdExecuted:true,normativeUblSchemaValidated:true,lineCount:4,payable:'14.95',sdkDocument:document()});
test('R4.5 checks selected SDK core fields but never claims official LHDN validation',()=>{
 const r=auditMyInvoisBusinessRulesC43R45(src(),new Date('2026-11-10T20:00:00Z'));
 assert.equal(r.status,'OFFLINE_BUSINESS_RULES_REVIEW_REQUIRED');assert.equal(r.issues.length,0);
 assert.equal(r.lhdnAccepted,false);assert.equal(r.submissionEnabled,false);
 assert.equal(r.signatureValidated,false);assert.equal(r.offlineBusinessRulesPassed,false);
 assert.ok(r.externalValidationRequired.some(x=>x.rule==='TAXPAYER'));
});
test('R4.5 blocks old UTC issue date instead of silently rewriting historical sale',()=>{
 const r=auditMyInvoisBusinessRulesC43R45(src(),new Date('2026-11-11T00:00:00Z'));
 assert.equal(r.status,'OFFLINE_BUSINESS_RULES_BLOCKED');assert.ok(r.issues.some(x=>x.code==='ISSUE_DATE_NOT_CURRENT_UTC'));
});
test('R4.5 refuses absent XSD execution and missing canonical invoice fields',()=>{
 const r=auditMyInvoisBusinessRulesC43R45({...src(),normativeUblSchemaValidated:false});
 assert.equal(r.status,'OFFLINE_BUSINESS_AUDIT_PREREQUISITE_MISSING');
 assert.equal(r.localXsdValidated,false);
 const broken=src();broken.sdkDocument.Invoice[0].InvoiceTypeCode=[{_:'01',listVersionID:'1.0'}];
 assert.ok(auditMyInvoisBusinessRulesC43R45(broken,new Date('2026-11-10T00:00:00Z')).issues.some(x=>x.code==='DOCUMENT_TYPE_VERSION_UNSUPPORTED'));
});
test('R4.5 read-only, authenticated, permissioned; separate from any sandbox submission action',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/sdk-business-audit\/:saleId',authenticate,permitted\('einvoice_settings\.view'\)/);
 const handler=readFileSync(new URL('../src/einvoice-sdk-business-c43-r45.js',import.meta.url),'utf8');
 assert.doesNotMatch(handler,/\bfetch\s*\(|\b(?:INSERT|UPDATE|DELETE|DROP|ALTER)\b/i);
});
