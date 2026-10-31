import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculatePosBill} from '../src/pos-bill.js';
import {applySstPolicy} from '../src/sst-policy.js';
const pos=readFileSync(new URL('../../frontend/src/PosTerminal.jsx',import.meta.url),'utf8');
const products=readFileSync(new URL('../../frontend/src/Products.jsx',import.meta.url),'utf8');
const settings=new Map([
 ['SALES_TAX',{isEnabled:true,registrationNumber:'REGISTERED',taxRate:'8.00'}],
 ['SERVICE_TAX',{isEnabled:true,registrationNumber:'REGISTERED',taxRate:'10.00'}]
]);
function check(bill){
 const cents=(x)=>Math.round(Number(x)*100);
 assert.equal(bill.subtotalBeforeTaxSen-bill.discountSen-bill.voucherSen+bill.salesTaxSen+bill.serviceTaxSen+bill.roundingAdjustmentSen,bill.totalSen);
 assert.equal(cents(bill.subtotalBeforeTax),bill.subtotalBeforeTaxSen);
 assert.equal(cents(bill.total),bill.totalSen);
}
test('Legacy included flag is ignored: RM45 quote adds RM1.68 and BNM rounds to RM46.70',()=>{
 const sales=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},settings);
 const bill=calculatePosBill([{lineSen:2100,...sales},{lineSen:2400,taxType:'NONE',taxRate:'0',taxInclusive:false}]);
 assert.equal(sales.taxInclusive,false);
 assert.equal(bill.subtotal,'45.00');
 assert.equal(bill.salesTax,'1.68');
 assert.equal(bill.salesTaxInclusive,'0.00');
 assert.equal(bill.subtotalBeforeTax,'45.00');
 assert.equal(bill.total,'46.70');check(bill);
});
test('Exclusive example RM45: Sales Tax added and BNM rounding produces RM46.70',()=>{
 const sales=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:0},settings);
 const bill=calculatePosBill([{lineSen:2100,...sales},{lineSen:2400,taxType:'NONE',taxRate:'0',taxInclusive:false}]);
 assert.equal(bill.subtotalBeforeTax,'45.00');
 assert.equal(bill.salesTax,'1.68');
 assert.equal(bill.salesTaxInclusive,'0.00');
 assert.equal(bill.roundingAdjustment,'+0.02');
 assert.equal(bill.total,'46.70');check(bill);
});
test('Mixed included and added SST, discounts and vouchers reconcile to total',()=>{
 const bill=calculatePosBill([
  {lineSen:10800,taxType:'SALES_TAX',taxRate:'8.00',taxInclusive:true},
  {lineSen:5000,taxType:'SERVICE_TAX',taxRate:'10.00',taxInclusive:false},
  {lineSen:3500,taxType:'NONE',taxRate:'0.00',taxInclusive:false}
 ],{discountSen:123,voucherSen:177});
 assert.equal(bill.subtotal,'193.00');
 assert.ok(bill.salesTaxIncludedSen>0);
 assert.ok(bill.serviceTaxSen>0);
 check(bill);
});
test('SST settings OFF remains zero even for old inclusive product',()=>{
 const disabled=new Map(settings);disabled.set('SALES_TAX',{...settings.get('SALES_TAX'),isEnabled:false});
 const policy=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},disabled);
 const bill=calculatePosBill([{lineSen:2100,...policy}]);
 assert.equal(bill.salesTax,'0.00');assert.equal(bill.subtotalBeforeTax,'21.00');check(bill);
});
test('Seven-line POS bill uses backend net subtotal, but cart still displays actual selling subtotal',()=>{
 assert.match(pos,/money\(bill\.subtotalBeforeTax\?\?bill\.subtotal\)/);
 assert.match(pos,/money\(current\?\.subtotal\)/);
 assert.match(pos,/Rounding Adjustment/);
 assert.match(pos,/Sales Tax/);
 assert.match(pos,/Service Tax/);
});
test('Product editor no longer exposes any SST-inclusive checkbox or explanatory note',()=>{
 assert.doesNotMatch(products,/SST Price Inclusive/);
 assert.doesNotMatch(products,/ON: SST is already included/);
 assert.doesNotMatch(products,/OFF: SST will be added/);
 assert.doesNotMatch(products,/<Field label="SST Rate \(\%\)"/);
});
