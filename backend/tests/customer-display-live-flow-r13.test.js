// R1.3 regression: exercise the complete server-side public-display sequence.
// Payment posting itself is simulated; the display handler may only read it.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {makeDisplayToken,hashDisplayToken,validDisplayToken,cashierRole,ownerRole,canUseBranch,displayPaymentState,displayPresentationState} from '../src/customer-display-rules.js';
const source=readFileSync(new URL('../src/customer-display.js',import.meta.url),'utf8');
const chain=new Proxy({parse:v=>v},{get:(x,key)=>key==='parse'?x.parse:()=>chain});
const z={coerce:{number:()=>chain},object:()=>chain,string:()=>chain,enum:()=>chain,boolean:()=>chain,number:()=>chain};

function makeHarness(){
 const token=makeDisplayToken('1');
 let sale=null,elapsed=0;
 const session={id:6,branch_id:1,cashier_user_id:7,token_hash:hashDisplayToken(token),draft_id:null,mode:'ORDER',attempt_id:null,snapshot:null,expires_at:'2099-01-01',presentation_age_seconds:0};
 const draft={id:42,branch_id:1,cashier_user_id:7,status:'DRAFT',version:1,order_scope:'TAKE_AWAY',table_number:null};
 const settings={promotions_enabled:0,welcome_message:'Welcome!',success_english:'Thank You!',success_malay:'Terima kasih!',media_interval_seconds:8,cash_change_seconds:5,success_seconds:12};
 const writes=[];
 const conn={
  async beginTransaction(){},async commit(){},async rollback(){},release(){},
  async execute(sql,args=[]){
   if(sql.includes('FROM customer_display_sessions WHERE branch_id=? AND cashier_user_id=? FOR UPDATE'))return [[{...session}]];
   if(sql.includes('UTC_TIMESTAMP(6)>? AS expired'))return [[{expired:0}]];
   if(sql.startsWith('SELECT d.id,d.branch_id,d.cashier_user_id,d.status'))return [[draft]];
   if(sql.startsWith('SELECT product_name,quantity,unit_price FROM pos_draft_lines'))return [[{product_name:'Tomyam',quantity:'2.000',unit_price:'12.7000'}]];
   if(sql.startsWith('UPDATE customer_display_sessions SET draft_id=?')){
    session.draft_id=args[0];session.mode='ORDER';session.attempt_id=null;session.snapshot=args[2]===session.id?args[1]:args[2];session.presentation_age_seconds=0;
    writes.push(sql);return [{affectedRows:1}];
   }
   if(sql.startsWith('UPDATE customer_display_sessions SET mode=?')){session.mode=args[0];session.attempt_id=args[1];writes.push(sql);return [{affectedRows:1}];}
   if(sql.includes('FROM pos_sales WHERE id=? AND draft_id=?'))return [sale?[{id:sale.id,payment_method:sale.payment_method}]:[]];
   if(sql.startsWith('SELECT id FROM pos_sales WHERE draft_id=?'))return [sale?[{id:sale.id}]:[]];
   if(sql.startsWith('SELECT status FROM pos_drafts WHERE id=?'))return [[{status:draft.status}]];
   if(sql.startsWith('SELECT cash_change_seconds FROM customer_display_settings'))return [[{cash_change_seconds:5}]];
   if(sql.startsWith('INSERT INTO customer_display_audit'))return [{affectedRows:1}];
   throw Error('UNEXPECTED_SQL:'+sql);
  },
 };
 const pool={getConnection:async()=>conn,execute:async(sql,args=[])=>{
  if(sql.includes('FROM customer_display_sessions WHERE token_hash=?')){assert.equal(args[0],hashDisplayToken(token));return [[{...session,expired:0}]];}
  if(sql.startsWith('SELECT registered_name FROM company_profiles'))return [[{registered_name:'TEST SHOP'}]];
  if(sql.startsWith('SELECT name FROM branches WHERE id=?'))return [[{name:'Main Branch'}]];
  if(sql.startsWith('SELECT * FROM customer_display_settings'))return [[settings]];
  if(sql.startsWith('SELECT status,version,order_scope FROM pos_drafts'))return [[draft]];
  if(sql.startsWith('SELECT id,payment_method,total,cash_received,cash_change,TIMESTAMPDIFF'))return [sale?[{...sale,age_seconds:elapsed}]:[]];
  if(sql.startsWith('SELECT id,title,media_type,mime_type FROM customer_display_media'))return [[]];
  throw Error('UNEXPECTED_POOL_SQL:'+sql);
 }};
 const central={execute:async()=>[[{id:1}]]};
 const script=source.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const context={z,centralPool:()=>central,tenantPool:()=>pool,validDisplayToken,hashDisplayToken,makeDisplayToken,ownerRole,cashierRole,canUseBranch,displayPaymentState,displayPresentationState,
  calculateDraftQuote:async()=>({bill:{total:'25.40',subtotalBeforeTax:'25.40',discount:'0.00',voucher:'0.00',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0}}),
  totalDraftLines:()=>({lines:[{product_name:'Tomyam',quantity:'2.000',unitPrice:'12.7000',lineTotal:'25.40'}]}),
  projectCustomerDisplayCart:async()=>{},
  JSON,Number,String,Boolean,Math,Buffer,Error,Object};
 vm.runInNewContext(script,context,{filename:'customer-display-real-flow.js'});
 const auth={pool,tenantId:'1',user:{id:7,role_code:'CASHIER',permissions:['pos.view','customer_display.pair','customer_display.publish'],branchIds:['1']}};
 async function invoke(name,body){let payload;const res={set(){return this;},json(x){payload=x;return this;}};await context[name]({auth,body},res);return payload;}
 async function view(){return invoke('publicCustomerDisplayState',{token});}
 return {invoke,view,session,draft,writes,postSale(){draft.status='COMPLETED';sale={id:91,payment_method:'CASH',total:'25.40',cash_received:'30.00',cash_change:'4.60'};},setElapsed(n){elapsed=n;session.presentation_age_seconds=n;}};
}

test('CD R1.3 public viewer follows a real cart, Cash Pending, posted change and Thank You',async()=>{
 const h=makeHarness();
 assert.equal((await h.view()).status,'IDLE');
 const published=await h.invoke('publishCustomerDisplay',{branchId:1,draftId:42,discountCode:'',voucherCode:''});
 assert.equal(published.paired,true);
 const cart=await h.view();
 assert.equal(cart.status,'ORDER');assert.equal(cart.order.draftId,'42');assert.equal(cart.order.total,'25.40');
 assert.equal(cart.order.lines[0].name,'Tomyam');
 await h.invoke('customerDisplayPaymentMode',{branchId:1,draftId:42,mode:'CASH'});
 assert.equal((await h.view()).status,'CASH_PENDING');
 h.postSale();
 const paid=await h.invoke('customerDisplaySalePresentation',{branchId:1,draftId:42,saleId:91,receiptOpen:true});
 assert.equal(paid.paired,true);
 const change=await h.view();assert.equal(change.status,'CASH_CHANGE');assert.equal(change.cashChange,'4.60');
 h.setElapsed(7);
 const thankYou=await h.view();assert.equal(thankYou.status,'SUCCESS');assert.equal(thankYou.settings.successEnglish,'Thank You!');
 assert.equal(h.writes.length,3);
});
