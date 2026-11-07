// CD R1.6 regression: refresh persistence, clock parity, print-to-idle and
// two-window reattachment without rotating a healthy terminal pairing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeDisplayToken,displayPresentationState} from '../src/customer-display-rules.js';
const read=path=>readFileSync(new URL(`../../${path}`,import.meta.url),'utf8');
const viewer=read('frontend/public/customer-display.js');
const backend=read('backend/src/customer-display.js');
const pos=read('frontend/src/PosTerminal.jsx');
const html=read('frontend/public/customer-display.html');

function viewerHarness(){
 const store=new Map();
 const storage={getItem:key=>store.get(key)||null,setItem:(key,v)=>store.set(key,v),removeItem:key=>store.delete(key)};
 const token=makeDisplayToken('1');
 const names=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 let calls=0;
 function createPage(hash,ok=true){
  const elements=new Map(names.map(name=>[name,{hidden:false,textContent:'',classList:{add(){},remove(){}},pause(){},removeAttribute(){},addEventListener(){}}]));
  const replaced=[];
  const context={URLSearchParams,URL,Math,Number,String,JSON,Map,Error,Promise,console,
   location:{hash,pathname:'/customer-display.html'},history:{replaceState(...args){replaced.push(args);}},
   window:{sessionStorage:storage,addEventListener(){}},
   document:{getElementById:id=>{assert.ok(elements.has(id),id);return elements.get(id);},addEventListener(){},fullscreenElement:false,documentElement:{}},
   setTimeout(){return 1;},clearTimeout(){},setInterval(){},
   fetch:async(_url,opts)=>{calls++;assert.equal(opts.credentials,'omit');assert.equal(JSON.parse(opts.body).token,token);
    return {ok,status:ok?200:404,json:async()=>ok?{status:'IDLE',merchantName:'Demo',branchName:'Main',settings:{},media:[]}:{error:'CD_PAIR_INVALID'}};},
  };
  vm.runInNewContext(viewer,context,{filename:'customer-display.js'});
  return {elements,replaced};
 }
 return {createPage,store,token,calls:()=>calls};
}
async function settle(){await new Promise(resolve=>setImmediate(resolve));}

test('CD R1.6 Refresh preserves pairing in the SAME monitor tab, without URL/token cookies',async()=>{
 const h=viewerHarness();const first=h.createPage(`#pair=${h.token}`);await settle();
 assert.equal(first.elements.get('connection').textContent,'Connected');
 assert.equal(h.store.size,1);
 assert.equal(first.replaced[0][2],'/customer-display.html');
 const again=h.createPage('');await settle();
 assert.equal(again.elements.get('connection').textContent,'Connected');
 assert.equal(h.calls(),2);
 assert.equal(again.replaced[0][2],'/customer-display.html');
});

test('CD R1.6 invalidated pairing is cleared, but not on a transient network error',async()=>{
 const h=viewerHarness();h.createPage(`#pair=${h.token}`);await settle();
 assert.equal(h.store.size,1);
 const invalid=h.createPage('',false);await settle();
 assert.equal(invalid.elements.get('connection').textContent,'Disconnected');
 assert.equal(h.store.size,0);
 assert.match(invalid.elements.get('offline-details').textContent,/expired or was replaced/);
});

test('CD R1.6 DB-expiry verification is server-side and never compares mysql2 Date parameters',async()=>{
 assert.match(backend,/async function sessionExpired\(conn,session\)/);
 assert.match(backend,/SELECT expires_at<=UTC_TIMESTAMP\(6\) AS expired FROM customer_display_sessions WHERE id=\?/);
 assert.doesNotMatch(backend,/UTC_TIMESTAMP\(6\)>\? AS expired/);
 assert.doesNotMatch(backend,/\[session\.expires_at\]/);
 assert.equal((backend.match(/await sessionExpired\(conn,session\)/g)||[]).length,3);
});

test('CD R1.6 Print Receipt closes the POS receipt after print and preserves Owner success interval',()=>{
 const printer=pos.split('function printAndCloseReceipt(){')[1].split(' async function openCustomerDisplay(){')[0];
 assert.match(printer,/printPosReceipt\(receiptNodeRef\.current,closePaidReceipt\)/);
 assert.match(pos,/onClick=\{printAndCloseReceipt\}/);
 assert.match(pos,/onClick=\{closePaidReceipt\}>Close/);
 assert.match(pos,/receiptOpen:false/);
 const sale={id:'7',payment_method:'CASH'};
 const presentation={saleId:'7',receiptOpen:false,remainingChangeSeconds:1};
 const state=age=>displayPresentationState({sale,mode:'ORDER',cashSeconds:5,successSeconds:12,presentation,presentationElapsedSeconds:age});
 assert.equal(state(0),'CASH_CHANGE');
 assert.equal(state(3),'SUCCESS');
 assert.equal(state(14),'IDLE');
});

