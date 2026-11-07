// CD R1.4: real regression for the PC failure when cashier loads a HELD order
// into the active POS pane before pressing Resume. The customer display should
// show the order; failure/absence of the monitor must not block POS actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeDisplayToken,hashDisplayToken,validDisplayToken,canUseBranch,cashierRole,ownerRole,displayPaymentState,displayPresentationState} from '../src/customer-display-rules.js';
const base=new URL('../../',import.meta.url);
const read=p=>readFileSync(new URL(p,base),'utf8');
const src=read('backend/src/customer-display.js');
const ui=read('frontend/src/PosTerminal.jsx');
const zChain=new Proxy({parse:value=>value},{get:(o,key)=>key==='parse'?o.parse:()=>zChain});
const z={coerce:{number:()=>zChain},object:()=>zChain,string:()=>zChain,enum:()=>zChain,boolean:()=>zChain,number:()=>zChain};
function harness(){
 const token=makeDisplayToken('1');
 const session={id:4,branch_id:1,cashier_user_id:7,draft_id:null,mode:'ORDER',attempt_id:null,snapshot:null,presentation_age_seconds:0};
 const draft={id:18,branch_id:1,cashier_user_id:7,status:'HELD',version:3,order_scope:'DINE_IN',table_number:'A05'};
 const settings={promotions_enabled:0,welcome_message:'Welcome!',success_english:'Thank You!',success_malay:'Terima kasih!',media_interval_seconds:8,cash_change_seconds:5,success_seconds:12};
 const writes=[];
 const conn={async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(q,args=[]){
  if(q.includes('FROM customer_display_sessions WHERE branch_id=? AND cashier_user_id=? FOR UPDATE'))return [[{...session}]];
  if(q.includes('SELECT expires_at<=UTC_TIMESTAMP(6) AS expired FROM customer_display_sessions WHERE id=?'))return [[{expired:0}]];
  if(q.startsWith('SELECT d.id,d.branch_id,d.cashier_user_id,d.status'))return [[{...draft}]];
  if(q.startsWith('SELECT product_name,quantity,unit_price FROM pos_draft_lines'))return [[{product_name:'Nasi Goreng',quantity:'1.000',unit_price:'10.0000'}]];
  if(q.startsWith('UPDATE customer_display_sessions SET draft_id=?')){session.draft_id=args[0];session.mode='ORDER';session.snapshot=args[1];writes.push(q);return [{affectedRows:1}];}
  if(q.startsWith('INSERT INTO customer_display_audit'))return [{affectedRows:1}];
  throw Error('UNEXPECTED_SQL '+q);
 }};
 const pool={getConnection:async()=>conn,execute:async(q)=>{
  if(q.includes('FROM customer_display_sessions WHERE token_hash=?'))return [[{...session,expired:0}]];
  if(q.startsWith('SELECT registered_name FROM company_profiles'))return [[{registered_name:'Demo Restaurant'}]];
  if(q.startsWith('SELECT name FROM branches'))return [[{name:'Main Branch'}]];
  if(q.startsWith('SELECT * FROM customer_display_settings'))return [[settings]];
  if(q.startsWith('SELECT status,version,order_scope FROM pos_drafts'))return [[{...draft}]];
  if(q.startsWith('SELECT id,payment_method,total,cash_received,cash_change,TIMESTAMPDIFF'))return [[]];
  throw Error('UNEXPECTED_POOL_SQL '+q);
 }};
 const centralPool=()=>({execute:async()=>[[{id:1}]]});
 const ctx={z,centralPool,tenantPool:()=>pool,validDisplayToken,hashDisplayToken,makeDisplayToken,canUseBranch,cashierRole,ownerRole,displayPaymentState,displayPresentationState,
   calculateDraftQuote:async()=>({bill:{total:'10.00',subtotalBeforeTax:'10.00',discount:'0.00',voucher:'0.00',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0}}),
   totalDraftLines:()=>({lines:[{quantity:'1.000',unitPrice:'10.0000',lineTotal:'10.00',product_name:'Nasi Goreng'}]}),Buffer,JSON,Math,String,Number,Error};
 vm.runInNewContext(src.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),ctx,{filename:'cd-r14.js'});
 const auth={tenantId:'1',pool,user:{id:7,role_code:'CASHIER',permissions:['pos.view','customer_display.publish'],branchIds:['1']}};
 async function invoke(method,body){let answer;await ctx[method]({auth,body},{set(){return this;},json(value){answer=value;return this;}});return answer;}
 return {invoke,session,draft,writes,view:()=>invoke('publicCustomerDisplayState',{token})};
}
test('R1.4 actual HELD order is publishable before Resume, and customer sees lines',async()=>{
 const h=harness();assert.equal((await h.view()).status,'IDLE');
 const result=await h.invoke('publishCustomerDisplay',{branchId:1,draftId:18,discountCode:'',voucherCode:''});
 assert.equal(result.paired,true);assert.equal(result.ignored,undefined);
 const view=await h.view();assert.equal(view.status,'ORDER');assert.equal(view.order.draftId,'18');assert.equal(view.order.lines[0].name,'Nasi Goreng');assert.equal(view.order.tableNumber,'A05');
 h.draft.status='DRAFT';h.draft.version=4;
 const resumed=await h.invoke('publishCustomerDisplay',{branchId:1,draftId:18,discountCode:'',voucherCode:''});
 assert.equal(resumed.paired,true);assert.equal((await h.view()).status,'ORDER');assert.equal(h.writes.length,2);
});
test('R1.4 pairing never depends on successful cart publish or destroys live screen on repeat',()=>{
 const pairing=ui.split(' async function openCustomerDisplay(){')[1].split(' const categoryMap=useMemo(')[0];
 assert.match(pairing,/existing&&!existing\.closed/);
 assert.match(pairing,/existing\.focus\(\)/);
 assert.match(pairing,/customerDisplayWindowRef\.current=popup/);
 assert.match(pairing,/\.catch\(e=>notify\(`Display paired, but order sync needs retry:/);
 assert.doesNotMatch(pairing,/if\(synced\?\.paired!==true\|\|synced\?\.ignored\)throw/);
});
test('R1.4 a payment-screen state cannot be overwritten by a stale cart debounce',()=>{
 assert.match(ui,/if\(!canPublishDisplay\|\|!branchId\|\|showPayment\|\|receipt\|\|displayPaymentInProgressRef\.current\)return/);
 assert.match(ui,/if\(displayPaymentInProgressRef\.current\)return/);
 assert.match(ui,/\['DRAFT','HELD'\]\.includes\(current\?\.draft\?\.status\)/);
 assert.match(ui,/await request\('\/customer-display\/payment-mode'/);
});
