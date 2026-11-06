import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stockForProduct,referenceCostForProduct,quantityForDisplay} from '../../frontend/src/product-inventory-sync.js';
const root=new URL('../../',import.meta.url);
const src=relative=>readFileSync(new URL(relative,root),'utf8');
const products=src('frontend/src/Products.jsx');
const inventory=src('frontend/src/Inventory.jsx');
const app=src('backend/src/app.js');
const api=src('backend/src/inventory.js');
const style=src('frontend/src/style.css');
const p={id:'144',sku:'PRD-000144',product_name:'AGLIO OLIO AYAM',product_type:'GOODS',product_structure:'SINGLE',track_stock:1};
const balances=[{product_id:'144',branch_id:'1',quantity_on_hand:'98.00'},{product_id:'144',branch_id:'2',quantity_on_hand:'7.25'}];

test('OWNER live Product stock reads actual Inventory QOH for selected branch only',()=>{
 assert.deepEqual(stockForProduct(p,'1',balances),{status:'INITIALIZED',label:'98.00'});
 assert.deepEqual(stockForProduct(p,'2',balances),{status:'INITIALIZED',label:'7.25'});
 assert.equal(stockForProduct(p,'3',balances).status,'NOT_INITIALIZED');
});
test('initialized zero stock differs from missing Opening Stock',()=>{
 assert.deepEqual(stockForProduct(p,'1',[{product_id:'144',branch_id:'1',quantity_on_hand:'0.00'}]),{status:'INITIALIZED',label:'0.00'});
 assert.equal(stockForProduct(p,'1',[]).label,'Not initialized');
});
test('Stock display does not leak QOH when inventory.view is missing',()=>{
 assert.deepEqual(stockForProduct(p,'1',balances,false),{status:'UNAVAILABLE',label:'—'});
 assert.deepEqual(stockForProduct({...p,track_stock:0},'1',balances),{status:'NOT_TRACKED',label:'Not tracked'});
 assert.equal(stockForProduct({...p,product_type:'SERVICE'},'1',balances).label,'Not tracked');
 assert.equal(stockForProduct({...p,product_structure:'BUNDLE'},'1',balances).label,'Not tracked');
});
test('high precision monetary-style integers are displayed as decimal strings, not float',()=>{
 assert.equal(quantityForDisplay('123456789012345.67'),'123,456,789,012,345.67');
 assert.equal(quantityForDisplay('1'),'1.00');
 assert.equal(quantityForDisplay('1.2'),'1.20');
 assert.equal(quantityForDisplay('1.234'),'—');
});
test('branch balances can be indexed by tenant product and branch ID',()=>{
 const index=new Map(balances.map(r=>[`${r.branch_id}:${r.product_id}`,r]));
 assert.equal(stockForProduct(p,'1',index).label,'98.00');
 assert.equal(stockForProduct(p,'2',index).label,'7.25');
 assert.equal(stockForProduct({...p,id:'145'},'1',index).status,'NOT_INITIALIZED');
});
test('Reference Purchase Cost 5.00 is suggested, not assumed to equal weighted average',()=>{
 const costs=[{productId:'144',referenceCost:'5.00'}];
 assert.equal(referenceCostForProduct(costs,'144'),'5.00');
 assert.equal(referenceCostForProduct(costs,'145'),null);
 assert.equal(referenceCostForProduct([{productId:'144',referenceCost:'0.00'}],'144'),'0.00');
 assert.equal(referenceCostForProduct([{productId:'144',referenceCost:'1.234'}],'144'),null);
});
test('Product stock table, View and Edit use Inventory API and read-only display',()=>{
 assert.match(products,/request\('\/inventory\/balances'\)/);
 assert.match(products,/request\('\/inventory\/meta'\)/);
 assert.match(products,/aria-label="Select Stock Branch"/);
 assert.match(products,/value=\{stockSummary\.label\} readOnly/);
 assert.match(products,/stockSummary=\{stockFor\(viewing\)\}/);
 assert.match(products,/stockSummary=\{edit==='new'\?/);
 assert.doesNotMatch(products,/Inventory module pending/);
 assert.doesNotMatch(products,/title="Inventory module pending"/);
 assert.match(style,/\.product-live-stock/);
});
test('Stock In and Opening Stock use read-only suggested cost but preserve actual cost input',()=>{
 assert.match(inventory,/request\('\/inventory\/reference-costs'\)/);
 assert.match(inventory,/referenceCostForProduct\(referenceCosts,initialProductId\)/);
 assert.match(inventory,/setUnitCost\(referenceCostForProduct\(referenceCosts,e\.target\.value\)\|\|'0\.00'\)/);
 assert.match(inventory,/onChange=\{e=>update\(setUnitCost\)\(e\.target\.value\)\}/);
 assert.match(inventory,/actual unit cost/i);
 assert.match(inventory,/Moving Weighted Average/);
});
test('Reference Cost API requires both inventory.view and products.cost.view',()=>{
 assert.match(app,/\/api\/v2\/inventory\/reference-costs',authenticate,permitted\('inventory\.view'\),inventoryReferenceCosts/);
 assert.match(api,/function inventoryReferenceCosts\(req,res\)/);
 assert.match(api,/permissions\.includes\('products\.cost\.view'\)/);
 assert.match(api,/INVENTORY_REFERENCE_COST_FORBIDDEN/);
 const meta=api.slice(api.indexOf('export async function inventoryMeta'),api.indexOf('export async function inventoryBalances'));
 assert.doesNotMatch(meta,/cost_price|average_cost|carrying_value/);
 assert.match(api,/set\('Cache-Control','no-store'\)/);
});
test('No Product Master quantity write, stock receipt still uses actual unit cost and immutable movements',()=>{
 assert.doesNotMatch(products,/\/inventory\/receive.*method:'POST'/);
 assert.match(api,/inventoryReceive as inventoryReceiveBalance/);
 assert.match(api,/const q=quantity2\(data\.quantity\),unit=cost2\(data\.unitCost\)/);
 assert.match(api,/INSERT INTO inventory_movements/);
 assert.match(inventory,/request\('\/inventory\/receive',\{method:'POST',body\}\)/);
});