test('CD R1.6 POS refresh reattaches the existing named monitor without navigating to about:blank',()=>{
 const open=pos.split(' async function openCustomerDisplay(){')[1].split(' const categoryMap=useMemo(')[0];
 assert.match(open,/window\.open\('','tpos-customer-display'/);
 assert.doesNotMatch(open,/window\.open\('about:blank','tpos-customer-display'/);
 assert.match(open,/popup\.location\.pathname==='\/customer-display\.html'/);
 assert.match(open,/popup\.document\.getElementById\('connection'\)\?\.textContent==='Connected'/);
 assert.match(open,/customerDisplayWindowRef\.current=popup;setDisplayPairReady\(true\);popup\.focus\(\)/);
});

test('CD R1.6 cashier publish/payout with a mysql2 Date uses SQL expiry, never JavaScript offset',async()=>{
 const zChain=new Proxy({parse:value=>value},{get:(o,key)=>key==='parse'?o.parse:()=>zChain});
 const z={coerce:{number:()=>zChain},object:()=>zChain,string:()=>zChain,enum:()=>zChain,boolean:()=>zChain,number:()=>zChain};
 const session={id:29,branch_id:1,cashier_user_id:7,draft_id:10,mode:'CASH',snapshot:null,expires_at:new Date('2020-01-01T00:00:00Z')};
 const queries=[],statements=[];
 const conn={async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,params=[]){
  queries.push({sql,params});
  if(sql.includes('FROM customer_display_sessions WHERE branch_id=? AND cashier_user_id=? FOR UPDATE'))return [[session]];
  if(sql.startsWith('SELECT expires_at<=UTC_TIMESTAMP(6) AS expired FROM customer_display_sessions WHERE id=?')){
   assert.equal(params.length,1);assert.equal(params[0],session.id);return [[{expired:0}]]; // MySQL truth, even if JS date is stale.
  }
  if(sql.startsWith('SELECT id FROM pos_sales WHERE draft_id='))return [[]];
  if(sql.startsWith('SELECT status FROM pos_drafts'))return [[{status:'DRAFT'}]];
  if(sql.startsWith('SELECT id,method_code,status FROM pos_payment_attempts'))return [[]];
  if(sql.startsWith('SELECT id,payment_method FROM pos_sales WHERE id='))return [[{id:52,payment_method:'CASH'}]];
  if(sql.startsWith('UPDATE customer_display_sessions')){statements.push(sql);return [{affectedRows:1}];}
  if(sql.startsWith('INSERT INTO customer_display_audit'))return [{affectedRows:1}];
  throw Error(`UNEXPECTED_SQL ${sql}`);
 }};
 const pool={getConnection:async()=>conn};
 const ctx={z,centralPool(){},tenantPool(){},calculateDraftQuote(){},totalDraftLines(){},projectCustomerDisplayCart:async()=>{},
  hashDisplayToken(){},makeDisplayToken(){},validDisplayToken(){return true;},ownerRole(){return true;},cashierRole(){return true;},canUseBranch(){return true;},displayPaymentState(){},displayPresentationState(){},validatePromotionalMedia(){},
  JSON,Number,String,Boolean,Object,Error,Math,Buffer};
 vm.runInNewContext(backend.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),ctx);
 const req={auth:{pool,user:{id:7,role_code:'OWNER',permissions:['customer_display.publish','pos.view'],branchIds:['1']}},body:null};
 async function run(handler,body){req.body=body;let result;await ctx[handler](req,{json:value=>(result=value,value)});return result;}
 let response=await run('publishCustomerDisplay',{branchId:1,draftId:null,discountCode:'',voucherCode:''});
 assert.equal(response.paired,true);
 response=await run('customerDisplayPaymentMode',{branchId:1,draftId:10,mode:'CASH'});
 assert.equal(response.mode,'CASH');
 response=await run('customerDisplaySalePresentation',{branchId:1,draftId:10,saleId:52,receiptOpen:true});
 assert.equal(response.paired,true);
 assert.equal(queries.filter(x=>x.sql.startsWith('SELECT expires_at<=UTC_TIMESTAMP(6)')).length,3);
 assert.ok(statements.length>=2);
});
