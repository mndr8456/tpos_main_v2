import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inventoryOpening,inventoryReceive,inventoryIssue} from '../src/inventory-cost.js';
const root=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
test('Inventory opening uses two-decimal quantities, costs and carrying value',()=>{
 const r=inventoryOpening('18','2.76');
 assert.deepEqual(r,{quantity:'18.00',carryingValue:'49.68',averageCost:'2.76'});
 assert.deepEqual(inventoryOpening('0','0'),{quantity:'0.00',carryingValue:'0.00',averageCost:'0.00'});
 assert.throws(()=>inventoryOpening('18','2.75666667'));
});
test('Moving weighted average is branch balance value divided by quantity, not product reference cost',()=>{
 const original=inventoryOpening('2','2.00');
 const r=inventoryReceive(original,'3','4.00');
 assert.equal(r.quantity,'5.00');
 assert.equal(r.carryingValue,'16.00');
 assert.equal(r.averageCost,'3.20');
});
test('Issue deducts historical value proportionally and last issue clears residual exactly',()=>{
 const start=inventoryOpening('3','0.33');
 const partial=inventoryIssue(start,'1');
 assert.equal(partial.issuedCost,'0.33');
 const rest=inventoryIssue(partial,'2');
 assert.equal(rest.quantity,'0.00');
 assert.equal(rest.carryingValue,'0.00');
 assert.equal(rest.averageCost,'0.00');
 assert.equal(rest.issuedCost,'0.66');
});
test('Invalid, negative, excessive precision and oversell inputs fail closed',()=>{
 for(const value of ['-1','1.001','1.0000001','NaN','1e2','01','10000000000000000',''])assert.throws(()=>inventoryOpening(value,'1'));
 for(const value of ['-0.01','1.001','1.000000001','NaN','1e2',''])assert.throws(()=>inventoryOpening('1',value));
 assert.throws(()=>inventoryOpening('0','1'),/INVENTORY_ZERO_OPENING_COST/);
 assert.throws(()=>inventoryIssue(inventoryOpening('1','2.00'),'2'),/INVENTORY_INSUFFICIENT_STOCK/);
});
test('Historical SQL 022 stays unchanged; 023 migrates all inventory decimals to 18,2',()=>{
 const sql=read('database/022_tenant_inventory_foundation.sql');
 for(const snippet of ['CREATE TABLE IF NOT EXISTS inventory_branch_balances','CREATE TABLE IF NOT EXISTS inventory_movements','PRIMARY KEY(branch_id,product_id)','UNIQUE KEY uq_inventory_request(request_key)','quantity_on_hand DECIMAL(18,6)','carrying_value DECIMAL(24,8)','average_cost DECIMAL(18,8)','FOREIGN KEY(actor_user_id) REFERENCES users(id)'])assert.ok(sql.includes(snippet),snippet);
 assert.doesNotMatch(sql,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE products|CREATE DATABASE)\b/i);
 const sql2=read('database/023_tenant_inventory_two_decimals.sql');
 for(const column of ['quantity_on_hand','carrying_value','average_cost','quantity_delta','value_delta','quantity_after','carrying_value_after','average_cost_after'])assert.match(sql2,new RegExp('MODIFY COLUMN '+column+' DECIMAL\\(18,2\\) NOT NULL'));
 assert.doesNotMatch(sql2,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE products|CREATE DATABASE)\b/i);
});
test('Opening endpoint requires OWNER/ADMIN plus explicit permission, locks DB and commits balance + movement together',()=>{
 const source=read('backend/src/inventory.js');
 for(const snippet of ["['OWNER','ADMIN']","inventory.opening","await conn.beginTransaction()","FOR UPDATE","await conn.commit()","await conn.rollback()","INSERT INTO inventory_branch_balances","INSERT INTO inventory_movements","INVENTORY_OPENING_ALREADY_EXISTS","INVENTORY_REQUEST_KEY_REUSED"])assert.ok(source.includes(snippet),snippet);
 assert.doesNotMatch(source,/UPDATE products SET cost_price|INSERT INTO pos_sales|UPDATE cash_shifts/);
});
test('POS displays quantity without transmitting cost, and cannot finalize checkout',()=>{
 const backend=read('backend/src/pos-drafts.js');
 const ui=read('frontend/src/PosTerminal.jsx');
 assert.match(backend,/SELECT branch_id,product_id,quantity_on_hand FROM inventory_branch_balances/);
 assert.match(backend,/stockLevels:stockRows\.map/);
 assert.match(ui,/Stock: Not initialized/);
 assert.match(ui,/stockMap\.get/);
 assert.match(backend,/checkoutAvailable:false/);
 assert.match(ui,/PosMultiPayment/);
 assert.match(read('frontend/src/PosMultiPayment.jsx'),/SARA\/MyKasih and automatic provider transactions require a certified provider connection/);
});
test('Inventory installer inspects by default and provisions new tenants after 021, without modifying approved modules',()=>{
 const installer=read('backend/scripts/setup-inventory-foundation.js');
 const tenant=read('backend/src/tenants.js');
 const packageJson=JSON.parse(read('backend/package.json'));
 assert.match(installer,/process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/PARTIAL_SCHEMA_REQUIRES_MANUAL_REVIEW/);
 assert.ok(tenant.indexOf("'022_tenant_inventory_foundation.sql'")>tenant.indexOf("'021_tenant_restaurant_tables.sql'"));
 assert.ok(tenant.indexOf("'023_tenant_inventory_two_decimals.sql'")>tenant.indexOf("'022_tenant_inventory_foundation.sql'"));
 assert.equal(packageJson.scripts['db:inventory:2dp'],'node scripts/setup-inventory-two-decimals.js');
 assert.equal(packageJson.scripts['db:inventory'],'node scripts/setup-inventory-foundation.js');
});
