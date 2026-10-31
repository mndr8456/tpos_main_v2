import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const view=read('frontend/src/PosTerminal.jsx');
const css=read('frontend/src/PosTerminal.css');
test('POS summary has separate Apply/Hide controls for Discount/Voucher and Sales/Services Tax',()=>{
 assert.match(view,/Discount \/ Voucher<\/span><button[^>]*aria-expanded=\{showAdjustments\}[^>]*aria-controls="pos-discount-fields"/);
 assert.match(view,/Sales \/ Services Tax<\/span><button[^>]*aria-expanded=\{showTaxDetails\}[^>]*aria-controls="pos-tax-details"/);
 assert.match(view,/\{showAdjustments\?'Hide':'Apply'\}/);
 assert.match(view,/\{showTaxDetails\?'Hide':'Apply'\}/);
 assert.ok(!view.includes('Apply / Preview'));
});
test('POS renders the full breakdown unconditionally, without opening either Apply panel',()=>{
 for(const value of ['Subtotal','Discount','Voucher','Sales Tax','Service Tax','Rounding Adjustment','Total'])assert.ok(view.includes(value),value);
 assert.match(view,/\{showAdjustments&&<DiscountFields[\s\S]*?\/>\}/);
 assert.match(view,/\{showTaxDetails&&<TaxDetails[\s\S]*?\/>\}/);
 assert.match(view,/<BillBreakdown bill=\{preview\?\.bill\}/);
 assert.ok(!/\{showAdjustments&&<BillBreakdown/.test(view));
 assert.ok(!/\{showTaxDetails&&<BillBreakdown/.test(view));
 assert.ok(!view.includes('Check Eligibility'));
 assert.ok(!view.includes('Provisional Total'));
});
test('Tax numbers stay tied to server quote and product settings, with no editable override',()=>{
 const backend=read('backend/src/pos-drafts.js');
 assert.match(view,/bill\?money\(bill\.salesTax\)/);
 assert.match(view,/bill\?money\(bill\.serviceTax\)/);
 assert.match(view,/bill\?money\(bill\.total\)/);
 assert.match(view,/bill\?rounding\(\)/);
 assert.match(view,/request\(`\/pos\/drafts\/\$\{current\.draft\.id\}\/quote`/);
 assert.match(backend,/SELECT id,jkdm_tax_type,jkdm_tax_rate,jkdm_tax_inclusive FROM products/);
 assert.ok(!view.includes('setSalesTaxRate'));
 assert.ok(!view.includes('setServiceTaxRate'));
});
test('POS toggles do not trigger quote; cart, code changes still trigger server auto-quote',()=>{
 assert.match(view,/useEffect\(\(\)=>\{[\s\S]*?setTimeout\(async\(\)=>/);
 assert.match(view,/discountCode,voucherCode(?:,taxRefreshKey)?\]\);/);
 assert.match(view,/setShowAdjustments\(false\);setShowTaxDetails\(false\)/);
 assert.match(css,/\.pos-bill-details/);
 assert.match(css,/\.pos-tax-details/);
});
