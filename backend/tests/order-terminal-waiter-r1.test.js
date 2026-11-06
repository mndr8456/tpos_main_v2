import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canAccessBranch,isDineIn,waiterPayloadHash,rejectRepeatedProducts,cashierMayClaim} from '../src/waiter-order-rules.js';
const src=relative=>readFileSync(new URL(`../../${relative}`,import.meta.url),'utf8');
const sql=src('database/039_tenant_order_terminal.sql');
const api=src('backend/src/order-terminal.js');
const app=src('backend/src/app.js');
const ui=src('frontend/src/OrderTerminal.jsx');
const pos=src('frontend/src/PosTerminal.jsx');
const stock=src('backend/src/pos-drafts.js');
const tables=src('backend/src/restaurant-tables.js');
test('R1 waiter can send Take Away and Dine In, but both have strict table rules',()=>{
 assert.equal(isDineIn('DINE_IN'),true);assert.equal(isDineIn('TAKE_AWAY'),false);
 assert.match(api,/orderScope:z\.enum\(\['TAKE_AWAY','DINE_IN'\]\)/);
 assert.match(api,/isDineIn\(data\.orderScope\)!==Boolean\(data\.tableId\)/);
 assert.match(api,/WAITER_DINE_IN_NOT_SUPPORTED/);
});
test('R1 waiter does not require a Cash Shift; cashier receive does',()=>{
 const beforeClaim=api.slice(0,api.indexOf('export async function claimWaiterOrder'));
 assert.doesNotMatch(beforeClaim,/SELECT id FROM cash_shifts/);
 assert.match(api,/SELECT id FROM cash_shifts WHERE cashier_user_id=\? AND branch_id=\? AND status='OPEN'/);
 assert.match(api,/order_scope,table_id,status\) VALUES\([?.,]+,'HELD'/);
});
test('R1 waiter product and branch access is scoped, including managerial special access',()=>{
 assert.equal(canAccessBranch({role_code:'WAITER',branchIds:['2']},'2'),true);
 assert.equal(canAccessBranch({role_code:'WAITER',branchIds:['2']},'1'),false);
 assert.equal(canAccessBranch({role_code:'OWNER',branchIds:[]},'2'),true);
 assert.match(api,/canRead\(req,found\)/);
 assert.match(api,/o\.waiter_user_id=\?/);
});
test('R1 request fingerprint is deterministic and changes with line notes and quantity',()=>{
 const base={branchId:1,orderScope:'DINE_IN',tableId:2,orderNotes:'No onion',items:[{productId:5,quantity:'2',notes:'less spicy'}]};
 assert.equal(waiterPayloadHash(base),waiterPayloadHash({...base}));
 assert.notEqual(waiterPayloadHash(base),waiterPayloadHash({...base,items:[{...base.items[0],quantity:'3'}]}));
 assert.notEqual(waiterPayloadHash(base),waiterPayloadHash({...base,items:[{...base.items[0],notes:'more spicy'}]}));
 assert.equal(rejectRepeatedProducts([{productId:3},{productId:3}]),true);
 assert.equal(rejectRepeatedProducts([{productId:3},{productId:4}]),false);
});
test('R1 SQL preserves all financial and inventory tables and adds immutable, unique waiter staging',()=>{
 for(const k of ['waiter_orders','waiter_order_lines','waiter_order_audit','uq_waiter_request','uq_waiter_active_table','uq_waiter_pos_draft','active_table_id','fk_waiter_order_pos','fk_waiter_order_table','fk_waiter_line_product','order_terminal_r1_039'])assert.ok(sql.includes(k),k);
 assert.match(sql,/status='SUBMITTED'/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE|REPLACE)\s+(?:TABLE|FROM|INTO)\b|tpos_v1_/i);
});
test('R1 cashier may receive only when role and all three permissions permit it',()=>{
 const make=(role,permissions)=>({auth:{user:{role_code:role,permissions}}});
 const perms=['pos.view','pos.cart.manage','order_terminal.receive'];
 assert.equal(cashierMayClaim(make('CASHIER',perms)),true);
 assert.equal(cashierMayClaim(make('WAITER',perms)),false);
 assert.equal(cashierMayClaim(make('CASHIER',perms.slice(0,2))),false);
 assert.equal(cashierMayClaim(make('CASHIER',perms.slice(1))),false);
 assert.equal(cashierMayClaim(make('ADMIN',perms)),true);
});
test('R1 payment and stock posting never happen in waiter endpoint',()=>{
 assert.doesNotMatch(api,/\b(?:INSERT INTO|UPDATE)\s+(?:pos_sales|pos_sale_lines|inventory_movements|inventory_branch_balances|journal_entries|journal_lines|cash_shift_movements|voucher_reservations|payment_attempts)\b/i);
 assert.match(api,/INSERT INTO waiter_orders/);
 assert.match(api,/INSERT INTO pos_drafts/); // cashier claim only
});
test('R1 table protection checks POS and waiter occupancy in one locked flow',()=>{
 assert.match(api,/FROM restaurant_tables WHERE id=\? AND is_deleted=0 FOR UPDATE/);
 assert.match(api,/FROM pos_drafts WHERE active_table_id=\? LIMIT 1/);
 assert.match(api,/FROM waiter_orders WHERE active_table_id=\? LIMIT 1/);
 assert.match(stock,/SELECT id FROM waiter_orders WHERE active_table_id=\? LIMIT 1/);
 assert.match(tables,/LEFT JOIN waiter_orders w ON w\.active_table_id=t\.id/);
 assert.match(tables,/if\(row\|\|pending\)throw fail\('TABLE_HAS_ACTIVE_ORDER'/);
});
test('R1 existing cashier POS and Restaurant Tables display waiter table occupancy',()=>{
 assert.match(stock,/LEFT JOIN waiter_orders w ON w\.active_table_id=t\.id/);
 assert.match(stock,/CASE WHEN d\.id IS NULL AND w\.id IS NULL THEN t\.table_status ELSE 'OCCUPIED'/);
 assert.match(tables,/CASE WHEN d\.id IS NOT NULL OR w\.id IS NOT NULL THEN 'OCCUPIED'/);
});
test('R1 API roles have separate permission gates for waiter and cashier handoff',()=>{
 for(const code of ['order_terminal.view','order_terminal.create','order_terminal.cancel','order_terminal.receive'])assert.ok(app.includes(`permitted('${code}')`),code);
 assert.match(app,/claimWaiterOrder/);
 assert.doesNotMatch(app,/permitted\('pos\.checkout\.cash'\),claimWaiterOrder/);
});
test('R1 waiter order is atomic, replay-safe, and preserves product snapshots',()=>{
 assert.match(api,/await conn\.beginTransaction\(\)/);assert.match(api,/await conn\.commit\(\)/);assert.match(api,/await conn\.rollback\(\)/);
 assert.match(api,/previous\.request_hash!==hash/);
 assert.match(api,/WAITER_CONCURRENT_SUBMISSION_RETRY/);
 for(const code of ['product_name','sku','barcode','category_id','unit_code','quantity','unit_price','track_stock','product_type'])assert.ok(sql.includes(code));
});
test('R1 cancellation cannot undo already claimed orders',()=>{
 assert.match(api,/if\(o\.status!=='SUBMITTED'\)throw fail\('WAITER_ORDER_ALREADY_FINAL'/);
 assert.match(api,/status='CANCELLED',version=version\+1/);
 assert.match(api,/WAITER_ORDER_ALREADY_CLAIMED/);
});
test('R1 UI has both modes, no checkout, and separate cashier queue',()=>{
 assert.match(ui,/> Take Away</);assert.match(ui,/> Dine In</);
 assert.match(ui,/Send Order to Cashier/);assert.match(ui,/No stock or cash is posted here/);
 assert.match(pos,/Pending Waiter Orders/);assert.match(pos,/Receive into current cashier shift/);
 assert.match(pos,/setCurrent\(data\)/);
});
test('R1 new tenant migration and independent read-only installer are included',()=>{
 const tenant=src('backend/src/tenants.js'),install=src('backend/scripts/setup-order-terminal.js'),pkg=src('backend/package.json');
 assert.match(tenant,/executeSchema\(dbName,'038_tenant_inventory_bulk_opening.sql'\);\s*await executeSchema\(dbName,'039_tenant_order_terminal.sql'\)/);
 assert.match(install,/const apply=process\.argv\.includes\('--apply'\)/);
 assert.match(install,/ORDER_TERMINAL_TENANT_IDENTITY_MISMATCH/);
 assert.match(install,/if\(!apply\)/);
 assert.match(pkg,/"db:order-terminal"/);
});
test('R1 role matrix and default grants separate WAITER and CASHIER',()=>{
 const cat=src('backend/src/role-permission-catalog.js'),nav=src('frontend/src/role-navigation.js');
 assert.match(cat,/key":"order_terminal"/);
 assert.match(nav,/role==='WAITER' && hasPermission\(profile,'order_terminal.view'\)/);
 assert.match(sql,/r\.code IN \('WAITER','OWNER','ADMIN'\)/);
 assert.match(sql,/r\.code IN \('CASHIER','OWNER','ADMIN','MANAGER','SUPERVISOR'\)/);
 assert.match(sql,/order_terminal\.receive/);
});
