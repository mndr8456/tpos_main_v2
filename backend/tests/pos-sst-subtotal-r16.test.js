import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculatePosBill} from '../src/pos-bill.js';
import {applySstPolicy} from '../src/sst-policy.js';

// POS quotes use the active tenant SST settings. The legacy inclusive flag
// remains stored for compatibility but is not an active Product UI choice.
const pos=readFileSync(new URL('../../frontend/src/PosTerminal.jsx',import.meta.url),'utf8');
const products=readFileSync(new URL('../../frontend/src/Products.jsx',import.meta.url),'utf8');
const settings=new Map([
 ['SALES_TAX',{isEnabled:true,registrationNumber:'REGISTERED',taxRate:'8.00'}],
 ['SERVICE_TAX',{isEnabled:true,registrationNumber:'REGISTERED',taxRate:'10.00'}]
]);
function check(bill){
 const cents=value=>Math.round(Number(value)*100);
 assert.equal(bill.subtotalBeforeTaxSen-bill.discountSen-bill.voucherSen+bill.salesTaxSen+bill.serviceTaxSen+bill.roundingAdjustmentSen,bill.totalSen);
 assert.equal(cents(bill.subtotalBeforeTax),bill.subtotalBeforeTaxSen);
 assert.equal(cents(bill.total),bill.totalSen);
}

test('Legacy inclusive flag is ignored: RM45 cart charges RM1.68 SST and rounds to RM46.70',()=>{
 const legacy=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},settings);
 const current=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:0},settings);
 assert.equal(legacy.taxInclusive,false);
 assert.deepEqual(legacy,current);
 const bill=calculatePosBill([{lineSen:2100,...legacy},{lineSen:2400,taxType:'NONE',taxRate:'0',taxInclusive:false}]);
 assert.equal(bill.subtotal,'45.00');
 assert.equal(bill.subtotalBeforeTax,'45.00');
 assert.equal(bill.salesTax,'1.68');
 assert.equal(bill.salesTaxInclusive,'0.00');
 assert.equal(bill.roundingAdjustment,'+0.02');
 assert.equal(bill.total,'46.70');
 check(bill);
});

test('Two units at RM10.50 each charge RM0.84 Sales Tax per unit at 8%',()=>{
 const sales=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:0},settings);
 const single=calculatePosBill([{lineSen:1050,...sales}]);
 const both=calculatePosBill([{lineSen:2100,...sales}]);
 assert.equal(single.salesTax,'0.84');
 assert.equal(both.salesTax,'1.68');
 assert.equal(both.totalBeforeRounding,'22.68');
 assert.equal(both.roundingAdjustment,'+0.02');
 assert.equal(both.total,'22.70');
 check(both);
});

test('Sales Tax and Service Tax stay separate with discounts and vouchers',()=>{
 const sales=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},settings);
 const service=applySstPolicy({jkdm_tax_type:'SERVICE_TAX',jkdm_tax_inclusive:1},settings);
 const bill=calculatePosBill([
  {lineSen:10800,...sales},
  {lineSen:5000,...service},
  {lineSen:3500,taxType:'NONE',taxRate:'0.00',taxInclusive:false}
 ],{discountSen:123,voucherSen:177});
 assert.equal(bill.subtotal,'193.00');
 assert.equal(bill.subtotalBeforeTax,'193.00');
 assert.equal(bill.salesTax,'8.51');
 assert.equal(bill.serviceTax,'4.92');
 assert.equal(bill.salesTaxInclusive,'0.00');
 assert.equal(bill.serviceTaxInclusive,'0.00');
 assert.equal(bill.total,'203.45');
 check(bill);
});

test('SST OFF and missing registration both suppress tax despite legacy flag',()=>{
 for(const patch of [{isEnabled:false},{registrationNumber:''}]){
  const disabled=new Map(settings);
  disabled.set('SALES_TAX',{...settings.get('SALES_TAX'),...patch});
  const policy=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},disabled);
  const bill=calculatePosBill([{lineSen:2100,...policy}]);
  assert.equal(policy.taxType,'NONE');
  assert.equal(bill.salesTax,'0.00');
  assert.equal(bill.subtotalBeforeTax,'21.00');
  assert.equal(bill.total,'21.00');
  check(bill);
 }
});

test('Seven-line POS bill always renders backend subtotal and both taxes',()=>{
 assert.match(pos,/money\(bill\.subtotalBeforeTax\?\?bill\.subtotal\)/);
 assert.match(pos,/money\(current\?\.subtotal\)/);
 assert.match(pos,/Rounding Adjustment/);
 assert.match(pos,/Sales Tax/);
 assert.match(pos,/Service Tax/);
});

test('Product editor removes SST Price Inclusive and keeps tenant SST classification',()=>{
 assert.doesNotMatch(products,/SST Price Inclusive/);
 assert.doesNotMatch(products,/ON: SST is already included/);
 assert.doesNotMatch(products,/OFF: SST will be added/);
 assert.doesNotMatch(products,/<Field label="SST Rate \(\%\)"/);
 assert.match(products,/SST — Sales Tax/);
 assert.match(products,/SST — Service Tax/);
 assert.match(products,/onSave\(\{\.\.\.form,jkdmTaxInclusive:false/);
});
