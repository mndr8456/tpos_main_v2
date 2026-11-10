import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSdkJsonProfileC43R4} from '../src/einvoice-sdk-profile-c43-r4-core.js';
import {auditOfflineUblC43R41} from '../src/einvoice-ubl-offline-audit-c43-r41-core.js';
import {evaluateSchemaProfileC43R42} from '../src/einvoice-ubl-schema-c43-r42.js';
import {auditNormativeCompatibilityC43R43} from '../src/einvoice-ubl-normative-audit-c43-r43-core.js';
import {evaluateNormativeCompatibilityC43R43} from '../src/einvoice-ubl-normative-audit-c43-r43.js';
const d=x=>[{_:x}], amt=x=>[{_:x,currencyID:'MYR'}];
const id=(v,s)=>({cbc_ID:[{_:v,schemeID:s}]});
function party(supplier=false){return {cac_Party:[{...(supplier?{cbc_IndustryClassificationCode:[{_:'56101',name:'Restaurants'}]}:{}),cac_PartyIdentification:[id('C1234567890','TIN'),id('123456789012','BRN')],cac_PostalAddress:[{cbc_CityName:d('Semenyih'),cbc_CountrySubentityCode:d('10'),cac_AddressLine:[{cbc_Line:d('Road')}],cac_Country:[{cbc_IdentificationCode:[{_:'MYS',listID:'ISO3166-1',listAgencyID:'6'}]}]}],cac_PartyLegalEntity:[{cbc_RegistrationName:d('Example')}]}]};}
function fixture(){return {status:'UNSIGNED_STRUCTURAL_PREVIEW',structuralChecksPassed:true,saleId:'3',receiptNumber:'20261100320003',sourceEvidenceSha256:{checkout:'a'.repeat(64)},document:{_DRAFT_ONLY:true,Invoice:[{cbc_ID:d('20261100320003'),cbc_IssueDate:d('2026-11-10'),cbc_IssueTime:d('04:00:00Z'),cbc_InvoiceTypeCode:[{_:'01',listVersionID:'1.1'}],cbc_DocumentCurrencyCode:d('MYR'),cac_AccountingSupplierParty:[party(true)],cac_AccountingCustomerParty:[party(false)],cac_InvoiceLine:Array.from({length:4},(_,i)=>({cbc_ID:d(String(i+1)),cbc_InvoicedQuantity:[{_:'1.000',unitCode:'EA'}],cbc_LineExtensionAmount:amt(['2.58','1.18','5.91','4.43'][i]),cac_AllowanceCharge:[{cbc_ChargeIndicator:d(false),cbc_Amount:amt(['0.92','0.42','2.09','1.57'][i])}],cac_TaxTotal:[{cbc_TaxAmount:amt(['0.15','0.07','0.35','0.27'][i])}],cac_Item:[{cbc_Description:d('Product'),cac_CommodityClassification:[{cbc_ItemClassificationCode:[{_:'022',listID:'CLASS'}]}]}],cac_Price:[{cbc_PriceAmount:amt('3.50')}]})),cac_TaxTotal:[{cbc_TaxAmount:amt('0.84')}],cac_LegalMonetaryTotal:[{cbc_LineExtensionAmount:amt('14.10'),cbc_TaxExclusiveAmount:amt('14.10'),cbc_TaxInclusiveAmount:amt('14.94'),cbc_PayableRoundingAmount:amt('0.01'),cbc_PayableAmount:amt('14.95')}]}]}};}

function profile(){
 const r=validateSdkJsonProfileC43R4(fixture());
 const lines=r.sdkDocument.Invoice[0].InvoiceLine;
 for(const l of lines){
  const tax=l.TaxTotal[0],net=l.LineExtensionAmount[0]._;
  tax.TaxSubtotal=[{TaxableAmount:[{_:net,currencyID:'MYR'}],TaxAmount:[{_:tax.TaxAmount[0]._,currencyID:'MYR'}],TaxCategory:[{ID:[{_:'06'}],TaxScheme:[{ID:[{_:'OTH',schemeID:'UN/ECE 5153',schemeAgencyID:'6'}]}]}]}];
 }
 return r;
}
const passed=()=>evaluateSchemaProfileC43R42(auditOfflineUblC43R41(profile()));

