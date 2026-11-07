// KDS R1 targeted non-database tests. MySQL integration remains a separate live PC acceptance gate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KDS_STATES,KDS_ACTIVE,isKdsTransition,isKdsStarted,canAccessKdsBranch,stationSummary} from '../src/kds-rules.js';
import {dispatchKitchenTicket,linkWaiterKitchenToPos,cancelPendingKitchenFromWaiter,cancelPendingKitchenFromPos} from '../src/kds-dispatch.js';
const src=x=>readFileSync(new URL('../../'+x,import.meta.url),'utf8');
const sql=src('database/040_tenant_kds.sql');const api=src('backend/src/kds.js');const waiter=src('backend/src/order-terminal.js');const app=src('backend/src/app.js');const pos=src('backend/src/pos-drafts.js');const board=src('frontend/src/KitchenDisplay.jsx');
const failing=()=>{throw Error('unexpected SQL')};
test('KDS R1: states are strictly forward and cancellation is a separate audited operation',()=>{
 assert.deepEqual([...KDS_STATES],['PENDING','PREPARING','READY','COMPLETED','CANCELLED']);
 assert.deepEqual([...KDS_ACTIVE],['PENDING','PREPARING','READY']);
 for(const [a,b] of [['PENDING','PREPARING'],['PREPARING','READY'],['READY','COMPLETED']])assert.equal(isKdsTransition(a,b),true);
 for(const [a,b] of [['PENDING','READY'],['PREPARING','PENDING'],['READY','PREPARING'],['COMPLETED','READY'],['CANCELLED','PREPARING']])assert.equal(isKdsTransition(a,b),false);
 assert.equal(isKdsStarted('PREPARING'),true);assert.equal(isKdsStarted('PENDING'),false);
});
test('KDS R1: group/line summary accurately distinguishes partial progress and cancellations',()=>{
 const lines=states=>states.map(status=>({status}));
 assert.equal(stationSummary(lines([])),'NONE');assert.equal(stationSummary(lines(['PENDING','PENDING'])),'PENDING');
 assert.equal(stationSummary(lines(['PENDING','PREPARING'])),'PREPARING');assert.equal(stationSummary(lines(['PREPARING','READY'])),'PREPARING');
 assert.equal(stationSummary(lines(['READY','COMPLETED'])),'READY');assert.equal(stationSummary(lines(['COMPLETED','COMPLETED'])),'COMPLETED');
 assert.equal(stationSummary(lines(['CANCELLED','CANCELLED'])),'CANCELLED');assert.equal(stationSummary(lines(['PENDING','CANCELLED'])),'PENDING');
});
test('KDS R1: branch authorization owner/admin or assigned branch only',()=>{
 assert.equal(canAccessKdsBranch({role_code:'KITCHEN',branchIds:['2']},2),true);
 assert.equal(canAccessKdsBranch({role_code:'KITCHEN',branchIds:['2']},1),false);
 assert.equal(canAccessKdsBranch({role_code:'OWNER',branchIds:[]},5),true);
});
test('KDS R1: first waiter dispatch persists only products marked Requires Preparation',async()=>{
 const queries=[];let id=15;
 const conn={execute:async(sql,params)=>{queries.push({sql,params});
  if(sql.startsWith('SELECT id FROM kds_tickets'))return [[/*none*/]];
  if(sql.includes('FROM waiter_order_lines l'))return [[{id:1,product_id:3,product_name:'Tomyam',sku:'TYM01',quantity:'2.000',unit_code:'PCS',line_notes:'Less spicy',station_id:1,station_code:'KITCHEN',station_name:'Kitchen',station_active:1},{id:2,product_id:4,product_name:'Teh Ais',sku:'TEH01',quantity:'1.000',unit_code:'PCS',line_notes:'Less ice',station_id:2,station_code:'DRINK',station_name:'Drink',station_active:1}]];
  if(sql.startsWith('SELECT table_number'))return [[{table_number:'T03'}]];
  if(sql.startsWith('INSERT INTO kds_tickets'))return [{insertId:id++}];
  if(sql.startsWith('INSERT INTO kds_ticket_lines')||sql.startsWith('INSERT INTO kds_ticket_audit'))return [{affectedRows:1}];
  return failing();
 }};
 const result=await dispatchKitchenTicket(conn,{source:'WAITER',sourceId:40,branchId:1,actorUserId:6,orderScope:'DINE_IN',tableId:10,orderNotes:'Serve together'});
 assert.equal(result.ticketId,'15');assert.equal(result.existing,false);
 assert.equal(queries.filter(q=>q.sql.startsWith('INSERT INTO kds_ticket_lines')).length,2);
 assert.equal(queries.find(q=>q.sql.startsWith('INSERT INTO kds_tickets')).params[1],40);
 assert.equal(queries.find(q=>q.sql.startsWith('INSERT INTO kds_tickets')).params[5],'T03');
 assert.match(queries.find(q=>q.sql.includes('FROM waiter_order_lines l')).sql,/p\.requires_preparation=1/);
 assert.equal(queries.find(q=>q.sql.startsWith('INSERT INTO kds_ticket_audit')).params[3],'DISPATCH');
});
test('KDS R1: replay of waiter dispatch returns same ticket without inserting a second',async()=>{
 let queries=0;const conn={execute:async(sql)=>{queries++;if(sql.startsWith('SELECT id FROM kds_tickets'))return [[{id:19}]];return failing();}};
 const result=await dispatchKitchenTicket(conn,{source:'WAITER',sourceId:1});assert.deepEqual(result,{ticketId:'19',existing:true,hasPreparation:true});assert.equal(queries,1);
});
test('KDS R1: items requiring no preparation generate no kitchen ticket',async()=>{
 const conn={execute:async(sql)=>{if(sql.startsWith('SELECT id FROM kds_tickets'))return [[]];if(sql.includes('FROM pos_draft_lines l'))return [[]];return failing();}};
 const out=await dispatchKitchenTicket(conn,{source:'POS',sourceId:34});assert.equal(out.hasPreparation,false);assert.equal(out.ticketId,null);
});
test('KDS R1: missing/inactive station is rejected before inserting ticket',async()=>{
 const conn={execute:async(sql)=>{if(sql.startsWith('SELECT id FROM kds_tickets'))return [[]];if(sql.includes('FROM waiter_order_lines l'))return [[{id:1,station_id:null,station_active:null}]];return failing();}};
 await assert.rejects(dispatchKitchenTicket(conn,{source:'WAITER',sourceId:3}),/KDS_PREPARATION_STATION_INVALID/);
});
test('KDS R1: cashier Receive links existing waiter ticket once without dispatching new one',async()=>{
 const sqls=[];const conn={execute:async(sql,params)=>{sqls.push(sql);if(sql.startsWith('SELECT id,pos_draft_id'))return [[{id:7,pos_draft_id:null}]];return [{affectedRows:1}];}};
 await linkWaiterKitchenToPos(conn,34,60,9);
 assert.equal(sqls.filter(x=>x.startsWith('UPDATE kds_tickets')).length,1);
 assert.equal(sqls.filter(x=>x.startsWith('INSERT INTO kds_tickets')).length,0);
 assert.match(src('backend/src/kds-dispatch.js'),/await kdsAudit\(conn,ticket.id,null,actorUserId,'LINK_POS'/);
});
test('KDS R1: waiter cancellation blocked if preparation started, otherwise cancels lines',async()=>{
 const conn={execute:async(sql)=>{if(sql.startsWith('SELECT id FROM kds_tickets'))return [[{id:7}]];if(sql.startsWith('SELECT id,status FROM kds_ticket_lines'))return [[{id:1,status:'PREPARING'}]];return failing();}};
 await assert.rejects(cancelPendingKitchenFromWaiter(conn,42,1,'Change request'),/WAITER_KITCHEN_ALREADY_STARTED/);
 const actions=[];const safe={execute:async(sql)=>{actions.push(sql);if(sql.startsWith('SELECT id FROM kds_tickets'))return [[{id:7}]];if(sql.startsWith('SELECT id,status FROM kds_ticket_lines'))return [[{id:1,status:'PENDING'}]];return [{affectedRows:1}];}};
 await cancelPendingKitchenFromWaiter(safe,42,1,'Customer cancelled');assert.ok(actions.some(x=>x.includes("status='CANCELLED'")));assert.ok(actions.some(x=>x.includes('INSERT INTO kds_ticket_audit')));
});
test('KDS R1: snapshot does not write sales, cash, inventory or accounting data',()=>{
 for(const file of [api,src('backend/src/kds-dispatch.js')])assert.doesNotMatch(file,/\b(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:pos_sales|pos_sale_lines|inventory_movements|inventory_branch_balances|journal_entries|journal_lines|cash_shift_movements|voucher_reservations|payment_attempts)\b/i);
});
test('KDS R1: secure APIs, read-own waiter/cashier status, no anonymous writes',()=>{
 for(const code of ['kds.view','kds.update_status','kds.dispatch','kds.cancel','kds.audit','order_terminal.view','pos.view'])assert.ok(app.includes(`permitted('${code}')`),code);
 assert.match(api,/KDS_SOURCE_NOT_OWNED/);assert.match(api,/KDS_BRANCH_DENIED/);assert.match(api,/KDS_CANCEL_REQUIRES_OWNER_ADMIN/);
});
test('KDS R1: original waiter submit dispatches atomically; cashier claim only links ticket',()=>{
 assert.match(waiter,/await dispatchKitchenTicket\(conn,\{source:'WAITER'/);
 assert.match(waiter,/await linkWaiterKitchenToPos\(conn,orderId,saved.insertId/);
 assert.match(waiter,/await cancelPendingKitchenFromWaiter\(conn,orderId/);
 assert.match(waiter,/await conn\.commit\(\)/);
 assert.match(pos,/POS_KDS_DISPATCHED_ORDER_LOCKED/);
});
test('KDS R1: SQL migration is additive, unique by original source, append-only audit',()=>{
 for(const t of ['kds_tickets','kds_ticket_lines','kds_ticket_audit','uq_kds_waiter_order','uq_kds_pos_draft','uq_kds_origin_line','kds_r1_040'])assert.ok(sql.includes(t),t);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE FROM|REPLACE INTO)\b/i);
 assert.match(sql,/FOREIGN KEY\(waiter_order_id\)/);
});
test('KDS R1: new tenant and existing tenant installer are explicit and safe',()=>{
 const tenant=src('backend/src/tenants.js'),installer=src('backend/scripts/setup-kds.js');
 assert.match(tenant,/executeSchema\(dbName,'039_tenant_order_terminal.sql'\);\s*await executeSchema\(dbName,'040_tenant_kds.sql'\)/);
 assert.match(installer,/const apply=process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/KDS_TENANT_IDENTITY_MISMATCH/);assert.match(installer,/MARKER_WITH_PARTIAL_SCHEMA/);
});
test('KDS R1: dashboard, station filters, full screen, print, sound, history and 10-second polling are real UI',()=>{
 for(const word of ['Kitchen Display','Preparation Station','Send','Start Preparing','Mark Ready','Full Screen','printTicket','soundAlert','10000','thresholdMinutes']){
  if(word==='thresholdMinutes')assert.match(src('backend/src/kds.js'),/thresholdMinutes/);else if(word==='Send')assert.match(src('frontend/src/PosTerminal.jsx'),/Send to Kitchen/);else assert.ok(board.includes(word),word);
 }
 assert.match(board,/new URLSearchParams/);assert.match(board,/onClick=\{\(\)=>updateLine\(l\)\}/);
 assert.match(board,/esc\(l\.product_name\)/);assert.match(board,/esc\(l\.line_notes\)/);
});
test('KDS R1: role navigation permits KITCHEN and does not create an empty POS draft',()=>{
 const nav=src('frontend/src/role-navigation.js'),appUI=src('frontend/src/App.jsx'),catalog=src('backend/src/role-permission-catalog.js');
 assert.match(nav,/role==='KITCHEN' && hasPermission\(profile,'kds.view'\)/);
 assert.match(appUI,/page==='kds'&&canViewKds/);assert.match(catalog,/"key":"kds"/);assert.doesNotMatch(catalog,/planned":true/);
 assert.match(src('frontend/src/PosTerminal.jsx'),/Hold & Send to Kitchen/);
 assert.match(src('backend/src/pos-drafts.js'),/await dispatchKitchenTicket\(conn/);
});

test('KDS R1: POS Discard cancels only untouched kitchen lines and refuses started kitchen',async()=>{
 const completed=[];
 const connection=states=>({execute:async(sql)=>{
  if(sql.startsWith('SELECT id FROM kds_tickets'))return [[{id:17}]];
  if(sql.startsWith('SELECT id,status FROM kds_ticket_lines'))return [states.map((status,i)=>({id:i+1,status}))];
  completed.push(sql);return [{affectedRows:1}];
 }});
 await assert.rejects(cancelPendingKitchenFromPos(connection(['PENDING','PREPARING']),32,5),/POS_KDS_CANCEL_REQUIRED/);
 assert.equal(completed.length,0);
 await cancelPendingKitchenFromPos(connection(['PENDING','PENDING']),32,5);
 assert.equal(completed.filter(x=>x.startsWith('UPDATE kds_ticket_lines')).length,2);
 assert.equal(completed.filter(x=>x.startsWith('INSERT INTO kds_ticket_audit')).length,2);
});
