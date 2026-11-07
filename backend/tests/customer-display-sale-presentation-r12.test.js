import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {displayPresentationState,displayPaymentState,canUseBranch,cashierRole} from '../src/customer-display-rules.js';

const read=file=>readFileSync(new URL(`../../${file}`,import.meta.url),'utf8');
const backend=read('backend/src/customer-display.js');
const app=read('backend/src/app.js');
const pos=read('frontend/src/PosTerminal.jsx');
const sql=read('database/041_tenant_customer_display.sql');

const cash={id:'51',payment_method:'CASH'};
const qr={id:'52',payment_method:'DUITNOW_QR'};
const state=(sale,presentation,age,overrides={})=>displayPresentationState({sale,presentation,presentationElapsedSeconds:age,elapsedSeconds:age,cashSeconds:5,successSeconds:12,...overrides});

test('CD R1.2: posted cash shows change then Thank You while receipt remains open',()=>{
 const p={saleId:'51',receiptOpen:true,remainingChangeSeconds:0};
 assert.equal(state(cash,p,0),'CASH_CHANGE');
 assert.equal(state(cash,p,4),'CASH_CHANGE');
 assert.equal(state(cash,p,5),'SUCCESS');
 assert.equal(state(cash,p,25),'SUCCESS'); // R1 bug: previously IDLE after 17 seconds
 assert.equal(state(cash,p,89),'SUCCESS');
 assert.equal(state(cash,p,90),'IDLE'); // safety fallback on forgotten receipt
});
test('CD R1.2: early cashier receipt close never skips the cash change, then full Owner message duration',()=>{
 const p={saleId:'51',receiptOpen:false,remainingChangeSeconds:4};
 assert.equal(state(cash,p,0),'CASH_CHANGE');
 assert.equal(state(cash,p,3),'CASH_CHANGE');
 assert.equal(state(cash,p,4),'SUCCESS');
 assert.equal(state(cash,p,15),'SUCCESS');
 assert.equal(state(cash,p,16),'IDLE');
});
test('CD R1.2: after late receipt dismissal Thank You lasts its full Owner-configured time',()=>{
 const p={saleId:'51',receiptOpen:false,remainingChangeSeconds:0};
 assert.equal(state(cash,p,0),'SUCCESS');
 assert.equal(state(cash,p,11),'SUCCESS');
 assert.equal(state(cash,p,12),'IDLE');
 assert.equal(state(cash,p,19,{successSeconds:20}),'SUCCESS');
});
test('CD R1.2: QR payment only succeeds for a posted sale, never a pending attempt',()=>{
 assert.equal(state(qr,{saleId:'52',receiptOpen:true},60),'SUCCESS');
 assert.equal(state(qr,{saleId:'52',receiptOpen:false},11),'SUCCESS');
 assert.equal(state(qr,{saleId:'52',receiptOpen:false},12),'IDLE');
 assert.equal(displayPresentationState({sale:null,mode:'QR',attempt:{status:'PENDING',method_code:'DUITNOW_QR'},presentation:{saleId:'52',receiptOpen:true}}),'QR_PENDING');
 assert.equal(displayPaymentState({sale:null,mode:'CASH'}),'CASH_PENDING');
});
test('CD R1.2: old sale presentation cannot falsely validate a different sale',()=>{
 const old={saleId:'50',receiptOpen:true};
 assert.equal(state(qr,old,18),'IDLE');
 assert.equal(state(null,{saleId:'51',receiptOpen:true},30),'ORDER');
});
test('CD R1.2: POS and authenticated route notify CD only after real posted sale; receipts can close it',()=>{
 assert.match(pos,/announcePaidToDisplay\(result\.receipt,current\.draft\.id\)/);
 assert.match(pos,/announcePaidToDisplay\(paidReceipt,current\?\.draft\?\.id\)/);
 assert.match(pos,/title="Close receipt" onClick=\{closePaidReceipt\}/);
 assert.match(pos,/onClick=\{closePaidReceipt\}>Close/);
 assert.match(pos,/receiptOpen:true/);
 assert.match(pos,/receiptOpen:false/);
 assert.match(app,/app\.post\('\/api\/v2\/customer-display\/sale-presentation',authenticate,customerDisplaySalePresentation\)/);
 assert.match(backend,/FROM pos_sales WHERE id=\? AND draft_id=\? AND branch_id=\? AND cashier_user_id=\?/);
 assert.doesNotMatch(backend,/\bUPDATE pos_sales\b|\bINSERT INTO pos_sales\b|\bUPDATE inventory_movements\b/);
 assert.doesNotMatch(sql,/\bALTER\b|\bDROP\b|\bTRUNCATE\b/);
});

