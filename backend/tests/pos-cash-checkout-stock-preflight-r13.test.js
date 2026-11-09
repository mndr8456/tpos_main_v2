// Operator-facing preflight never bypasses server-side stock locks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {findCheckoutStockBlockers} from '../../frontend/src/pos-checkout-stock.js';

const base=dirname(fileURLToPath(import.meta.url));
const pos=readFileSync(resolve(base,'../../frontend/src/PosTerminal.jsx'),'utf8');
const backend=readFileSync(resolve(base,'../src/pos-cash-checkout.js'),'utf8');
const payment=readFileSync(resolve(base,'../../frontend/src/PosMultiPayment.jsx'),'utf8');
const row=(product_id,qty,branch_id='1')=>({product_id,branch_id,quantity_on_hand:qty});
const item=(product_id,qty,track_stock=1)=>({product_id,quantity:qty,track_stock,product_name:`Product ${product_id}`});

test('preflight lists tracked products missing opening stock but ignores services',()=>{
 assert.deepEqual(findCheckoutStockBlockers([item(1,'1.000'),item(2,'1.000',0)],[], '1').map(x=>x.reason),['NOT_INITIALIZED']);
});
test('preflight validates stock within branch and sufficient total quantity',()=>{
 const result=findCheckoutStockBlockers([item(1,'1.000'),item(1,'2.000')],[row(1,'2.00','1'),row(1,'100.00','2')],'1');
 assert.equal(result.length,1);
 assert.deepEqual({reason:result[0].reason,required:result[0].required,available:result[0].available},{reason:'INSUFFICIENT',required:'3.00',available:'2.00'});
});
test('preflight preserves precision rules and accepts whole quantity stored as 3 decimals',()=>{
 assert.equal(findCheckoutStockBlockers([item(1,'1.000')],[row(1,'2.00')],'1').length,0);
 assert.equal(findCheckoutStockBlockers([item(1,'1.005')],[row(1,'2.00')],'1')[0].reason,'INVALID_QUANTITY');
});
test('preflight uses exact hundredth integers for large quantities',()=>{
 assert.equal(findCheckoutStockBlockers([item(1,'100000.01')],[row(1,'100000.00')],'1')[0].reason,'INSUFFICIENT');
});
test('POS payment modal names missing stock and retains inline backend errors',()=>{
 assert.match(pos,/findCheckoutStockBlockers\(currentLines,bootstrap\.stockLevels,branchId\)/);
 assert.match(payment,/stockIssues\.length>0&&<div className="pos-checkout-stock-alert" role="alert"/);
 assert.match(payment,/disabled=Boolean\(busy\|\|working\|\|recovering\|\|stockIssues\.length/);
 assert.match(pos,/setPaymentError\(message\);notify\(message,true\)/);
});
test('backend remains authoritative: locks inventory and rejects missing stock',()=>{
 assert.match(backend,/inventory_branch_balances WHERE branch_id=\? AND product_id=\? FOR UPDATE/);
 assert.match(backend,/if\(!balance\)throw err\('POS_STOCK_NOT_INITIALIZED'\)/);
 assert.match(backend,/await conn\.rollback\(\)/);
});
