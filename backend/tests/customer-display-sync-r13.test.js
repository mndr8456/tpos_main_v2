import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../../'+f,import.meta.url),'utf8');
const ui=read('frontend/src/PosTerminal.jsx');
const api=read('backend/src/customer-display.js');
const checkout=read('backend/src/pos-cash-checkout.js');
const kds=read('backend/src/pos-drafts.js');
const mp=read('frontend/src/PosMultiPayment.jsx');
test('CD R1.3 pairing cannot be green unless the same cashier can publish',()=>{
 assert.match(api,/requireCashier\(req,'customer_display\.pair',branchId\);[\s\S]{0,350}requireCashier\(req,'customer_display\.publish',branchId\)/);
 assert.match(ui,/result\.viewReady!==true/);
 assert.match(ui,/setDisplayPairReady\(true\)/);
 assert.match(ui,/customerDisplayWindowRef\.current=popup/);
 assert.doesNotMatch(ui,/if\(synced\?\.paired!==true\|\|synced\?\.ignored\)throw Error/);
});
test('CD R1.5 payment mode asks backend to project authoritative cart without browser publish race',()=>{
 const body=ui.split('const displayMode=useCallback(')[1].split('// Customer Display R1.2')[0];
 assert.ok(body.includes("await request('/customer-display/payment-mode'"));
 assert.ok(!body.includes('await publishDisplay(current.draft.id)'));
 const backend=read('backend/src/customer-display.js');
 assert.match(backend,/await projectCustomerDisplayCart\(req,input\.draftId\)/);
 assert.match(ui,/if\(canPublishDisplay\)void displayMode\('CASH'\)/);
 assert.match(mp,/setAttempt\(next\);\s*await onDisplayMode/);
});
test('CD R1.3 a backend order-sync error is surfaced to the cashier, not silently swallowed',()=>{
 assert.match(ui,/Customer Display cannot sync the order:/);
 assert.match(ui,/Customer Display payment screen failed:/);
 assert.match(ui,/displaySyncWarningRef/);
 assert.match(ui,/\['DRAFT','HELD'\]\.includes\(current\?\.draft\?\.status\)/);
 assert.match(api,/calculateDraftQuote\(conn,req,draftId/);
});
test('CD R1.3 stale paid old order does not suppress new valid sale, active draft remains protected',()=>{
 assert.match(api,/previous\?\.status==='DRAFT'/);
 assert.match(api,/CD_DIFFERENT_ACTIVE_DRAFT/);
 assert.match(api,/FROM pos_sales WHERE id=\? AND draft_id=\? AND branch_id=\? AND cashier_user_id=\?/);
 assert.match(checkout,/await conn\.commit\(\)/);
});
test('KDS R1.3 Hold auto dispatch is atomic and requires explicit permission',()=>{
 assert.match(kds,/if\(data\.status==='HELD'\)/);
 assert.match(kds,/if\(has\(req,'kds\.dispatch'\)\)/);
 assert.match(kds,/KDS_DISPATCH_DENIED/);
 assert.match(kds,/await dispatchKitchenTicket\(conn/);
 assert.match(kds,/await conn\.execute\('UPDATE pos_drafts SET status=/);
 assert.match(ui,/Hold & Send to Kitchen/);
 assert.doesNotMatch(ui,/Hold this order before sending it to the kitchen/);
});
