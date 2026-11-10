import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateUblProfileJsonSchemaC43R42} from '../src/einvoice-ubl-schema-c43-r42-core.js';
import {evaluateSchemaProfileC43R42} from '../src/einvoice-ubl-schema-c43-r42.js';
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
const passed=()=>evaluateSchemaProfileC43R42(auditOfflineUblC43R41(profile()));
test('R4.2 profile schema validates real four-line structured unsigned fixture',()=>{
 const r=passed();assert.equal(r.status,'OFFLINE_PROFILE_SCHEMA_PASSED_UNSIGNED',JSON.stringify(r.issues));assert.equal(r.offlineProfileSchemaValidated,true);assert.equal(r.offlineJsonSchemaValidated,false);assert.equal(r.officialSchemaValidated,false);assert.equal(r.submissionEnabled,false);
 assert.equal(r.sdkDocument.Invoice[0].InvoiceLine.length,4);
});
test('R4.2 refuses incomplete prior R4.1 check without an invoice',()=>{
 const r=evaluateSchemaProfileC43R42({status:'OFFLINE_RULE_GAPS',offlineRuleChecksPassed:false});assert.equal(r.sdkDocument,null);assert.equal(r.offlineProfileSchemaValidated,false);
});
test('R4.2 schema catches malformed scalar wrappers, price and unexpected nested content',()=>{
 const p=profile(), i=p.sdkDocument.Invoice[0];i.InvoiceLine[0].Price[0].PriceAmount=[{_:1,currencyID:'USD'}];
 i.InvoiceLine[1].ID='2';i.AccountingSupplierParty[0].Party[0].PartyLegalEntity[0].RegistrationName[0]._='';
 let errs=validateUblProfileJsonSchemaC43R42(p.sdkDocument);
 assert.ok(errs.some(e=>e.code==='SCHEMA_CONST'));
 assert.ok(errs.some(e=>e.code==='SCHEMA_TYPE'));
 assert.ok(errs.some(e=>e.code==='SCHEMA_PATTERN'));
});
test('R4.2 schema rejects unexpected namespaces and additional root keys',()=>{
 const p=profile();p.sdkDocument._D='BAD';p.sdkDocument.signing=true;
 const e=validateUblProfileJsonSchemaC43R42(p.sdkDocument);assert.ok(e.some(x=>x.code==='SCHEMA_CONST'));assert.ok(e.some(x=>x.code==='SCHEMA_ADDITIONAL_PROPERTY'));
});
test('R4.2 endpoint is separately permissioned GET, with no financial write or network call',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');assert.match(app,/ubl-schema-profile\/:saleId',authenticate,permitted\('einvoice_settings\.view'\)/);
 const route=readFileSync(new URL('../src/einvoice-ubl-schema-c43-r42.js',import.meta.url),'utf8');assert.doesNotMatch(route,/\bfetch\s*\(|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
});
