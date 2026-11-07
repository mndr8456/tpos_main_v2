// R1.5: Exercise the real POS-response projection code with a fake tenant pool.
// The financial POS handlers are not stubbed as successes: these tests cover
// the read-only-after-commit projection contract separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {displayPaymentState,displayPresentationState} from '../src/customer-display-rules.js';
const text=readFileSync(new URL('../src/customer-display-pos-events.js',import.meta.url),'utf8');
function harness(){
 const draft={id:42,branch_id:1,cashier_user_id:7,status:'DRAFT',version:3,order_scope:'TAKE_AWAY',table_number:null};
 const session={id:5,branch_id:1,cashier_user_id:7,draft_id:null,mode:'ORDER',attempt_id:null,snapshot:null,presentation_age_seconds:0};
 const lines=[{product_name:'Tomyam',quantity:'2.000',unit_price:'12.7000'}];
 let sale=null,attempt=null,hasSession=true;
 const commands=[];
 const db={async beginTransaction(){commands.push('BEGIN');},async commit(){commands.push('COMMIT');},async rollback(){commands.push('ROLLBACK');},release(){},async execute(sql,args=[]){
  if(sql.startsWith('SELECT d.id,d.branch_id,d.cashier_user_id,d.status'))return [[{...draft}]];
  if(sql.startsWith('SELECT id,draft_id,mode,attempt_id,snapshot FROM customer_display_sessions'))return [hasSession?[{...session}]:[]];
  if(sql.startsWith('SELECT id,draft_id FROM customer_display_sessions'))return [hasSession?[{...session}]:[]];
  if(sql.startsWith('SELECT id,draft_id,snapshot FROM customer_display_sessions'))return [hasSession?[{...session}]:[]];
  if(sql.startsWith('SELECT product_name,quantity,unit_price FROM pos_draft_lines'))return [lines];
  if(sql.startsWith('SELECT id,branch_id FROM pos_drafts'))return [draft.status==='DRAFT'?[{...draft}]:[]];
  if(sql.startsWith('SELECT id,method_code FROM pos_payment_attempts'))return [attempt?[{...attempt}]:[]];
  if(sql.startsWith('SELECT id,branch_id,payment_method FROM pos_sales'))return [sale?[{...sale}]:[]];
  if(sql.startsWith('SELECT status FROM pos_drafts WHERE id='))return [[{status:draft.status}]];
  if(sql.startsWith("UPDATE customer_display_sessions SET draft_id=?,mode='ORDER'")){
   session.draft_id=args[0];session.mode='ORDER';session.snapshot=args[1];commands.push('SALE');return [{affectedRows:1}];
  }
  if(sql.startsWith('UPDATE customer_display_sessions SET draft_id=?')){
   session.draft_id=args[0];session.mode=args[1];session.attempt_id=args[2];session.snapshot=args[3];commands.push('CART');return [{affectedRows:1}];
  }
  if(sql.startsWith('UPDATE customer_display_sessions SET mode=?')){
   session.mode=args[0];session.attempt_id=args[1];commands.push('ATTEMPT');return [{affectedRows:1}];
  }
  if(sql.startsWith("UPDATE customer_display_sessions SET draft_id=NULL")){
   session.draft_id=null;session.snapshot=null;session.mode='ORDER';commands.push('IDLE');return [{affectedRows:1}];
  }
  throw Error(`UNEXPECTED_SQL ${sql}`);
 }};
 const pool={getConnection:async()=>db,execute:async(sql,args=[])=>{
  if(sql.startsWith('SELECT id FROM pos_drafts WHERE branch_id=?'))return [[{id:42}]];
  if(sql.includes('FROM customer_display_sessions WHERE token_hash=?'))return [[{...session,expired:0}]];
  if(sql.startsWith('SELECT registered_name FROM company_profiles'))return [[{registered_name:'Test Restaurant'}]];
  if(sql.startsWith('SELECT name FROM branches'))return [[{name:'Main Branch'}]];
  if(sql.startsWith('SELECT * FROM customer_display_settings'))return [[{promotions_enabled:0,welcome_message:'Welcome!',success_english:'Thank You!',success_malay:'Terima kasih!',media_interval_seconds:8,cash_change_seconds:5,success_seconds:12}]];
  if(sql.startsWith('SELECT status,version,order_scope FROM pos_drafts'))return [[{...draft}]];
  if(sql.startsWith('SELECT id,payment_method,total,cash_received,cash_change,TIMESTAMPDIFF'))return [sale?[{...sale,total:'25.40',cash_received:'30.00',cash_change:'4.60',age_seconds:0}]:[]];
  if(sql.startsWith('SELECT status,method_code,expected_total,draft_version FROM pos_payment_attempts'))return [attempt?[{...attempt,status:'PENDING',expected_total:'25.40',draft_version:draft.version}]:[]];
  if(sql.startsWith('SELECT i.mime_type,i.image_data FROM payment_method_settings'))return [[]];
  throw Error('UNEXPECTED_POOL '+sql);
 }};
 const code=text.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const context={
  calculateDraftQuote:async()=>({bill:{total:'25.40',subtotalBeforeTax:'25.40',discount:'0.00',voucher:'0.00',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0}}),
  totalDraftLines:()=>({lines:[{product_name:'Tomyam',quantity:'2.000',unitPrice:'12.7000',lineTotal:'25.40'}]}),
  JSON,Number,String,Boolean,Math,Promise,process,Error
 };
 vm.runInNewContext(code,context,{filename:'customer-display-pos-events-r15.js'});
 const req={params:{id:'42'},body:{},auth:{pool,user:{id:7,permissions:['customer_display.publish']}}};
 return {context,req,session,draft,commands,pool,setSale:x=>sale=x,setAttempt:x=>attempt=x,setPaired:x=>hasSession=x};
}
test('R1.5 backend cart event writes real quantity/total without a React publish',async()=>{
 const h=harness();await h.context.projectCustomerDisplayCart(h.req,42);
 assert.equal(String(h.session.draft_id),'42');assert.equal(h.session.mode,'ORDER');
 const snapshot=JSON.parse(h.session.snapshot);
 assert.equal(snapshot.total,'25.40');assert.equal(snapshot.lines[0].name,'Tomyam');
 assert.equal(snapshot.version,3);assert.deepEqual(h.commands.filter(x=>x==='CART'),['CART']);
});
test('R1.5 a pending merchant QR attempt is never classified as paid',async()=>{
 const h=harness();await h.context.projectCustomerDisplayCart(h.req,42);
 h.setAttempt({id:16,method_code:'DUITNOW_QR'});
 await h.context.projectAttempt(h.req,42);
 assert.equal(h.session.mode,'QR');assert.equal(h.session.attempt_id,16);
 await h.context.projectCustomerDisplayCart(h.req,42);
 assert.equal(h.session.mode,'QR');assert.equal(h.session.attempt_id,16); // late quote cannot clear attempt
 assert.equal(JSON.parse(h.session.snapshot).presentation,undefined);
});
test('R1.5 only actual persisted sale can create a Cash Change / Thank You presentation',async()=>{
 const h=harness();await h.context.projectCustomerDisplayCart(h.req,42);
 await h.context.projectSale(h.req,42);assert.equal(JSON.parse(h.session.snapshot).presentation,undefined);
 h.draft.status='COMPLETED';h.setSale({id:91,branch_id:1,payment_method:'CASH'});
 await h.context.projectSale(h.req,42);
 const saved=JSON.parse(h.session.snapshot);
 assert.equal(saved.presentation.saleId,'91');assert.equal(saved.presentation.receiptOpen,true);
 const writes=h.commands.filter(x=>x==='SALE').length;
 await h.context.projectSale(h.req,42);
 assert.equal(h.commands.filter(x=>x==='SALE').length,writes);
});
test('R1.5 an unpaired cashier or a failed POS response can never publish a cart',async()=>{
 const h=harness();h.setPaired(false);await h.context.projectCustomerDisplayCart(h.req,42);
 assert.equal(h.session.draft_id,null);
 const middleware=h.context.customerDisplayAfterPos('cart');
 const response=new EventEmitter();response.statusCode=409;
 middleware(h.req,response,()=>{});response.emit('finish');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(h.session.draft_id,null);
});
test('R1.5 event projection is attached after successful POS HTTP response',async()=>{
 const h=harness();const middleware=h.context.customerDisplayAfterPos('cart');
 const response=new EventEmitter();response.statusCode=200;let nextCalled=false;
 middleware(h.req,response,()=>{nextCalled=true;});assert.equal(nextCalled,true);
 assert.equal(h.session.draft_id,null);response.emit('finish');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(String(h.session.draft_id),'42');
});

