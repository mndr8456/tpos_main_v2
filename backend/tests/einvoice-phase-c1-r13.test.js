import test from 'node:test';
import assert from 'node:assert/strict';
import {preflightInvoiceSnapshot} from '../src/einvoice-document-preflight-r13.js';
import {inspectMyInvoisSigningMaterial,EINV_R13_SIGNED_SUBMISSION_ENABLED} from '../src/einvoice-signing-preflight-r13.js';
import {R13_SUBMISSION_ENABLED} from '../src/einvoice-document-foundation-r13.js';

const buyer={buyerType:'INDIVIDUAL',buyerName:'Test Customer',tin:'EI00000000010',identificationType:'NRIC',identificationNumber:'900101010001',sstNumber:'',email:'',phone:'+60123456789',address1:'Test Address',address2:'',address3:'',postcode:'43000',city:'Kajang',state:'10',country:'MYS',consent:true};
const supplier={tin:'C12345678900',registrationNumber:'202001234567',name:'Sample Business',sstStatus:'NOT_REGISTERED',sstNumber:'',identificationType:'BRN',msicCode:'56101',address1:'Sample Address',city:'Kajang',state:'10',country:'MYS',phone:'+60123456789'};
const sale={id:50,status:'PAID',receipt_number:'20261113150019',subtotal:'4.90',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.00',total:'4.90'};
const lines=[{sale_id:50,product_name:'Sample Item',quantity:'1.000',unit_price:'4.9000',line_total:'4.90'}];
const request={sale_id:50,status:'REQUESTED',environment:'SANDBOX'};
const input={sale,lines,buyer,supplier,request,environment:'SANDBOX'};
test('C1 checks exact persisted line sums, without modifying sale data',()=>{
 assert.equal(preflightInvoiceSnapshot(input).ok,true);
 assert.equal(preflightInvoiceSnapshot({...input,lines:[{...lines[0],line_total:'4.89'}]}).code,'EINV_R13_LINE_SUBTOTAL_MISMATCH');
 assert.equal(sale.total,'4.90');
});
test('C1 blocks taxes and service charge without authoritative classification',()=>{
 assert.equal(preflightInvoiceSnapshot({...input,sale:{...sale,sales_tax:'0.10',total:'5.00'}}).code,'EINV_R13_TAX_CLASSIFICATION_SNAPSHOT_REQUIRED');
 assert.equal(preflightInvoiceSnapshot({...input,sale:{...sale,service_charge:'0.10',total:'5.00'}}).code,'EINV_R13_SERVICE_CHARGE_MAPPING_REQUIRED');
});
test('C1 never replaces missing supplier UBL fields with fabricated values',()=>{
 assert.equal(preflightInvoiceSnapshot({...input,supplier:{...supplier,msicCode:''}}).code,'EINV_R13_SUPPLIER_UBL_FIELDS_REQUIRED');
});
test('C1 keeps production, unpaid sales and mismatched buyer requests blocked',()=>{
 assert.equal(preflightInvoiceSnapshot({...input,environment:'PRODUCTION'}).code,'EINV_R13_SANDBOX_ONLY');
 assert.equal(preflightInvoiceSnapshot({...input,sale:{...sale,status:'DRAFT'}}).code,'EINV_R13_PAID_RECEIPT_REQUIRED');
 assert.equal(preflightInvoiceSnapshot({...input,request:{...request,sale_id:51}}).code,'EINV_R13_BUYER_REQUEST_MISMATCH');
});
test('C1 protects private signing materials and does not activate submission',()=>{
 const v=inspectMyInvoisSigningMaterial({certificatePem:'INVALID',privateKeyPem:'TOP_SECRET',expectedTin:'C111',expectedRegistration:'123'});
 assert.equal(v.ok,false);assert.equal(JSON.stringify(v).includes('TOP_SECRET'),false);
 assert.equal(EINV_R13_SIGNED_SUBMISSION_ENABLED,false);assert.equal(R13_SUBMISSION_ENABLED,false);
});
