import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectInvoiceSnapshotGapsR13,EINV_R13_C3_SUBMISSION_ENABLED} from '../src/einvoice-snapshot-gap-r13.js';
const sale={id:42,status:'PAID',receipt_number:'2026110812340042',subtotal:'4.90',total:'4.90',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.00',discount_amount:'0.00',voucher_amount:'0.00'};
const lines=[{id:3,sale_id:42,product_name:'Tea',quantity:'1.000',unit_price:'4.9000',line_total:'4.90'}];
const request={status:'REQUESTED',environment:'SANDBOX',sale_id:42};
const input={sale,lines,request,environment:'SANDBOX'};
test('C3 reports missing checkout-time classification and tax evidence, never signs or submits',()=>{
 const result=inspectInvoiceSnapshotGapsR13(input);
 assert.equal(result.canSubmit,false);assert.equal(result.canBuildSignedInvoice,false);
 assert.equal(EINV_R13_C3_SUBMISSION_ENABLED,false);
 assert.ok(result.gaps.includes('IMMUTABLE_LINE_CLASSIFICATION_REQUIRED'));
 assert.ok(result.gaps.includes('IMMUTABLE_LINE_TAX_SNAPSHOT_REQUIRED'));
});
test('C3 does not accept source labels alone as proof of immutable snapshot',()=>{
 const result=inspectInvoiceSnapshotGapsR13({...input,lines:[{...lines[0],source:'AUTHORITATIVE_SALE_SNAPSHOT'}]});
 assert.ok(result.gaps.includes('IMMUTABLE_LINE_CLASSIFICATION_REQUIRED'));
});
test('C3 diagnoses non-zero tax and service fees independently without inventing allocations',()=>{
 const result=inspectInvoiceSnapshotGapsR13({...input,sale:{...sale,sales_tax:'0.10',service_charge:'0.20',total:'5.20'}});
 assert.ok(result.gaps.includes('TAX_BREAKDOWN_SNAPSHOT_REQUIRED'));
 assert.ok(result.gaps.includes('SERVICE_CHARGE_ALLOCATION_SNAPSHOT_REQUIRED'));
});
test('C3 diagnoses discounts, vouchers and rounding separately',()=>{
 const result=inspectInvoiceSnapshotGapsR13({...input,sale:{...sale,discount_amount:'0.20',voucher_amount:'0.10',rounding_adjustment:'0.05',total:'4.95'}});
 for(const code of ['DISCOUNT_VOUCHER_ALLOCATION_SNAPSHOT_REQUIRED','ROUNDING_COMPONENT_MAPPING_REQUIRED'])assert.ok(result.gaps.includes(code));
});
test('C3 detects line reconciliation, identity errors and duplicate lines',()=>{
 const result=inspectInvoiceSnapshotGapsR13({...input,lines:[lines[0],{...lines[0],line_total:'1.00'}]});
 assert.ok(result.gaps.includes('SALE_LINE_IDENTITY_INVALID'));
 assert.ok(result.gaps.includes('LINE_SUBTOTAL_MISMATCH'));
});
test('C3 fails closed for unpaid, unrequested and production records',()=>{
 const result=inspectInvoiceSnapshotGapsR13({...input,environment:'PRODUCTION',sale:{...sale,status:'DRAFT'},request:{...request,status:'ISSUED'}});
 for(const code of ['SANDBOX_ONLY','PAID_SALE_REQUIRED','BUYER_REQUEST_REQUIRED'])assert.ok(result.gaps.includes(code));
});
test('C3 returns only sanitized gap codes, does not leak any PII or secrets, and does not mutate inputs',()=>{
 const buyerSecret='NOT_FOR_OUTPUT_9873';
 const source=structuredClone(input);
 const result=inspectInvoiceSnapshotGapsR13({...input,buyer:{name:buyerSecret},secret:buyerSecret});
 assert.equal(JSON.stringify(result).includes(buyerSecret),false);
 assert.deepEqual(input,source);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.gaps),true);
});
