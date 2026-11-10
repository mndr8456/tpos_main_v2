import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewUblTreatmentC43R2} from '../src/einvoice-ubl-treatment-c43-r2.js';
import {buildInvoiceCandidateC43R3,validateInvoiceCandidateC43R3,EINV_C43_R3_SUBMISSION_ENABLED} from '../src/einvoice-ubl-invoice-c43-r3.js';
const sample=[['17','3.50','0.92','0.15'],['273','1.60','0.42','0.07'],['473','8.00','2.09','0.35'],['493','6.00','1.57','0.27']];
const evidence={version:'C4.3-READONLY',status:'EVIDENCE_RECONCILED',saleId:'3',receiptNumber:'20261100320003',lineCount:4,unverifiedMappingLines:0,totals:{gross:'19.10',netBeforeTax:'14.10',salesTax:'0.00',serviceTax:'0.84',serviceCharge:'0.00',rounding:'0.01',payable:'14.95'},reductions:{discount:'0.00',voucher:'5.00'},sourceEvidenceSha256:{checkout:'a'.repeat(64),tax:'b'.repeat(64),mapping:'c'.repeat(64)},lines:sample.map(([p,g,v,t],i)=>({saleLineId:String(i+7),productId:p,gross:g,discount:'0.00',voucher:v,taxableBase:(Number(g)-Number(v)).toFixed(2),tax:t,taxType:'SERVICE_TAX',mappingConfirmed:true}))};
const checkout={version:'C4.1',sale_id:'3',lines:sample.map(([p,g],i)=>({sale_line_id:String(i+7),product_id:p,product_name:`Item ${i}`,quantity:'1.000',unit_price:`${g}00`,line_total:g}))};
const mapping={version:'C4.2B',sale_id:'3',lines:sample.map(([p],i)=>({sale_line_id:String(i+7),product_id:p,mapping_confirmed:true,lhdn_classification:'022',ubl_unit_code:'EA',lhdn_tax_type_code:'02'}))};
const supplier={name:'Sample Restaurant',tin:'C1234567890',identificationType:'BRN',identificationNumber:'123456789012',address1:'Example Street',city:'Semenyih',state:'10',country:'MYS',phone:'+60111222333',msicCode:'56101',businessActivityDescription:'Restaurants'};
const buyer={name:'Example Buyer',tin:'IG1234567890',identificationType:'NRIC',identificationNumber:'901010101010',address1:'Buyer Street',city:'Kajang',state:'10',country:'MYS',phone:'+60199887766'};
const input={evidence,financial:previewUblTreatmentC43R2(evidence),checkout,mapping,supplier,buyer,issueTimestamp:'2026-11-10T04:00:00Z'};
test('R3 constructs unsigned full-shape candidate with 4 exact allowances and reconciled payable',()=>{
 const x=buildInvoiceCandidateC43R3(input);assert.equal(x.status,'UNSIGNED_STRUCTURAL_PREVIEW');assert.equal(x.structuralChecksPassed,true);assert.equal(x.officialSchemaValidated,false);assert.equal(x.submissionEnabled,false);assert.equal(x.submissionReady,false);assert.equal(EINV_C43_R3_SUBMISSION_ENABLED,false);
 const doc=x.document.Invoice[0];assert.equal(doc.cac_InvoiceLine.length,4);assert.deepEqual(doc.cac_InvoiceLine.map(l=>l.cac_AllowanceCharge[0].cbc_Amount[0]._),['0.92','0.42','2.09','1.57']);assert.equal(doc.cac_LegalMonetaryTotal[0].cbc_PayableAmount[0]._,'14.95');assert.equal(doc.cac_Signature,undefined);assert.equal(doc.cac_InvoiceLine[0].cac_Item[0].cac_CommodityClassification[0].cbc_ItemClassificationCode[0]._, '022');
});
test('R3 refuses missing customer, MSIC and state codes without fabricating identifiers',()=>{
 const x=buildInvoiceCandidateC43R3({...input,buyer:null,supplier:{...supplier,msicCode:null,state:'Selangor'}});
 assert.equal(x.status,'SOURCE_DATA_INCOMPLETE');assert.equal(x.document,null);assert.ok(x.missingSources.includes('supplier.msicCode'));assert.ok(x.missingSources.includes('supplier.stateCode'));assert.ok(x.missingSources.includes('buyer.tin'));
});
test('R3 rejects line ID and product tax contradictions',()=>{
 assert.throws(()=>buildInvoiceCandidateC43R3({...input,mapping:{...mapping,lines:mapping.lines.map((x,i)=>i?x:{...x,lhdn_tax_type_code:'06'})}}),/TAX_CODE_MISMATCH/);
 assert.throws(()=>buildInvoiceCandidateC43R3({...input,checkout:{...checkout,lines:[checkout.lines[0],checkout.lines[0],...checkout.lines.slice(2)]}}),/DUPLICATE_SOURCE_LINES|LINE_COUNT_MISMATCH/);
});
test('R3 local structure distinguishes official validation and missing signature',()=>{
 const x=buildInvoiceCandidateC43R3(input);assert.equal(validateInvoiceCandidateC43R3(x.document).code,'LOCAL_STRUCTURE_ONLY');
 assert.equal(validateInvoiceCandidateC43R3({...x.document,Invoice:[{...x.document.Invoice[0],cac_Signature:[{}]}]}).ok,false);
});
test('R3 only exposes GET authenticated route and no payment, signing, submission, SQL mutation',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');assert.match(app,/app\.get\('\/api\/v2\/einvoice\/ubl-invoice-draft\/:saleId',authenticate,permitted\('einvoice_settings\.view'\),getInvoiceCandidateC43R3\)/);
 const code=readFileSync(new URL('../src/einvoice-ubl-invoice-c43-r3.js',import.meta.url),'utf8');assert.doesNotMatch(code,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s+(?:INTO|TABLE|FROM)/i);assert.doesNotMatch(code,/fetch\(|https?:\/\//i);
});
