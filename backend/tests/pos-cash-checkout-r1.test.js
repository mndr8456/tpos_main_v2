import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makePosCashJournal} from '../src/pos-cash-ledger.js';
const source=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const bill=(overrides={})=>({total:'45.65',subtotalBeforeTax:'41.50',salesTax:'0.00',serviceTax:'4.15',serviceCharge:'0.00',roundingAdjustmentSen:0,...overrides});
const balance=entries=>entries.reduce((a,l)=>a+BigInt(l.debit.replace('.',''))-BigInt(l.credit.replace('.','')),0n);
test('POS cash journal uses integer sen and balances cash, SST, revenue and COGS',()=>{
 const journal=makePosCashJournal(bill(),'17.50');
 assert.equal(balance(journal),0n);
 assert.deepEqual(journal.find(l=>l.accountCode==='1010'),{accountCode:'1010',debit:'45.65',credit:'0.00',description:'Cash received from POS sale'});
 assert.equal(journal.find(l=>l.accountCode==='2202').credit,'4.15');
 assert.equal(journal.find(l=>l.accountCode==='5010').debit,'17.50');
 assert.equal(journal.find(l=>l.accountCode==='1300').credit,'17.50');
});
test('BNM rounding gain and loss are posted separately and journals still balance',()=>{
 const gain=makePosCashJournal(bill({subtotalBeforeTax:'45.63',serviceTax:'0.00',total:'45.65',roundingAdjustmentSen:2}),'0.00');
 const loss=makePosCashJournal(bill({subtotalBeforeTax:'45.67',serviceTax:'0.00',total:'45.65',roundingAdjustmentSen:-2}),'0.00');
 assert.equal(balance(gain),0n);assert.equal(balance(loss),0n);
 assert.equal(gain.find(l=>l.accountCode==='4090').credit,'0.02');
 assert.equal(loss.find(l=>l.accountCode==='5090').debit,'0.02');
});
test('Unbalanced financial journals never post and missing money does not pass',()=>{
 assert.throws(()=>makePosCashJournal(bill({total:'45.60'}),'0.00'),/POS_ACCOUNTING_JOURNAL_UNBALANCED/);
 assert.throws(()=>makePosCashJournal(bill({total:'0.00',subtotalBeforeTax:'0.00',serviceTax:'0.00'}),'0.00'),/POS_ACCOUNTING_JOURNAL_UNBALANCED/);
});
test('Cash checkout persistence is one transaction, idempotent, and restricted to verified cash',()=>{
 const sql=source('database/024_tenant_pos_cash_checkout.sql');
 const js=source('backend/src/pos-cash-checkout.js');
 for(const table of ['pos_sales','pos_sale_lines','accounting_journals','accounting_journal_lines'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\b'));
 assert.match(sql,/UNIQUE KEY uq_pos_sale_request\(request_key\)/);assert.match(sql,/UNIQUE KEY uq_pos_sale_draft\(draft_id\)/);
 assert.match(sql,/ENUM\('CASH'\)/);assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM|tpos_v1_/i);
 assert.match(js,/await conn\.beginTransaction\(\)/);assert.match(js,/await conn\.rollback\(\)/);assert.match(js,/await conn\.commit\(\)/);
 assert.match(js,/await persistSaleReduction\(conn,/);
 assert.match(js,/assertReduction\(quote,codes\)/);
 assert.doesNotMatch(js,/throw err\('POS_CASH_CHECKOUT_DISCOUNT_VOUCHER_NOT_CONNECTED'/);
 assert.match(js,/cashReceived/);assert.match(js,/POS_CHECKOUT_REQUEST_KEY_CONFLICT/);
 assert.match(js,/FOR UPDATE/);assert.match(js,/inventoryIssue\(/);assert.match(js,/makePosCashJournal\(/);
 assert.match(js,/UPDATE pos_drafts SET status='COMPLETED'/);
 assert.match(sql,/ASSIGN_TABLE','COMPLETE'/);
});
test('POS checkout and receipt routes are authenticated and permissioned, SARA not marked paid',()=>{
 const app=source('backend/src/app.js'),ui=source('frontend/src/PosTerminal.jsx'),payment=source('frontend/src/PosMultiPayment.jsx'),setup=source('backend/scripts/setup-pos-cash-checkout.js');
 assert.match(app,/permitted\('pos.checkout.cash'\),customerDisplayAfterPos\('sale'\),cashCheckout/);
 assert.match(app,/permitted\('pos.view'\),getCashReceipt/);
 assert.match(setup,/--apply/);assert.match(setup,/POS_INVENTORY_023_REQUIRED/);
 assert.match(payment,/Confirm Cash Payment/);assert.match(payment,/Cash Received \(RM\)/);assert.match(payment,/SARA\/MyKasih and automatic provider transactions require a certified provider connection/);
 assert.doesNotMatch(app,/checkout\/sara/);
});
test('Cash shift close reconciles only persisted paid cash sales and locks shift',()=>{
 const shifts=source('backend/src/cash-shifts.js'),ui=source('frontend/src/CashShifts.jsx');
 assert.match(shifts,/SUM\(total\)/);assert.match(shifts,/payment_method='CASH' AND status='PAID'/);
 assert.match(shifts,/totalExpected=expected\+posCash/);assert.match(shifts,/variance=counted-totalExpected/);
 assert.match(shifts,/SHIFT_POS_CASH_BALANCE_CHANGED/);
 assert.match(ui,/expectedPosCash:String\(shift.posCashSales\)/);
});