function backendHarness({hasSale=true,hasSession=true,paidMethod='CASH',elapsedSinceStart=2,sessionDraftId=30,previousStatus='COMPLETED'}={}){
 const chain=new Proxy({parse:v=>v},{get:(target,key)=>key==='parse'?target.parse:()=>chain});
 const z={coerce:{number:()=>chain},object:()=>chain,string:()=>chain,number:()=>chain,enum:()=>chain,boolean:()=>chain};
 const stored={id:21,branch_id:1,cashier_user_id:10,draft_id:sessionDraftId,snapshot:JSON.stringify({version:1,lines:[]}),expires_at:'2099-01-01',updated_at:'2026-11-07',mode:'CASH'};
 const logs=[];let commits=0,rollbacks=0;
 const conn={
  async beginTransaction(){},async commit(){commits++},async rollback(){rollbacks++},release(){},
  async execute(sql,args=[]){
   logs.push({sql,args});
   if(sql.includes('FROM customer_display_sessions WHERE branch_id=? AND cashier_user_id=? FOR UPDATE'))return [hasSession?[{...stored}]:[]];
   if(sql.includes('UTC_TIMESTAMP(6)>? AS expired'))return [[{expired:0}]];
   if(sql.includes('SELECT status FROM pos_drafts WHERE id=? AND branch_id=? AND cashier_user_id=?'))return [[{status:previousStatus}]];
   if(sql.includes('FROM pos_sales WHERE id=? AND draft_id=?')){
    assert.deepEqual([...args],[51,30,1,10]);
    return [hasSale?[{id:51,payment_method:paidMethod}]:[]];
   }
   if(sql.includes('SELECT cash_change_seconds FROM customer_display_settings'))return [[{cash_change_seconds:5}]];
   if(sql.includes('SELECT GREATEST(0,TIMESTAMPDIFF')){assert.deepEqual([...args],[21]);return [[{seconds:elapsedSinceStart}]];}
   if(sql.startsWith('UPDATE customer_display_sessions SET draft_id=?')){
    assert.equal(args[0],30);stored.snapshot=args[1];stored.draft_id=args[0];stored.mode='ORDER';return [{affectedRows:1}];
   }
   if(sql.includes('INSERT INTO customer_display_audit'))return [{affectedRows:1}];
   throw Error('UNEXPECTED_SQL '+sql);
  },
 };
 const script=backend.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const ctx={z,JSON,Number,String,Math,Boolean,Object,Error,Buffer,cashierRole,canUseBranch,validDisplayToken:()=>true,displayPaymentState,displayPresentationState};
 vm.runInNewContext(script,ctx,{filename:'customer-display-r12.js'});
 const req=(receiptOpen)=>({body:{branchId:1,draftId:30,saleId:51,receiptOpen},auth:{pool:{getConnection:async()=>conn},user:{id:10,role_code:'CASHIER',permissions:['pos.view','customer_display.publish'],branchIds:['1']}}});
 const res=()=>{let value;return {set(){return this},json(payload){value=payload;return this},get value(){return value}}};
 return {ctx,req,res,stored,logs,commits:()=>commits,rollbacks:()=>rollbacks};
}

