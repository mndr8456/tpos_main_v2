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

import {serializeUnsignedUblInvoiceC43R44} from '../src/einvoice-ubl-xsd-c43-r44-xml.js';
import {executeLocalXsdC43R44,evaluateXsdOutputC43R44} from '../src/einvoice-ubl-xsd-c43-r44.js';

const valid=()=>evaluateSchemaProfileC43R42(auditOfflineUblC43R41(profile()));
const r43=()=>evaluateNormativeCompatibilityC43R43(valid());
test('R4.4 serializes accepted R4.3 canonical JSON into actual unsigned UBL XML without invented values',()=>{
 const result=r43();assert.equal(result.normativeCompatibilityChecksPassed,true);
 const xml=serializeUnsignedUblInvoiceC43R44(result.sdkDocument);
 assert.match(xml,/^<\?xml version="1\.0" encoding="UTF-8"\?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"/);
 assert.equal((xml.match(/<cac:InvoiceLine>/g)||[]).length,4);
 assert.ok(xml.indexOf('<cac:TaxTotal>')<xml.indexOf('<cac:LegalMonetaryTotal>'));
 assert.ok(xml.indexOf('<cac:LegalMonetaryTotal>')<xml.indexOf('<cac:InvoiceLine>'));
 assert.ok(xml.indexOf('<cbc:IndustryClassificationCode')<xml.indexOf('<cac:PartyIdentification>'));
 assert.ok(!/Signature|<script|DOCTYPE/.test(xml));
 assert.match(xml,/<cbc:PayableAmount currencyID="MYR">14\.95<\/cbc:PayableAmount>/);
});
test('R4.4 rejects unexpected root, fake signatures, external XML attributes and unsafe XML characters',()=>{
 const good=r43().sdkDocument;
 const fake=structuredClone(good);fake.Invoice[0].Signature=[{}];assert.throws(()=>serializeUnsignedUblInvoiceC43R44(fake),/XML_SIGNATURE_NOT_ALLOWED/);
 const evil=structuredClone(good);evil.Invoice[0].ID[0]._='A & < B';
 assert.match(serializeUnsignedUblInvoiceC43R44(evil),/A &amp; &lt; B/);
 const invalid=structuredClone(good);invalid.Invoice[0].ID[0]._='A\u0000';assert.throws(()=>serializeUnsignedUblInvoiceC43R44(invalid),/XML_CHARACTER_INVALID/);
 const extra={...good,_E:'bad'};assert.throws(()=>serializeUnsignedUblInvoiceC43R44(extra),/XML_SDK_ROOT_INVALID/);
 const attrs=structuredClone(good);attrs.Invoice[0].ID[0]['xsi:schemaLocation']='https://invalid';assert.throws(()=>serializeUnsignedUblInvoiceC43R44(attrs),/XML_ATTRIBUTE_INVALID/);
});
test('R4.4 readiness and schema-missing outcomes never report false normative validation',()=>{
 const source=r43();
 const missing=evaluateXsdOutputC43R44(source,{status:'XSD_NOT_INSTALLED',xsdExecuted:false,xsdValid:false,issues:[]});
 assert.equal(missing.normativeUblSchemaValidated,false);assert.equal(missing.officialSchemaValidated,false);
 assert.equal(missing.submissionEnabled,false);assert.equal(missing.xmlGenerated,true);
 const denied=evaluateXsdOutputC43R44({status:'NORMATIVE_COMPATIBILITY_GAPS'},null);
 assert.equal(denied.status,'R43_COMPATIBILITY_REQUIRED');
});
test('R4.4 can launch real Python/lxml XSD validator locally but does not claim LHDN validation',async()=>{
 const source=r43();const xml=serializeUnsignedUblInvoiceC43R44(source.sdkDocument);
 const run=await executeLocalXsdC43R44(xml);
 const withoutEngine=['XSD_NOT_INSTALLED','XSD_ENGINE_NOT_AVAILABLE','XSD_ENGINE_NOT_INSTALLED'];
 const completed=['LOCAL_XSD_VALID','LOCAL_XSD_INVALID'];
 // A real OASIS schema installed on the operator PC is not a test failure.
 // Both VALID and INVALID are meaningful executed results; schema/engine
 // setup failures are separate statuses and must never claim validation.
 assert.ok([...withoutEngine,...completed,'XSD_SCHEMA_LOAD_FAILED','XSD_DEPENDENCY_MISSING','XSD_NAMESPACE_INVALID','XSD_EXTERNAL_REFERENCE_BLOCKED','XSD_UNTRUSTED_SYMLINK'].includes(run.status),JSON.stringify(run));
 if(completed.includes(run.status)){
  assert.equal(run.xsdExecuted,true);
  assert.equal(run.xsdValid,run.status==='LOCAL_XSD_VALID');
 }else{
  assert.equal(run.xsdExecuted,false);
  assert.equal(run.xsdValid,false);
 }
 const evaluated=evaluateXsdOutputC43R44(source,run);
 assert.equal(evaluated.officialSchemaValidated,false);
 assert.equal(evaluated.submissionEnabled,false);
 assert.equal(evaluated.normativeUblSchemaValidated,run.status==='LOCAL_XSD_VALID');
});
test('R4.4 GET route is authenticated and permissioned and does not mutate POS or submit',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(app,/ubl-xsd-validation\/:saleId',authenticate,permitted\('einvoice_settings\.view'\)/);
 assert.match(app,/ubl-normative-compatibility\/:saleId'/);
 const js=readFileSync(new URL('../src/einvoice-ubl-xsd-c43-r44.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/\bfetch\s*\(|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/i);
});
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
test('R4.4 actual lxml XSD engine distinguishes valid versus invalid XML with isolated test schema',t=>{
 const dir=mkdtempSync(join(tmpdir(),'tpos-r44-xsd-'));
 try{
  const folder=join(dir,'xsd','maindoc');mkdirSync(folder,{recursive:true});mkdirSync(join(dir,'xsd','common'),{recursive:true});
  const testXsd=join(folder,'UBL-Invoice-2.1.xsd');
  writeFileSync(testXsd,`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" elementFormDefault="qualified"><xs:element name="Invoice"><xs:complexType><xs:sequence><xs:element name="Test" type="xs:string"/></xs:sequence></xs:complexType></xs:element></xs:schema>`);
  const script=fileURLToPath(new URL('../scripts/validate-ubl-xsd-c43-r44.py',import.meta.url));
  const venv=resolve(fileURLToPath(new URL('../',import.meta.url)),process.platform==='win32'?'.venv-ubl/Scripts/python.exe':'.venv-ubl/bin/python');
  const python=existsSync(venv)?venv:process.platform==='win32'?'python':'python3';
  const run=xml=>spawnSync(python,['-I',script,testXsd],{input:xml,encoding:'utf8',timeout:9000});
  const yes=run('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><Test>OK</Test></Invoice>');
  if(yes.error||yes.status!==0){t.skip('Python/lxml optional on build machine');return;}
  const a=JSON.parse(yes.stdout);
  if(a.status==='XSD_ENGINE_NOT_INSTALLED'){t.skip('lxml not installed on build machine');return;}
  assert.equal(a.status,'LOCAL_XSD_VALID');assert.equal(a.xsdExecuted,true);
  const b=JSON.parse(run('<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"><Bad>NO</Bad></Invoice>').stdout);
  assert.equal(b.status,'LOCAL_XSD_INVALID');assert.equal(b.xsdExecuted,true);assert.equal(b.xsdValid,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
