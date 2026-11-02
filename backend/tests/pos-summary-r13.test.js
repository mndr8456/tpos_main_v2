import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
test('POS total display follows business-approved summary, without obsolete provisional/eligibility language',()=>{
 const view=read('frontend/src/PosTerminal.jsx');
 for(const x of ['Subtotal','Discount / Voucher','Sales / Services Tax','Sales Tax','Service Tax','Rounding Adjustment','Total','Apply'])assert.ok(view.includes(x),x);
 for(const x of ['Check Eligibility','Provisional Total','Taxes, service charge, rounding and finalized totals require checkout integration.','Estimated balance','Estimates exclude final tax'])assert.ok(!view.includes(x),`Obsolete string: ${x}`);
 assert.match(view,/\/pos\/drafts\/\$\{current.draft.id\}\/quote/);
 assert.match(view,/useEffect\(\(\)=>\{[\s\S]*setTimeout\(async/);
 assert.match(view,/<BillBreakdown bill=\{preview\?\.bill\}/);
});
test('Backend quote derives tax from tenant products and returns server-authoritative bill',()=>{
 const api=read('backend/src/pos-drafts.js');
 const engine=read('backend/src/pos-bill.js');
 assert.match(api,/SELECT id,jkdm_tax_type,jkdm_tax_rate,jkdm_tax_inclusive FROM products/);
 assert.match(api,/const bill=calculatePosBill\(/);
 assert.match(api,/cashCheckoutAvailable:!query.discountCode&&!query.voucherCode/);
 assert.ok(!engine.includes('lhdn_tax_rate'),'Do not treat LHDN e-Invoice as JKDM SST configuration');
});