test('CD R1.2: a real cashier paid-sale event is stored only in session JSON and audited',async()=>{
 const h=backendHarness(),res=h.res();
 await h.ctx.customerDisplaySalePresentation(h.req(true),res);
 assert.equal(res.value.paired,true);
 assert.equal(res.value.presentation,'OPEN');
 const snapshot=JSON.parse(h.stored.snapshot);
 assert.deepEqual(JSON.parse(JSON.stringify(snapshot.presentation)),{saleId:'51',receiptOpen:true,remainingChangeSeconds:0});
 assert.equal(h.logs.filter(x=>x.sql.startsWith('UPDATE ')).length,1);
 assert.equal(h.commits(),1);
});
test('CD R1.2: unauthorised/wrong branch or missing sale never writes a false success',async()=>{
 const h=backendHarness({hasSale:false});
 await assert.rejects(h.ctx.customerDisplaySalePresentation(h.req(true),h.res()),/CD_SALE_NOT_POSTED/);
 assert.equal(h.logs.some(x=>x.sql.startsWith('UPDATE ')),false);
 assert.equal(h.rollbacks(),1);
 const unauthorized=backendHarness(),r=unauthorized.req(true);r.auth.user.role_code='WAITER';
 await assert.rejects(unauthorized.ctx.customerDisplaySalePresentation(r,unauthorized.res()),/CD_CASHIER_PERMISSION_REQUIRED/);
 assert.equal(unauthorized.logs.length,0);
});
test('CD R1.2: duplicate paid messages are replay-safe and do not restart the timer',async()=>{
 const h=backendHarness();await h.ctx.customerDisplaySalePresentation(h.req(true),h.res());
 const result=h.res();await h.ctx.customerDisplaySalePresentation(h.req(true),result);
 assert.equal(result.value.unchanged,true);
 assert.equal(h.logs.filter(x=>x.sql.startsWith('UPDATE ')).length,1);
});
test('CD R1.2: closing receipt preserves remaining change time, and delayed open cannot reopen',async()=>{
 const h=backendHarness({elapsedSinceStart:2});
 await h.ctx.customerDisplaySalePresentation(h.req(true),h.res());
 await h.ctx.customerDisplaySalePresentation(h.req(false),h.res());
 assert.deepEqual(JSON.parse(JSON.stringify(JSON.parse(h.stored.snapshot).presentation)),{saleId:'51',receiptOpen:false,remainingChangeSeconds:3});
 const res=h.res();await h.ctx.customerDisplaySalePresentation(h.req(true),res);
 assert.equal(res.value.unchanged,true);
 assert.equal(h.logs.filter(x=>x.sql.startsWith('UPDATE ')).length,2);
});
test('CD R1.2: unpaired checkout remains optional and cannot affect the ledger',async()=>{
 const h=backendHarness({hasSession:false});const res=h.res();await h.ctx.customerDisplaySalePresentation(h.req(true),res);
 assert.equal(res.value.paired,false);
 assert.equal(h.logs.some(x=>x.sql.includes('pos_sales')),false);
});

test('CD R1.3 a previous completed receipt cannot prevent the new paid order from displaying',async()=>{
 const h=backendHarness({sessionDraftId:17,previousStatus:'COMPLETED'}),out=h.res();
 await h.ctx.customerDisplaySalePresentation(h.req(true),out);
 assert.equal(out.value.paired,true);
 assert.equal(out.value.presentation,'OPEN');
 assert.equal(h.stored.draft_id,30);
 assert.equal(JSON.parse(h.stored.snapshot).presentation.saleId,'51');
});
test('CD R1.3 another active draft on the same pairing is not silently overwritten',async()=>{
 const h=backendHarness({sessionDraftId:17,previousStatus:'DRAFT'}),out=h.res();
 await h.ctx.customerDisplaySalePresentation(h.req(true),out);
 assert.equal(out.value.ignored,true);
 assert.equal(out.value.reason,'CD_DIFFERENT_ACTIVE_DRAFT');
 assert.equal(h.stored.draft_id,17);
});
