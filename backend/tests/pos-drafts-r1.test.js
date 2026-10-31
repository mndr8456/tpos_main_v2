import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {totalDraftLines,amountSen} from '../src/pos-money.js';
const src=async p=>readFile(new URL(`../../${p}`,import.meta.url),'utf8');
const item=(quantity,unit_price,overrides={})=>({product_id:'1',product_name:'Test',quantity,unit_price,category_id:'1',...overrides});
test('POS draft money uses exact four-decimal unit price times three-decimal quantity with sen rounding',()=>{
 const a=totalDraftLines([item('3.000','7.1234')]);assert.equal(a.subtotal,'21.37');assert.equal(a.lines[0].lineTotal,'21.37');
 const b=totalDraftLines([item('1.000','0.0050')]);assert.equal(b.subtotal,'0.01');
 const c=totalDraftLines([item('0.333','3.3333'),item('2.000','0.0100')]);assert.equal(c.subtotal,'1.13');
 assert.equal(amountSen('7.5050'),751);
});
test('POS draft money rejects invalid quantity, negative and unsafe high prices',()=>{
 for(const v of ['-1','0','1001.000','1.0001','0.000'])assert.throws(()=>totalDraftLines([item(v,'1.0000')]));
 for(const v of ['-1','2.12345','abc'])assert.throws(()=>totalDraftLines([item('1.000',v)]));
});
test('POS SQL 017 is append-safe and has immutable audit plus idempotency and optimistic version',async()=>{
 const sql=await src('database/017_tenant_pos_drafts.sql');
 for(const t of ['pos_drafts','pos_draft_lines','pos_draft_commands','pos_draft_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`));
 assert.match(sql,/UNIQUE KEY uq_pos_draft_create_request\(request_key\)/);
 assert.match(sql,/UNIQUE KEY uq_pos_draft_command\(draft_id,request_key\)/);
 assert.match(sql,/version INT UNSIGNED NOT NULL DEFAULT 1/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM|UPDATE cash_shifts|INSERT INTO (?:pos_sales|cash_shift_movements)/i);
});
test('POS draft writes only own shift and applies branch guard, status and version',async()=>{
 const js=await src('backend/src/pos-drafts.js');
 assert.match(js,/cashier_user_id=\? AND branch_id=\? AND status='OPEN'/);
 assert.match(js,/POS_DRAFT_NOT_OWNED/);assert.match(js,/POS_BRANCH_NOT_ASSIGNED/);
 assert.match(js,/POS_DRAFT_VERSION_CHANGED/);assert.match(js,/POS_REQUEST_KEY_REUSED/);
 assert.match(js,/const digest=createHash\('sha256'\)/);assert.match(js,/await conn\.beginTransaction\(\)/);
 assert.match(js,/await conn\.rollback\(\)/);assert.match(js,/POS_ORIGINAL_SHIFT_CLOSED/);
});
test('POS draft quote does not post sale, reduce stock, consume voucher or mark payment paid',async()=>{
 const js=await src('backend/src/pos-drafts.js');
 assert.match(js,/evaluateDiscount\(/);assert.match(js,/evaluateVoucher\(/);
 assert.match(js,/POS_STACKING_POLICY_NOT_APPROVED/);assert.match(js,/checkoutAvailable:false/);
 assert.doesNotMatch(js,/INSERT INTO (?:sales|pos_sales|sale_payments|voucher_reservations|cash_shift_movements)|UPDATE (?:products|vouchers|discounts) SET/i);
});
test('POS draft APIs require authentication and grants',async()=>{
 const api=await src('backend/src/app.js');
 for(const route of ['/pos/bootstrap','/pos/drafts','/pos/drafts/:id/lines','/pos/drafts/:id/quote'])assert.ok(api.includes(route));
 assert.match(api,/permitted\('pos\.cart\.manage'\)/);assert.match(api,/permitted\('pos\.view'\)/);
 const sql=await src('database/017_tenant_pos_drafts.sql');assert.match(sql,/('OWNER','ADMIN','MANAGER','SUPERVISOR','CASHIER')/);
});
test('POS new tenants and existing installers are isolated, non-destructive and 017 only',async()=>{
 const setup=await src('backend/scripts/setup-pos-drafts.js'),tenant=await src('backend/src/tenants.js');
 assert.match(setup,/--apply/);assert.match(setup,/read-only/);assert.match(setup,/017_tenant_pos_drafts.sql/);
 assert.match(tenant,/executeSchema\(dbName,'017_tenant_pos_drafts.sql'\)/);
 assert.doesNotMatch(setup,/002_tenant_foundation.sql|007_tenant_products.sql/);
});
test('POS terminal is a business-aware product-grid terminal with persistent orders, no fake checkout',async()=>{
 const ui=await src('frontend/src/PosTerminal.jsx'),app=await src('frontend/src/App.jsx');
 for(const x of ['New Order','CURRENT ORDER','Scan barcode','Hold','Resume','Discard','Sales / Services Tax','Order Activity Log','Payment / Checkout'])assert.ok(ui.includes(x),`Missing ${x}`);
 for(const code of ['RESTAURANT','CAFE','FOOD_TRUCK','STREET_FOOD','GROCERY','RETAIL','MINI_MARKET'])assert.ok(ui.includes(code));
 assert.match(ui,/Checkout locked until integrations are verified/);
 assert.match(ui,/request\('\/pos\/drafts'/);
 assert.match(app,/PosTerminal/);assert.match(app,/canViewPos/);
});
