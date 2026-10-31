import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySstPolicy} from '../src/sst-policy.js';
import {calculatePosBill} from '../src/pos-bill.js';

const products=readFileSync(new URL('../../frontend/src/Products.jsx',import.meta.url),'utf8');
const pos=readFileSync(new URL('../../frontend/src/PosTerminal.jsx',import.meta.url),'utf8');
const styles=readFileSync(new URL('../../frontend/src/style.css',import.meta.url),'utf8');
const taxSettings=new Map([
 ['SALES_TAX',{isEnabled:true,registrationNumber:'REGISTERED-SALES',taxRate:'8.00'}],
 ['SERVICE_TAX',{isEnabled:true,registrationNumber:'REGISTERED-SERVICE',taxRate:'6.00'}]
]);

test('Product Add/Edit shows two explicit tax choices, without a hidden dropdown or inclusive flag',()=>{
 assert.match(products,/aria-label="SST Type"/);
 assert.match(products,/checked={form\.jkdmTaxType==='SALES_TAX'}/);
 assert.match(products,/checked={form\.jkdmTaxType==='SERVICE_TAX'}/);
 assert.match(products,/e\.target\.checked\?'SERVICE_TAX':'NONE'/);
 assert.match(products,/e\.target\.checked\?'SALES_TAX':'NONE'/);
 assert.match(products,/Leave both unchecked for No SST/);
 assert.doesNotMatch(products,/<Select label="SST Type"/);
 assert.doesNotMatch(products,/SST Price Inclusive/);
 assert.match(styles,/\.product-sst-choices\{display:grid;grid-template-columns:repeat\(2/);
});

test('A Service Tax product uses tenant Service Tax 6% independent of Sales Tax and Service Charge',()=>{
 const serviceItem=applySstPolicy({jkdm_tax_type:'SERVICE_TAX',jkdm_tax_inclusive:1,jkdm_tax_rate:'10.00'},taxSettings);
 assert.deepEqual(serviceItem,{taxType:'SERVICE_TAX',taxRate:'6.00',taxInclusive:false});
 const bill=calculatePosBill([{lineSen:2400,...serviceItem}],{serviceChargeRate:'10.00'});
 assert.equal(bill.salesTax,'0.00');
 assert.equal(bill.serviceTax,'1.44');
 assert.equal(bill.serviceCharge,'2.40');
 assert.equal(bill.roundingAdjustment,'+0.01');
 assert.equal(bill.total,'27.85');
});

test('Separate taxable Sales Tax and Service Tax products appear together in one bill',()=>{
 const sales=applySstPolicy({jkdm_tax_type:'SALES_TAX'},taxSettings);
 const service=applySstPolicy({jkdm_tax_type:'SERVICE_TAX'},taxSettings);
 const bill=calculatePosBill([{lineSen:2100,...sales},{lineSen:2400,...service}],{serviceChargeRate:'10.00'});
 assert.equal(bill.salesTax,'1.68');
 assert.equal(bill.serviceTax,'1.44');
 assert.equal(bill.serviceCharge,'4.50');
 assert.equal(bill.roundingAdjustment,'-0.02');
 assert.equal(bill.total,'52.60');
});

test('POS summary reads configured tax and service charge rates, not hard-coded percentages',()=>{
 assert.match(pos,/settingLabel\('Sales Tax',sst\?\.salesTax\)/);
 assert.match(pos,/settingLabel\('Service Tax',sst\?\.serviceTax\)/);
 assert.match(pos,/Service Charge \(\$\{formatPercent\(serviceCharge\.rate\)\}%\)/);
 assert.match(pos,/sst={preview\?\.sst} serviceCharge={preview\?\.serviceCharge}/);
 assert.doesNotMatch(pos,/const settingLabel=.*Sales Tax.*8%/);
});

test('Service Tax disabled at tenant level is not charged even if Product says Service Tax',()=>{
 const disabled=new Map(taxSettings);
 disabled.set('SERVICE_TAX',{...taxSettings.get('SERVICE_TAX'),isEnabled:false});
 const service=applySstPolicy({jkdm_tax_type:'SERVICE_TAX'},disabled);
 assert.equal(service.taxType,'NONE');
 assert.equal(calculatePosBill([{lineSen:2400,...service}]).serviceTax,'0.00');
});
