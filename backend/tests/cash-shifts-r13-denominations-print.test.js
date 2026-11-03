import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {openingDenominationTotal,OPENING_DENOMINATIONS} from '../src/cash-shift-denominations.js';
import {physicalCountTotal,centsAsMoney,SHIFT_DENOMINATIONS} from '../../frontend/src/cash-shift-denominations.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const file=p=>readFileSync(join(root,p),'utf8');
test('R1.3 denominations cover ten requested note/coin values exactly',()=>{
 assert.equal(Object.keys(OPENING_DENOMINATIONS).length,10);
 assert.deepEqual(new Set(Object.keys(OPENING_DENOMINATIONS)),new Set(SHIFT_DENOMINATIONS.map(d=>d.key)));
 assert.equal(openingDenominationTotal({'100':1,'50':2,'0.20':3,'0.05':1}),20065n);
 assert.equal(physicalCountTotal({'100':1,'50':2,'0.20':3,'0.05':1}),20065n);
 assert.equal(centsAsMoney(20065n),'200.65');
});
test('R1.3 denomination entry is optional and rejects bad counts',()=>{
 assert.equal(openingDenominationTotal(undefined),null);
 assert.equal(openingDenominationTotal({}),0n);
 for(const bad of [{'7':1},{'100':-1},{'100':0.5},{'100':'1'},{'100':100001}])assert.throws(()=>openingDenominationTotal(bad));
});
test('R1.3 opening note calculation is audited and validated against amount',()=>{
 const api=file('backend/src/cash-shifts.js'),ui=file('frontend/src/CashShifts.jsx');
 assert.match(api,/denominations:denominationsSchema/);
 assert.match(api,/SHIFT_DENOMINATION_TOTAL_MISMATCH/);
 assert.match(api,/denominations:data\.denominations/);
 assert.match(ui,/Count Notes & Coins \(optional\)/);
 assert.match(ui,/Total \(RM\)/);
 assert.match(ui,/useState\('0\.00'\)/);
});
test('R1.3 close totals keep cash expected and physical cash actual independent',()=>{
 const api=file('backend/src/cash-shifts.js'),ui=file('frontend/src/CashShifts.jsx');
 assert.match(api,/variance=counted-totalExpected/);
 assert.match(api,/posCashSales:fmtSen\(sales\)/);
 assert.match(ui,/setCounted\(v\)/);
 assert.match(ui,/physicalConfirmed/);
 assert.match(ui,/Expected Cash \(including POS\)/);
 assert.match(ui,/Opening Float/);
 assert.match(ui,/Sales Cash \(\+\)/);
 assert.match(ui,/EWallet \/ QR Code \(non-cash\)/);
});
test('R1.3 print receipt only follows confirmed shift closure and supports reprint',()=>{
 const ui=file('frontend/src/CashShifts.jsx'),css=file('frontend/src/style.css');
 assert.match(ui,/Close Shift \/ Print/);
 assert.match(ui,/const latest=await request\(`\/cash-shifts\/\$\{id\}`\)/);
 assert.match(ui,/setCloseReceipt\(latest\)/);
 assert.match(ui,/Print Close Receipt/);
 assert.match(ui,/window\.print\(\)/);
 assert.match(css,/#shift-closing-receipt/);
});
