import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSdkJsonProfileC43R4} from '../src/einvoice-sdk-profile-c43-r4-core.js';
import {auditOfflineUblC43R41,C43_R41_SUBMISSION_ENABLED} from '../src/einvoice-ubl-offline-audit-c43-r41-core.js';
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
const run=()=>auditOfflineUblC43R41(profile());
test('R4.1 validates exact four-line historical source without enabling official validation',()=>{
 const r=run();assert.equal(r.status,'OFFLINE_RULE_CHECKS_PASSED_UNSIGNED');assert.equal(r.offlineRuleChecksPassed,true);assert.deepEqual(r.issues,[]);
 assert.equal(r.sdkDocument.Invoice[0].InvoiceLine.length,4);assert.equal(r.offlineJsonSchemaValidated,false);assert.equal(r.officialSchemaValidated,false);assert.equal(r.submissionEnabled,false);assert.equal(r.signaturePresent,false);assert.equal(C43_R41_SUBMISSION_ENABLED,false);
});
test('R4.1 fails closed on missing R4 profile',()=>{const r=auditOfflineUblC43R41(null);assert.equal(r.status,'R4_PROFILE_NOT_READY');assert.equal(r.sdkDocument,null);});
test('R4.1 rejects modified SDK namespaces and missing required cardinality',()=>{
 const s=profile();s.sdkDocument._D='changed';s.sdkDocument.Invoice[0].TaxTotal=[];
 const r=auditOfflineUblC43R41(s);assert.equal(r.status,'OFFLINE_RULE_GAPS');assert.equal(r.sdkDocument,null);
 assert.ok(r.issues.some(i=>i.code==='UBL_NAMESPACE'));assert.ok(r.issues.some(i=>i.code==='REQUIRED_CARDINALITY'));
});
test('R4.1 catches altered line taxable base and tax category while R4 header profile remains passed',()=>{
 const s=profile();const line=s.sdkDocument.Invoice[0].InvoiceLine[0];
 line.TaxTotal[0].TaxSubtotal=[{TaxableAmount:[{_:10,currencyID:'MYR'}],TaxAmount:[{_:0.15,currencyID:'MYR'}],TaxCategory:[{ID:[{_:'02'}],TaxScheme:[{ID:[{_:'BAD',schemeID:'UN/ECE 5153',schemeAgencyID:'6'}]}]}]}];
 const r=auditOfflineUblC43R41(s);assert.ok(r.issues.some(i=>i.code==='TAX_BASE_MISMATCH'));assert.ok(r.issues.some(i=>i.code==='TAX_CATEGORY_STRUCTURE'));
});
test('R4.1 catches altered line tax and false signing extensions',()=>{
 const s=profile();s.sdkDocument.Invoice[0].InvoiceLine[0].TaxTotal[0].TaxAmount[0]._ = 4.15;
 s.sdkDocument.Invoice[0].UBLExtensions=[{}];
 const r=auditOfflineUblC43R41(s);assert.ok(r.issues.some(i=>i.code==='LINE_TAX_SUM_MISMATCH'));assert.ok(r.issues.some(i=>i.code==='SIGNATURE_UNEXPECTED'));
});
test('R4.1 endpoint is permissioned read-only and R3/R4 endpoints survive unchanged',()=>{
 const src=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 for(const url of ['ubl-invoice-draft','ubl-sdk-profile','ubl-offline-rules'])assert.match(src,new RegExp("app\\.get\\('\\/api\\/v2\\/einvoice\\/"+url+"\\/:saleId'"));
 const route=readFileSync(new URL('../src/einvoice-ubl-offline-audit-c43-r41.js',import.meta.url),'utf8');
 assert.doesNotMatch(route,/\bfetch\s*\(|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
 assert.match(src,/ubl-offline-rules\/:saleId',authenticate,permitted\('einvoice_settings\.view'\)/);
});
