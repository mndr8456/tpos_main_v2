import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const jsx=readFileSync(new URL('../../frontend/src/PosCashReceipt.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../../frontend/src/PosCashReceipt.css',import.meta.url),'utf8');
test('R1.3 SST occupies a compact dedicated block directly after contact details',()=>{
 assert.match(jsx,/className="pos-receipt-sst"/);
 assert.ok(jsx.indexOf('r.email&&')<jsx.indexOf('className="pos-receipt-sst"'));
 assert.ok(jsx.indexOf('className="pos-receipt-sst"')<jsx.indexOf('pos-receipt-title'));
 assert.match(css,/\.pos-receipt-company \.pos-receipt-sst \{margin-top:-3px;font-size:11px;line-height:1\.25;border:0;padding:0\}/);
 assert.match(css,/\.pos-receipt-company \.pos-receipt-sst p \{margin:0 0 1px;font-size:inherit;line-height:inherit;border:0;padding:0\}/);
});
test('R1.3 leaves company name, SSM, address and taxes unchanged',()=>{
 assert.match(css,/\.pos-receipt-company h3 \{font-size:18px/);
 assert.match(css,/\.pos-receipt-company p \{margin:0 0 3px/);
 assert.match(jsx,/r\.ssmNumber\|\|r\.ssmOldNumber/);
 assert.match(jsx,/r\.serviceTaxNumber&&<p>/);
 assert.match(jsx,/r\.salesTaxNumber&&<p>/);
 assert.match(jsx,/taxLabel\('Sales Tax',r\.salesTaxRate\)/);
 assert.match(jsx,/taxLabel\('Service Tax',r\.serviceTaxRate\)/);
});
