import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnsignedInvoiceDraftR13,EINV_R13_C2_SUBMISSION_ENABLED} from '../src/einvoice-ubl-draft-r13.js';
const buyer={buyerType:'INDIVIDUAL',buyerName:'Test Customer',tin:'EI00000000010',identificationType:'NRIC',identificationNumber:'900101010001',sstNumber:'',email:'',phone:'+60123456789',address1:'Test Address',address2:'',address3:'',postcode:'43000',city:'Kajang',state:'10',country:'MYS',consent:true};
const supplier={tin:'C12345678900',registrationNumber:'202001234567',name:'Sample Business',sstStatus:'NOT_REGISTERED',sstNumber:'',identificationType:'BRN',msicCode:'56101',address1:'Sample Address',city:'Kajang',state:'10',country:'MYS',phone:'+60123456789'};
const sale={id:50,status:'PAID',receipt_number:'20261113150019',subtotal:'4.90',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.00',total:'4.90'};
const lines=[{id:90,sale_id:50,product_name:'Sample Item',quantity:'1.000',unit_price:'4.9000',line_total:'4.90'}];
const request={sale_id:50,status:'REQUESTED',environment:'SANDBOX'};
const lineClassifications=[{saleLineId:90,classificationCode:'022',unitCode:'C62',source:'AUTHORITATIVE_SALE_SNAPSHOT'}];
const input={sale,lines,buyer,supplier,request,environment:'SANDBOX',lineClassifications,issueDate:'2026-11-08',issueTime:'05:00:00Z'};
test('C2 creates deterministic unsigned UBL draft with explicit values only',()=>{
 const a=buildUnsignedInvoiceDraftR13(input),b=buildUnsignedInvoiceDraftR13(input);
 assert.equal(a.ok,true);assert.deepEqual(a,b);assert.equal(a.canSubmit,false);
 assert.equal(a.document.Invoice[0].InvoiceTypeCode[0].listVersionID,'1.1');
 assert.equal(a.document.Invoice[0].LegalMonetaryTotal[0].PayableAmount[0]._,sale.total);
 assert.equal(a.document.Invoice[0].InvoiceLine[0].Item[0].CommodityClassification[0].ItemClassificationCode[0]._,'022');
 assert.equal(a.document.Invoice[0].Signature,undefined);
 assert.equal(EINV_R13_C2_SUBMISSION_ENABLED,false);
});
test('C2 refuses absent and untrusted classification; never guesses code',()=>{
 assert.equal(buildUnsignedInvoiceDraftR13({...input,lineClassifications:[]}).code,'EINV_R13_C2_CLASSIFICATIONS_REQUIRED');
 assert.equal(buildUnsignedInvoiceDraftR13({...input,lineClassifications:[{...lineClassifications[0],source:'PRODUCT_MASTER_CURRENT'}]}).code,'EINV_R13_C2_CLASSIFICATIONS_NOT_AUTHORITATIVE');
 assert.equal(buildUnsignedInvoiceDraftR13({...input,lineClassifications:[{...lineClassifications[0],classificationCode:''}]}).code,'EINV_R13_C2_CLASSIFICATIONS_INVALID');
});
test('C2 refuses discount, voucher, tax, fees and rounding without mappings',()=>{
 assert.equal(buildUnsignedInvoiceDraftR13({...input,sale:{...sale,discount_amount:'0.10'}}).code,'EINV_R13_C2_ALLOWANCE_ALLOCATION_REQUIRED');
 assert.equal(buildUnsignedInvoiceDraftR13({...input,sale:{...sale,voucher_amount:'0.10'}}).code,'EINV_R13_C2_ALLOWANCE_ALLOCATION_REQUIRED');
 assert.equal(buildUnsignedInvoiceDraftR13({...input,sale:{...sale,rounding_adjustment:'0.05',total:'4.95'}}).code,'EINV_R13_C2_ROUNDING_MAPPING_REQUIRED');
 assert.equal(buildUnsignedInvoiceDraftR13({...input,sale:{...sale,sales_tax:'0.10',total:'5.00'}}).code,'EINV_R13_TAX_CLASSIFICATION_SNAPSHOT_REQUIRED');
 assert.equal(buildUnsignedInvoiceDraftR13({...input,sale:{...sale,service_charge:'0.10',total:'5.00'}}).code,'EINV_R13_SERVICE_CHARGE_MAPPING_REQUIRED');
});
test('C2 does not accept unpaid sale, wrong tenant request or production',()=>{
 assert.equal(buildUnsignedInvoiceDraftR13({...input,environment:'PRODUCTION'}).ok,false);
 assert.equal(buildUnsignedInvoiceDraftR13({...input,sale:{...sale,status:'DRAFT'}}).ok,false);
 assert.equal(buildUnsignedInvoiceDraftR13({...input,request:{...request,sale_id:51}}).ok,false);
});
test('C2 validates issued timestamp and unique line identity',()=>{
 assert.equal(buildUnsignedInvoiceDraftR13({...input,issueDate:'2026-13-08'}).ok,false);
 assert.equal(buildUnsignedInvoiceDraftR13({...input,lineClassifications:[{...lineClassifications[0],saleLineId:91}]}).code,'EINV_R13_C2_CLASSIFICATIONS_INVALID');
});
test('C2 leaves existing input untouched and never serializes signing material',()=>{
 const serialized=JSON.stringify(buildUnsignedInvoiceDraftR13({...input,secret:'DO_NOT_EXPOSE'}));
 assert.equal(serialized.includes('DO_NOT_EXPOSE'),false);
 assert.equal(sale.total,'4.90'); assert.equal(lines[0].quantity,'1.000');
});
