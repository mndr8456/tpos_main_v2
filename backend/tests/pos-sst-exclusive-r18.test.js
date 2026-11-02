import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySstPolicy} from '../src/sst-policy.js';
import {calculatePosBill} from '../src/pos-bill.js';
const productUi=readFileSync(new URL('../../frontend/src/Products.jsx',import.meta.url),'utf8');
const posQuote=readFileSync(new URL('../src/pos-drafts.js',import.meta.url),'utf8');
const settings=new Map([
 ['SALES_TAX',{isEnabled:true,registrationNumber:'VALID_SALES_REF',taxRate:'8.00'}],
 ['SERVICE_TAX',{isEnabled:true,registrationNumber:'VALID_SERVICE_REF',taxRate:'10.00'}]
]);
test('Product Add/Edit and View contain neither inclusive checkbox nor obsolete hint',()=>{
 assert.doesNotMatch(productUi,/SST Price Inclusive/);
 assert.doesNotMatch(productUi,/OFF: SST will be added/);
 assert.doesNotMatch(productUi,/ON: SST is already included/);
 assert.match(productUi,/SST — Sales Tax/);
 assert.match(productUi,/SST — Service Tax/);
 assert.match(productUi,/jkdmTaxInclusive:false/);
 assert.match(productUi,/onSave\(\{\.\.\.form,jkdmTaxInclusive:false/);
});
test('Two units at RM10.50: Sales Tax RM0.84 each; 2 units RM1.68 and RM22.68',()=>{
 const product={jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1,jkdm_tax_rate:'0.00'};
 const quote=applySstPolicy(product,settings);
 assert.equal(quote.taxInclusive,false);
 const bill=calculatePosBill([{lineSen:2100,...quote}]);
 assert.equal(bill.subtotal,'21.00');
 assert.equal(bill.salesTax,'1.68');
 assert.equal(bill.totalBeforeRounding,'22.68');
 assert.equal(bill.roundingAdjustment,'+0.02');
 assert.equal(bill.total,'22.70');
});
test('RM45 mixed cart example: only AGLIO taxed, BNM rounding once',()=>{
 const taxable=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},settings);
 const untaxed=applySstPolicy({jkdm_tax_type:'NONE',jkdm_tax_inclusive:1},settings);
 const bill=calculatePosBill([{lineSen:2100,...taxable},{lineSen:2400,...untaxed}]);
 assert.equal(bill.subtotalBeforeTax,'45.00');
 assert.equal(bill.salesTax,'1.68');
 assert.equal(bill.totalBeforeRounding,'46.68');
 assert.equal(bill.roundingAdjustment,'+0.02');
 assert.equal(bill.total,'46.70');
});
test('SST OFF, mismatch and unregistered tax have no charge despite old flag',()=>{
 for(const setting of [{...settings.get('SALES_TAX'),isEnabled:false},{...settings.get('SALES_TAX'),registrationNumber:''}]){
  const s=new Map(settings);s.set('SALES_TAX',setting);
  const p=applySstPolicy({jkdm_tax_type:'SALES_TAX',jkdm_tax_inclusive:1},s);
  assert.equal(p.taxType,'NONE');
  assert.equal(calculatePosBill([{lineSen:10000,...p}]).salesTax,'0.00');
 }
 const p=applySstPolicy({jkdm_tax_type:'SERVICE_TAX',jkdm_tax_inclusive:1},settings);
 assert.equal(calculatePosBill([{lineSen:10000,...p}]).serviceTax,'10.00');
 assert.equal(calculatePosBill([{lineSen:10000,...p}]).salesTax,'0.00');
});
test('Legacy field remains readable without schema migration; POS quote is backend-authoritative',()=>{
 assert.match(posQuote,/applySstPolicy\(item,sstSettings\)/);
 assert.match(posQuote,/readSstSettings\(conn\)/);
 assert.match(posQuote,/cashCheckoutAvailable:!query.discountCode&&!query.voucherCode/);
 assert.match(readFileSync(new URL('../src/sst-policy.js',import.meta.url),'utf8'),/taxInclusive:false/);
});