const valid=()=>evaluateSchemaProfileC43R42(auditOfflineUblC43R41(profile()));
test('R4.3 positively audits prior four-line fixture without claiming normative XSD execution',()=>{
 const result=evaluateNormativeCompatibilityC43R43(valid());
 assert.equal(result.status,'NORMATIVE_COMPATIBILITY_CHECKS_PASSED_UNSIGNED',JSON.stringify(result.issues));
 assert.equal(result.normativeCompatibilityChecksPassed,true);
 assert.equal(result.normativeXsdExecuted,false);
 assert.equal(result.normativeUblSchemaValidated,false);
 assert.equal(result.officialSchemaValidated,false);
 assert.equal(result.submissionEnabled,false);
 assert.equal(result.sdkDocument.Invoice[0].InvoiceLine.length,4);
 assert.equal(result.canonicalOrderingApplied,true);
 assert.ok(result.sourceOrderIssues.some(x=>x.code==='UBL_ELEMENT_SEQUENCE'));
});
test('R4.3 rejects incomplete R4.2 profile and does not release a document',()=>{
 const result=evaluateNormativeCompatibilityC43R43({status:'OFFLINE_PROFILE_SCHEMA_GAPS',offlineProfileSchemaValidated:false});
 assert.equal(result.normativeCompatibilityChecksPassed,false);
 assert.equal(result.sdkDocument,null);
});
test('R4.3 canonically orders Invoice TaxTotal and LegalMonetaryTotal without changing values',()=>{
 const source=valid(), i=source.sdkDocument.Invoice[0];
 const result=evaluateNormativeCompatibilityC43R43(source);
 assert.equal(result.normativeCompatibilityChecksPassed,true,JSON.stringify(result.issues));
 const keys=Object.keys(result.sdkDocument.Invoice[0]);
 assert.ok(keys.indexOf('TaxTotal')<keys.indexOf('LegalMonetaryTotal'));
 assert.ok(keys.indexOf('LegalMonetaryTotal')<keys.indexOf('InvoiceLine'));
 assert.deepEqual(result.sdkDocument.Invoice[0].InvoiceLine,i.InvoiceLine);
 assert.deepEqual(result.sdkDocument.Invoice[0].LegalMonetaryTotal,i.LegalMonetaryTotal);
});
test('R4.3 catches wrong nested invoice line ordering and non-UBL element',()=>{
 const source=valid(),l=source.sdkDocument.Invoice[0].InvoiceLine[0];
 const m={};for(const [k,v] of Object.entries(l)){if(k!=='Item')m[k]=v;if(k==='Price')m.Item=l.Item;}
 m.BogusElement=[{_:'fake'}];source.sdkDocument.Invoice[0].InvoiceLine[0]=m;
 const result=evaluateNormativeCompatibilityC43R43(source);
 assert.ok(result.sourceOrderIssues.some(x=>x.code==='UBL_ELEMENT_SEQUENCE'));
 assert.ok(result.issues.some(x=>x.code==='UBL_ELEMENT_NOT_IN_SEQUENCE'));
});
test('R4.3 rejects root order and cardinality mismatch',()=>{
 const source=valid();const d=source.sdkDocument;
 source.sdkDocument={Invoice:d.Invoice,_D:d._D,_A:d._A,_B:d._B};
 assert.ok(auditNormativeCompatibilityC43R43(source.sdkDocument).some(x=>x.code==='UBL_JSON_ROOT_ORDER'));
 const clone=structuredClone(d);clone.Invoice[0].AccountingSupplierParty.push(clone.Invoice[0].AccountingSupplierParty[0]);
 assert.ok(auditNormativeCompatibilityC43R43(clone).some(x=>x.code==='UBL_PROFILE_SINGLE_OCCURRENCE'));
});
test('R4.3 route protects existing endpoints and performs no persistence or submission',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/ubl-normative-compatibility\/:saleId',authenticate,permitted\('einvoice_settings\.view'\)/);
 const route=readFileSync(new URL('../src/einvoice-ubl-normative-audit-c43-r43.js',import.meta.url),'utf8');
 assert.doesNotMatch(route,/\bfetch\s*\(|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
 assert.match(app,/ubl-schema-profile\/:saleId'/);
});
