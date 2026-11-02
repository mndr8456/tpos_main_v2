import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySstPolicy} from '../src/sst-policy.js';
import {calculatePosBill} from '../src/pos-bill.js';

const products=readFileSync(new URL('../../frontend/src/Products.jsx',import.meta.url),'utf8');
const backend=readFileSync(new URL('../src/pos-drafts.js',import.meta.url),'utf8');
const productApi=readFileSync(new URL('../src/products.js',import.meta.url),'utf8');
const settings=new Map([
 ['SALES_TAX',{isEnabled:true,taxRate:'8.00',registrationNumber:'SALES-REGISTERED'}],
 ['SERVICE_TAX',{isEnabled:true,taxRate:'10.00',registrationNumber:'SERVICE-REGISTERED'}]
]);

// Product Master stores eligibility/type; POS tax is exclusive using tenant rates.
test('Product Add/Edit headings reflect selected SST classification',()=>{
 assert.match(products,/form\.jkdmTaxType==='SALES_TAX'\?'SST — Sales Tax'/);
 assert.match(products,/form\.jkdmTaxType==='SERVICE_TAX'\?'SST — Service Tax'/);
 assert.match(products,/SST — No SST/);
 assert.match(products,/aria-label="SST Type"/);
 assert.match(products,/checked={form.jkdmTaxType==='SERVICE_TAX'}/);
 assert.match(products,/checked={form.jkdmTaxType==='SALES_TAX'}/);
 assert.doesNotMatch(products,/<h3>SST — Sales Tax &amp; Service Tax<\/h3>/);
});
test('Product editor removes inclusive checkbox and historical explanatory text',()=>{
 assert.doesNotMatch(products,/SST Price Inclusive/);
 assert.doesNotMatch(products,/SST will be added to the selling price/);
 assert.doesNotMatch(products,/<Field label="SST Rate \(\%\)"/);
 assert.match(products,/rate and On\/Off status come from your tenant's GST \/ SST Settings/i);
 assert.match(products,/onSave\(\{\.\.\.form,jkdmTaxInclusive:false/);
});
test('Product edits send exclusive value and keep existing Product API/CSV contracts',()=>{
 assert.match(products,/jkdmTaxInclusive:false/);
 assert.match(productApi,/jkdmTaxRate:d\.jkdmTaxRate,jkdmTaxInclusive:d\.jkdmTaxInclusive/);
 assert.match(products,/jkdm_tax_rate:p\.jkdm_tax_rate\|\|0/);
});
test('Product View identifies tenant settings as rate source rather than stale product rate',()=>{
 assert.match(products,/<Detail label="Rate Source">/);
 assert.doesNotMatch(products,/<Detail label="SST Rate \(%\)">/);
 assert.match(products,/product\.jkdm_tax_type==='SALES_TAX'\?'Sales Tax'/);
});
test('POS takes tenant Sales Tax rate and ignores legacy inclusive flag',()=>{
 const product={jkdm_tax_type:'SALES_TAX',jkdm_tax_rate:'2.50',jkdm_tax_inclusive:1};
 const policy=applySstPolicy(product,settings);
 assert.equal(policy.taxType,'SALES_TAX');
 assert.equal(policy.taxRate,'8.00');
 assert.equal(policy.taxInclusive,false);
 const bill=calculatePosBill([{lineSen:10000,...policy}]);
 assert.equal(bill.salesTax,'8.00');
 assert.equal(bill.salesTaxInclusive,'0.00');
 assert.equal(bill.total,'108.00');
 assert.match(backend,/readSstSettings\(conn\)/);
});
test('Service Tax remains separate, and tenant OFF prevents the charge',()=>{
 const product={jkdm_tax_type:'SERVICE_TAX',jkdm_tax_inclusive:0};
 assert.equal(applySstPolicy(product,settings).taxRate,'10.00');
 const bill=calculatePosBill([{lineSen:10000,...applySstPolicy(product,settings)}]);
 assert.equal(bill.serviceTax,'10.00');
 assert.equal(bill.salesTax,'0.00');
 const disabled=new Map(settings);
 disabled.set('SERVICE_TAX',{...settings.get('SERVICE_TAX'),isEnabled:false});
 const off=applySstPolicy(product,disabled);
 assert.equal(off.taxType,'NONE');
 assert.equal(calculatePosBill([{lineSen:10000,...off}]).serviceTax,'0.00');
});
