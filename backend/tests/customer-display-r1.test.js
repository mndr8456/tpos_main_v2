import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {hashDisplayToken,makeDisplayToken,validDisplayToken,canUseBranch,ownerRole,cashierRole,displayPaymentState,validatePromotionalMedia,PAIR_TTL_HOURS} from '../src/customer-display-rules.js';
import {totalDraftLines} from '../src/pos-money.js';
const read=p=>readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');
const sql=read('database/041_tenant_customer_display.sql');
const backend=read('backend/src/customer-display.js');
const app=read('backend/src/app.js');
const viewer=read('frontend/public/customer-display.js');
const ui=read('frontend/src/CustomerDisplaySettings.jsx');

test('CD R1: pairing token is random, scoped to tenant and stored only as SHA256',()=>{
 const token=makeDisplayToken('1'),next=makeDisplayToken('1');
 assert.match(token,/^1\.[\w-]{43}$/);assert.notEqual(token,next);assert.ok(validDisplayToken(token));
 assert.equal(hashDisplayToken(token).length,64);assert.equal(validDisplayToken('1.bad'),false);assert.equal(PAIR_TTL_HOURS,12);
 assert.match(backend,/token_hash/);assert.match(backend,/hashDisplayToken\(token\)/);assert.doesNotMatch(sql,/\btoken\s+VARCHAR/i);
});
test('CD R1: second pairing replaces previous cashier/branch token and invalidates the old one',()=>{
 assert.match(sql,/UNIQUE KEY uq_cd_cashier_branch\(branch_id,cashier_user_id\)/);
 assert.match(backend,/ON DUPLICATE KEY UPDATE token_hash=VALUES\(token_hash\)/);
 assert.match(sql,/UNIQUE KEY uq_cd_session_token\(token_hash\)/);
});
test('CD R1: branch access and owner-only config use actual authenticated role',()=>{
 const user=role_code=>({auth:{user:{role_code,permissions:['customer_display.manage','pos.view'],branchIds:['3']}}});
 assert.equal(ownerRole(user('OWNER')),true);assert.equal(ownerRole(user('ADMIN')),false);
 assert.equal(cashierRole(user('CASHIER')),true);assert.equal(cashierRole(user('WAITER')),false);
 assert.equal(canUseBranch(user('CASHIER'),3),true);assert.equal(canUseBranch(user('CASHIER'),4),false);
});
test('CD R1: cash change is shown first after REAL posted cash sale',()=>{
 const sale={payment_method:'CASH'};
 assert.equal(displayPaymentState({sale,elapsedSeconds:0}),'CASH_CHANGE');
 assert.equal(displayPaymentState({sale,elapsedSeconds:4}),'CASH_CHANGE');
 assert.equal(displayPaymentState({sale,elapsedSeconds:5}),'SUCCESS');
 assert.equal(displayPaymentState({sale,elapsedSeconds:16}),'SUCCESS');
 assert.equal(displayPaymentState({sale,elapsedSeconds:17}),'IDLE');
});
test('CD R1: QR success requires a real completed sale, never uploaded evidence alone',()=>{
 const pending={status:'PENDING',method_code:'DUITNOW_QR'};
 assert.equal(displayPaymentState({mode:'QR',attempt:pending}),'QR_PENDING');
 assert.equal(displayPaymentState({mode:'QR',attempt:{status:'FAILED',method_code:'DUITNOW_QR'}}),'ORDER');
 assert.equal(displayPaymentState({mode:'QR',attempt:{status:'PENDING',method_code:'BANK_TRANSFER'}}),'ORDER');
 assert.equal(displayPaymentState({sale:{payment_method:'DUITNOW_QR'},elapsedSeconds:0,mode:'QR',attempt:pending}),'SUCCESS');
});
test('CD R1: cash awaiting cashier and manual methods do not imply payment',()=>{
 assert.equal(displayPaymentState({mode:'CASH'}),'CASH_PENDING');
 assert.equal(displayPaymentState({mode:'MANUAL',attempt:{status:'PENDING',method_code:'BANK_TRANSFER'}}),'MANUAL_PENDING');
 assert.equal(displayPaymentState({mode:'CASH',draftStatus:'HELD'}),'IDLE');
});
test('CD R1: all relevant totals are calculated with the exact existing POS rounding function',()=>{
 const lines=totalDraftLines([{product_name:'A',quantity:'2.000',unit_price:'10.5000'},{product_name:'B',quantity:'3.000',unit_price:'2.0000'}]);
 assert.equal(lines.subtotal,'27.00');assert.equal(lines.lines[0].lineTotal,'21.00');
 assert.match(backend,/totalDraftLines\(rawLines\)\.lines/);assert.match(viewer,/fmt\(item\.lineTotal\)/);
});
test('CD R1: customer display quote respects current POS discount/voucher code and pricing rules',()=>{
 const pos=read('frontend/src/PosTerminal.jsx');
 assert.match(backend,/calculateDraftQuote\(conn,req,draftId,\{discountCode:discountCode\.toUpperCase\(\),voucherCode:voucherCode\.toUpperCase\(\)\}\)/);
 assert.match(pos,/current\?\.draft\?\.status/);
 assert.match(pos,/publishDisplay/);
 assert.match(pos,/discount=discountCode,voucher=voucherCode/);
 assert.match(pos,/discountCode:discountCode\.trim\(\)\.toUpperCase\(\),voucherCode:voucherCode\.trim\(\)\.toUpperCase\(\)/);
});
test('CD R1: tenant schema additive; no existing financial tables mutated',()=>{
 for(const t of ['customer_display_settings','customer_display_media','customer_display_sessions','customer_display_audit'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`));
 assert.doesNotMatch(sql,/\bDROP\s+|\bTRUNCATE\b|\bALTER\s+TABLE\b|\bDELETE\s+FROM\b|tpos_v1_/i);
 assert.match(sql,/customer_display_r1_041/);
});
test('CD R1: owner message defaults and timing rules are present',()=>{
 for(const key of ['success_english','success_malay','cash_change_seconds','success_seconds','media_interval_seconds','promotions_enabled'])assert.ok(sql.includes(key),key);
 assert.match(ui,/Payment Success — English/);assert.match(ui,/Payment Success — Bahasa Melayu/);
 assert.match(ui,/Save Settings/);
});
test('CD R1: validated PNG, JPEG and WebP media bytes are accepted, fake MIME rejected',()=>{
 const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),randomBytes(10)]);
 assert.deepEqual(validatePromotionalMedia('image/png',png.toString('base64')),png);
 assert.throws(()=>validatePromotionalMedia('image/png',Buffer.from('fake').toString('base64')),/CD_MEDIA_SIGNATURE_INVALID/);
 assert.throws(()=>validatePromotionalMedia('application/pdf',Buffer.from('%PDF').toString('base64')),/CD_MEDIA_TYPE_UNSUPPORTED/);
});
test('CD R1: MP4 is limited, signature checked and not treated as a payment image',()=>{
 const mp4=Buffer.concat([Buffer.from([0,0,0,24]),Buffer.from('ftyp'),randomBytes(20)]);
 assert.deepEqual(validatePromotionalMedia('video/mp4',mp4.toString('base64')),mp4);
 assert.throws(()=>validatePromotionalMedia('video/mp4',Buffer.from('bad').toString('base64')),/CD_MEDIA_SIGNATURE_INVALID/);
 assert.match(backend,/12\*1024\*1024|validatePromotionalMedia/);
});
test('CD R1: QR from actual configured Payment Methods, no fake generated QR',()=>{
 assert.match(backend,/JOIN payment_method_images i ON i\.setting_id=s\.id/);
 assert.match(backend,/s\.is_active=1/);
 assert.match(backend,/\['DUITNOW_QR','EWALLET'\]/);
 assert.doesNotMatch(backend,/fakeQr|demoQRCode|verifyWithBankAPI/);
});
test('CD R1: CASH and QR success derive from posted sale, not a client button',()=>{
 assert.match(backend,/FROM pos_sales WHERE draft_id=\?/);
 assert.match(backend,/displayPresentationState\(\{sale,elapsedSeconds/);
 assert.doesNotMatch(backend,/INSERT INTO pos_sales|INSERT INTO accounting_journals|inventory_movements|UPDATE pos_payment_attempts/);
 assert.doesNotMatch(viewer,/setStatus\(['"]SUCCESS|markPaid|fakePayment/);
});
test('CD R1: private evidence and merchant credentials are never in public response',()=>{
 const publicFunction=backend.split('export async function publicCustomerDisplayState')[1].split('export async function publicCustomerDisplayMedia')[0];
 for(const forbidden of ['evidence_data','payment_reference','api_key','account_password','merchant_api_key'])assert.doesNotMatch(publicFunction,new RegExp(forbidden));
 assert.match(publicFunction,/session\.merchant_name/);
});
test('CD R1: browser erases fragment token and polls in same origin with omitted credentials',()=>{
 assert.match(viewer,/history\.replaceState/);
 assert.match(viewer,/credentials:'omit'/);
 assert.match(viewer,/setInterval\(poll,2000\)/);
 assert.doesNotMatch(viewer,/localStorage|sessionStorage|document\.cookie/);
});
test('CD R1: slides and muted video play inside the promotion area',()=>{
 const html=read('frontend/public/customer-display.html');
 for(const mark of ['id="order-area"','id="promotion-area"','id="promotion-video"','id="order-lines"','id="qr-panel"','id="success-view"','id="cash-change"'])assert.ok(html.includes(mark),mark);
 assert.match(html,/<video[^>]*muted/);
 assert.match(viewer,/URL\.createObjectURL/);assert.match(viewer,/video\.muted=true/);
});
test('CD R1: cashier pairs own branch and POS posts only own current draft',()=>{
 const pos=read('frontend/src/PosTerminal.jsx');
 assert.match(pos,/Open Customer Display/);
 assert.match(pos,/customer-display\/pair/);
 assert.match(pos,/customer-display\/publish/);
 assert.match(backend,/cashier_user_id=\?/);
 assert.match(backend,/CD_ORDER_NOT_OWNED/);
});
test('CD R1: noncash mode switches from selected method only after real payment attempt starts',()=>{
 const ui=read('frontend/src/PosMultiPayment.jsx');
 assert.match(ui,/setAttempt\(next\);\s*await onDisplayMode/);
 assert.match(backend,/CD_PAYMENT_ATTEMPT_REQUIRED/);
 assert.match(backend,/attempt\.status!=='PENDING'/);
});
test('CD R1: owner and cashier endpoints are server protected; public endpoints only token-gated',()=>{
 for(const route of ['/customer-display/settings','/customer-display/media/upload','/customer-display/pair','/customer-display/publish','/customer-display/payment-mode','/customer-display/public/view'])assert.ok(app.includes(route),route);
 assert.match(backend,/requireOwner\(req\)/);
 assert.match(backend,/requireCashier\(req,'customer_display\.publish'/);
 assert.match(backend,/validPublicSession\(token\)/);
});
test('CD R1: migration 041 after locked KDS 040, independent read-only installer',()=>{
 const tenants=read('backend/src/tenants.js'),install=read('backend/scripts/setup-customer-display.js');
 assert.match(tenants,/executeSchema\(dbName,'040_tenant_kds.sql'\);\s*await executeSchema\(dbName,'041_tenant_customer_display.sql'\)/);
 assert.match(install,/const apply=process\.argv\.includes\('--apply'\)/);
 assert.match(install,/MARKER_WITH_PARTIAL_SCHEMA/);
 assert.match(install,/CD_SCHEMA_VERIFICATION_FAILED/);
});
test('CD R1: legacy manual QR display remains available and KDS stays protected',()=>{
 const cd=read('backend/src/app.js');assert.match(cd,/publicCustomerDisplay\); \/\/ Legacy/);
 assert.match(viewer,/pos\/customer-display\/view/);
 assert.match(cd,/app\.get\('\/api\/v2\/kds\/board'/);
 assert.match(cd,/app\.post\('\/api\/v2\/pos\/drafts\/:id\/checkout\/cash'/);
});
test('CD R1: frontend settings navigation is OWNER/ADMIN-view permission-driven',()=>{
 const appUI=read('frontend/src/App.jsx'),catalog=read('backend/src/role-permission-catalog.js');
 assert.match(appUI,/canViewCustomerDisplay/);assert.match(appUI,/id:'customer-display'/);
 assert.match(appUI,/page==='customer-display'&&canViewCustomerDisplay/);
 assert.match(catalog,/"key": "customer_display"/);
});
