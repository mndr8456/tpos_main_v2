// Stock / Inventory UI integration regression — no live database writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,base),'utf8');
const app=read('frontend/src/App.jsx');
const inventory=read('frontend/src/Inventory.jsx');
const css=read('frontend/src/Inventory.css');
const router=read('backend/src/app.js');
const backend=read('backend/src/inventory.js');

test('Sidebar includes Stock / Inventory with permission and a real page',()=>{
 assert.match(app,/import Inventory from '\.\/Inventory\.jsx'/);
 assert.match(app,/canViewInventory=profile\.user\.permissions\.includes\('inventory\.view'\)/);
 assert.match(app,/id:'inventory',label:profile\.user\.role==='STAFF'\?'Stock':'Stock \/ Inventory'/);
 assert.match(app,/page==='inventory'&&canViewInventory\?<Inventory profile=\{profile\}/);
});
test('Stock page reads tenant balances and stockable product metadata, not fake stock fixtures',()=>{
 assert.match(inventory,/request\('\/inventory\/balances'\)/);
 assert.match(inventory,/request\('\/inventory\/meta'\)/);
 assert.match(inventory,/NOT INITIALIZED/);
 assert.match(inventory,/branchFilter/);
 assert.match(inventory,/statusFilter/);
 assert.doesNotMatch(inventory,/const sampleStocks|fakeBalances|mockInventory/);
});
test('Opening Stock requires OWNER/ADMIN, existing permission and explicit user action',()=>{
 assert.match(inventory,/permitted\('inventory\.opening'\)/);
 assert.match(inventory,/\['OWNER','ADMIN'\]/);
 assert.match(inventory,/request\('\/inventory\/opening',\{method:'POST',body\}\)/);
 assert.match(inventory,/crypto\.randomUUID\(\)/);
 assert.match(inventory,/Record Opening Stock/);
 assert.match(backend,/ensureOpeningAccess\(req\)/);
 assert.match(backend,/INVENTORY_OPENING_ALREADY_EXISTS/);
});
test('Safe inventory catalog is permission protected and does not expose product costs',()=>{
 assert.match(router,/app\.get\('\/api\/v2\/inventory\/meta',authenticate,permitted\('inventory\.view'\),inventoryMeta\)/);
 assert.match(backend,/function inventoryMeta\(req,res\)/);
 assert.match(backend,/authorizedBranches\(req,branchRows\[0\]\)/);
 const fn=backend.slice(backend.indexOf('export async function inventoryMeta'),backend.indexOf('export async function inventoryBalances'));
 assert.doesNotMatch(fn,/cost_price|average_cost|carrying_value/);
 assert.match(fn,/track_stock=1/);
});
test('Inventory page is scoped to existing R1 and cannot post sales, accounting or arbitrary adjustments',()=>{
 assert.doesNotMatch(inventory,/Physical Opening Stock is supported/);
 assert.match(inventory,/Opening Stock can be recorded only once per product and branch/);
 assert.match(inventory,/Recorded movements are append-only/);
 assert.doesNotMatch(inventory,/request\('\/pos\/checkout'|\/inventory\/adjustment|\/inventory\/receipt/);
 assert.match(inventory,/request\('\/inventory\/movements'\)/);
 assert.match(css,/\.inv-page/);
});