test('R1.5 integrated live public view observes backend-persisted cart, QR pending, and real paid Cash Change',async()=>{
 const h=harness();
 const backend=readFileSync(new URL('../src/customer-display.js',import.meta.url),'utf8');
 const chain=new Proxy({parse:x=>x},{get:(x,k)=>k==='parse'?x.parse:()=>chain});
 const z={coerce:{number:()=>chain},object:()=>chain,string:()=>chain,enum:()=>chain,boolean:()=>chain,number:()=>chain};
 const ctx={z,centralPool:()=>({execute:async()=>[[{id:1}]]}),tenantPool:()=>h.pool,
  validDisplayToken:()=>true,hashDisplayToken:()=>'',makeDisplayToken:()=>'',
  displayPaymentState,displayPresentationState,
  calculateDraftQuote:async()=>{},totalDraftLines:()=>{},projectCustomerDisplayCart:async()=>{},
  JSON,Number,String,Boolean,Math,Buffer,Error,Object};
 vm.runInNewContext(backend.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),ctx);
 async function view(){let data;await ctx.publicCustomerDisplayState({body:{token:'1.testing'}},{set(){return this;},json:x=>(data=x,this)});return data;}
 assert.equal((await view()).status,'IDLE');
 await h.context.projectCustomerDisplayCart(h.req,42);
 let result=await view();assert.equal(result.status,'ORDER');assert.equal(result.order.total,'25.40');
 h.setAttempt({id:16,method_code:'DUITNOW_QR'});await h.context.projectAttempt(h.req,42);
 result=await view();assert.equal(result.status,'QR_PENDING');
 // In a separate test sale, use actual committed CASH method and confirm the
 // server-side projection is the only origin of success (no client paid flag).
 h.draft.status='COMPLETED';h.setSale({id:93,branch_id:1,payment_method:'CASH'});
 await h.context.projectSale(h.req,42);
 result=await view();assert.equal(result.status,'CASH_CHANGE');assert.equal(result.cashChange,'4.60');
});
