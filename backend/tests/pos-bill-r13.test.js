import test from 'node:test';
import assert from 'node:assert/strict';
import {roundBillToFiveSen,calculatePosBill} from '../src/pos-bill.js';
const item=(lineSen,taxType='NONE',taxRate='0.000',taxInclusive=false)=>({lineSen,taxType,taxRate,taxInclusive});
test('BNM nearest five sen applied once to total bill, not individual products',()=>{
 const expected=[0,0,0,5,5,5,5,5,10,10];
 for(let last=0;last<10;last++){
  const a=roundBillToFiveSen(3300+last);
  assert.equal(a.totalSen,3300+expected[last]);
  assert.equal(a.adjustmentSen,expected[last]-last);
 }
 assert.deepEqual(roundBillToFiveSen(0),{adjustmentSen:0,totalSen:0});
 assert.equal(calculatePosBill([item(101),item(101)]).total,'2.00');
});
test('SST-exclusive sales and service tax are separate, with total tax before rounding',()=>{
 const b=calculatePosBill([item(10003,'SALES_TAX','10.000'),item(10003,'SERVICE_TAX','6.000')]);
 assert.equal(b.subtotal,'200.06');
 assert.equal(b.salesTax,'10.00');
 assert.equal(b.serviceTax,'6.00');
 assert.equal(b.totalBeforeRounding,'216.06');
 assert.equal(b.roundingAdjustment,'-0.01');
 assert.equal(b.total,'216.05');
});
test('SST-inclusive tax is disclosed but never added a second time',()=>{
 const b=calculatePosBill([item(10600,'SERVICE_TAX','6.000',true)]);
 assert.equal(b.serviceTax,'6.00');
 assert.equal(b.serviceTaxInclusive,'6.00');
 assert.equal(b.total,'106.00');
});
test('Discount allocation uses cents and tax applies after discounts; voucher is distinct',()=>{
 const a=calculatePosBill([item(1000,'SALES_TAX','10.000'),item(1000,'SALES_TAX','10.000')],{discountSen:101});
 assert.equal(a.discount,'1.01');
 assert.equal(a.salesTax,'1.90');
 assert.equal(a.totalBeforeRounding,'20.89');
 assert.equal(a.roundingAdjustment,'+0.01');
 assert.equal(a.total,'20.90');
 const b=calculatePosBill([item(500)],{voucherSen:100});
 assert.equal(b.voucher,'1.00');
 assert.equal(b.total,'4.00');
});
test('Invalid product tax types, rates or excessive reductions fail closed',()=>{
 assert.throws(()=>calculatePosBill([item(100,'FAKE','5.000')]),/POS_TAX_TYPE_INVALID/);
 assert.throws(()=>calculatePosBill([item(100,'NONE','6.000')]),/POS_TAX_CONFIG_INVALID/);
 assert.throws(()=>calculatePosBill([item(100,'SALES_TAX','101')]),/POS_TAX_RATE_INVALID/);
 assert.throws(()=>calculatePosBill([item(100)],{discountSen:101}),/POS_BILL_REDUCTION_EXCEEDS_SUBTOTAL/);
});
