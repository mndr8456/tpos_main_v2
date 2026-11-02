import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySstPolicy,summarizePosSst} from '../src/sst-policy.js';
import {calculatePosBill} from '../src/pos-bill.js';
const src=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
const settings=(sales=true,service=false,rate='8.00')=>new Map([
 ['SALES_TAX',{isEnabled:sales,registrationNumber:'REGISTERED-SALES',taxRate:rate}],
 ['SERVICE_TAX',{isEnabled:service,registrationNumber:'',taxRate:'10.00'}]
]);
const cart=[{product_id:1,lineSen:10000},{product_id:2,lineSen:5000}];
const taxMap=(type1='NONE',type2='NONE')=>new Map([
 ['1',{jkdm_tax_type:type1,jkdm_tax_inclusive:0}],
 ['2',{jkdm_tax_type:type2,jkdm_tax_inclusive:0}]
]);
test('SST ON does not tax products with No SST classification; quote explains why',()=>{
 const cfg=settings(),taxes=taxMap(),policy=summarizePosSst(cfg,cart,taxes);
 assert.equal(policy.salesTax.enabled,true);
 assert.equal(policy.salesTax.rate,'8.00');
 assert.equal(policy.salesTax.matchingLines,0);
 const bill=calculatePosBill(cart.map(l=>({lineSen:l.lineSen,...applySstPolicy(taxes.get(String(l.product_id)),cfg)})));
 assert.equal(bill.salesTax,'0.00');
 assert.equal(bill.total,'150.00');
});
test('SST ON uses current tenant Sales Tax rate for only Sales Tax products',()=>{
 const cfg=settings(true,false,'8.00'),taxes=taxMap('SALES_TAX','NONE');
 const policy=summarizePosSst(cfg,cart,taxes);
 assert.equal(policy.salesTax.matchingLines,1);
 assert.equal(policy.salesTax.appliedLines,1);
 const bill=calculatePosBill(cart.map(l=>({lineSen:l.lineSen,...applySstPolicy(taxes.get(String(l.product_id)),cfg)})));
 assert.equal(bill.salesTax,'8.00');
 assert.equal(bill.total,'158.00');
});
test('Turning tenant Sales Tax OFF immediately stops quote tax for an already-classified item',()=>{
 const taxes=taxMap('SALES_TAX');
 const cfg=settings(false,false,'8.00');
 assert.equal(summarizePosSst(cfg,cart,taxes).salesTax.appliedLines,0);
 const bill=calculatePosBill(cart.map(l=>({lineSen:l.lineSen,...applySstPolicy(taxes.get(String(l.product_id)),cfg)})));
 assert.equal(bill.salesTax,'0.00');
});
test('POS tenant SST status reveals no registration number to cashier',()=>{
 const summary=summarizePosSst(settings(),cart,taxMap('NONE','NONE'));
 assert.equal(JSON.stringify(summary).includes('REGISTERED-SALES'),false);
 assert.equal(summary.salesTax.registrationConfigured,true);
 assert.equal(summary.serviceTax.enabled,false);
});
test('Backend quote reads tenant SST for each request and includes matching-item status',()=>{
 const api=src('backend/src/pos-drafts.js');
 assert.match(api,/const sstSettings=await readSstSettings\(conn\)/);
 assert.match(api,/summarizePosSst\(sstSettings,data\.lines,taxes\)/);
 assert.match(api,/discount,voucher,bill,sst/);
});
test('POS refreshes authoritative quote on return to active tab and manual Refresh',()=>{
 const ui=src('frontend/src/PosTerminal.jsx');
 assert.match(ui,/visibilitychange/);
 assert.match(ui,/taxRefreshKey\]\)/);
 assert.match(ui,/setTaxRefreshKey\(n=>n\+1\);refreshPage\(load,notify\)/);
 assert.match(ui,/pos-sst-summary/);
 assert.match(ui,/No matching products in this order/);
});
