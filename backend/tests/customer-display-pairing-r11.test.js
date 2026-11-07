import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeDisplayToken,hashDisplayToken,validDisplayToken,ownerRole,cashierRole,canUseBranch,displayPaymentState,displayPresentationState,validatePromotionalMedia} from '../src/customer-display-rules.js';

const read=p=>readFileSync(new URL(`../../${p}`,import.meta.url),'utf8');
const viewer=read('frontend/public/customer-display.js');
const backend=read('backend/src/customer-display.js');
const pos=read('frontend/src/PosTerminal.jsx');

function browserHarness(response){
 const dom=new Map([...read('frontend/public/customer-display.html').matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],{
  hidden:false,textContent:'',classList:{add(){},remove(){}},pause(){},removeAttribute(){},addEventListener(){},
 }]));
 const access=id=>{assert.ok(dom.has(id),`Missing HTML element ${id}`);return dom.get(id);};
 const viewed=[];let requested;
 const token=makeDisplayToken('1');
 const context={
  URLSearchParams,URL,Math,Number,String,JSON,Map,Error,Promise,console,
  location:{hash:`#pair=${encodeURIComponent(token)}`,pathname:'/customer-display.html'},
  history:{replaceState(...args){viewed.push(args);}},
  window:{addEventListener(){}},
  document:{getElementById:access,addEventListener(){},fullscreenElement:false,documentElement:{}},
  setTimeout(){return 1;},clearTimeout(){},setInterval(){},
  fetch:async(url,opts)=>{requested={url,opts};return response;},
 };
 vm.runInNewContext(viewer,context,{filename:'customer-display.js'});
 return {dom,viewed,token,requested:()=>requested};
}

async function settle(){await new Promise(resolve=>setImmediate(resolve));}

test('CD R1.1: real viewer keeps the fragment token in memory, clears its URL and reaches Connected',async()=>{
 const result=browserHarness({ok:true,status:200,json:async()=>({status:'IDLE',merchantName:'Test Merchant',branchName:'Main Branch',order:null,media:[],settings:{welcomeMessage:'Welcome'}})});
 await settle();
 assert.equal(result.dom.get('connection').textContent,'Connected');
 assert.equal(result.dom.get('offline-view').hidden,true);
 assert.equal(result.dom.get('merchant').textContent,'Test Merchant');
 assert.equal(result.requested().url,'/api/v2/customer-display/public/view');
 assert.equal(JSON.parse(result.requested().opts.body).token,result.token);
 assert.equal(result.requested().opts.credentials,'omit');
 assert.equal(result.viewed[0][2],'/customer-display.html');
});

test('CD R1.1: viewer does not falsely say expired for a specific backend HTTP failure',async()=>{
 const result=browserHarness({ok:false,status:403,json:async()=>({error:'INVALID_ORIGIN'})});
 await settle();
 assert.equal(result.dom.get('connection').textContent,'Disconnected');
 assert.match(result.dom.get('offline-details').textContent,/HTTP 403 · INVALID_ORIGIN/);
 assert.match(result.dom.get('offline-details').textContent,/Retrying automatically/);
 assert.doesNotMatch(result.dom.get('offline-details').textContent,new RegExp(result.token.replaceAll('.','\\.')));
});

test('CD R1.1: backend checks the token through the public read path after successful pair commit',()=>{
 assert.match(backend,/await conn\.commit\(\);[\s\S]{0,1400}\/\/ R1\.1/);
 assert.match(backend,/await validPublicSession\(token\)/);
 assert.match(backend,/viewReady:true/);
 assert.match(backend,/await publicCustomerDisplayState\(\{body:\{token\}\}/);
 assert.match(pos,/result\.viewReady!==true/);
 assert.match(backend,/FROM customer_display_sessions WHERE token_hash=\? LIMIT 1/);
 assert.match(backend,/expires_at<=UTC_TIMESTAMP\(6\)/);
 assert.match(backend,/SELECT registered_name FROM company_profiles WHERE id=1/);
 assert.match(backend,/SELECT name FROM branches WHERE id=\? AND is_active=1/);
 assert.match(backend,/CD_DISPLAY_SETTINGS_UNAVAILABLE/);
});


function backendHarness({publicSessionPresent=true}={}){
 const fakeSchema={parse:value=>value};
 const chain=new Proxy(fakeSchema,{get:(target,key)=>key==='parse'?target.parse:()=>chain});
 const z={coerce:{number:()=>chain},object:()=>chain,string:()=>chain,number:()=>chain,enum:()=>chain,boolean:()=>chain};
 let expectedHash=null;
 const session={id:'5',branch_id:'1',cashier_user_id:'10',draft_id:null,mode:'ORDER',attempt_id:null,snapshot:null,expired:0};
 const pool={
  async execute(sql,params=[]){
   if(sql.includes('SELECT id FROM branches WHERE id=? AND is_active=1'))return [[{id:1}]];
   if(sql.includes("SELECT id FROM pos_drafts WHERE branch_id=? AND cashier_user_id=? AND status='DRAFT'"))return [[]];
   if(sql.includes('FROM customer_display_sessions WHERE token_hash=?')){
    assert.equal(params[0],expectedHash);
    return [publicSessionPresent? [session]:[]];
   }
   if(sql.includes('SELECT registered_name FROM company_profiles'))return [[{registered_name:'Demo Shop'}]];
   if(sql.includes('SELECT name FROM branches WHERE id=? AND is_active=1'))return [[{name:'Main Branch'}]];
   if(sql.includes('SELECT * FROM customer_display_settings'))return [[{id:1,promotions_enabled:0,welcome_message:'Welcome!',success_english:'Thank You',success_malay:'Terima kasih',media_interval_seconds:8,cash_change_seconds:5,success_seconds:12}]];
   if(sql.includes('SELECT id FROM customer_display_settings WHERE id=1'))return [[{id:1}]];
   if(sql.includes('FROM customer_display_media WHERE is_active=1'))return [[]];
   throw Error(`MOCK_UNEXPECTED_SQL ${sql}`);
  },
  async getConnection(){return {
   async beginTransaction(){},async commit(){},async rollback(){},release(){},
   async execute(sql,params=[]){
    if(sql.includes('INSERT INTO customer_display_sessions')){expectedHash=params[2];return [{affectedRows:1}];}
    if(sql.includes('INSERT INTO customer_display_audit'))return [{affectedRows:1}];
    throw Error(`MOCK_UNEXPECTED_TRANSACTION_SQL ${sql}`);
   },
  };},
 };
 const central={execute:async(sql,params)=>{assert.match(sql,/FROM tenants WHERE id=\?/);assert.equal(params[0],'1');return [[{id:'1'}]];}};
 const src=backend.replace(/^import .*;\s*$/gm,'').replace(/^export /gm,'');
 const ctx={z,centralPool:()=>central,tenantPool:()=>pool,calculateDraftQuote(){},totalDraftLines(){},
  hashDisplayToken,makeDisplayToken,validDisplayToken,ownerRole,cashierRole,canUseBranch,displayPaymentState,displayPresentationState,validatePromotionalMedia,
  JSON,Number,String,Boolean,Object,Error,Math,Buffer};
 vm.runInNewContext(src,ctx,{filename:'customer-display-handler.js'});
 return {ctx,pool,settingExpectedHash:hash=>{expectedHash=hash;}};
}

test('CD R1.1: backend anonymous public read returns real IDLE rather than Disconnected for valid pair',async()=>{
 const {ctx,settingExpectedHash}=backendHarness();
 const token=makeDisplayToken('1');settingExpectedHash(hashDisplayToken(token));
 let output;
 const res={set(){return this;},json(value){output=value;return this;}};
 await ctx.publicCustomerDisplayState({body:{token}},res);
 assert.equal(output.status,'IDLE');
 assert.equal(output.merchantName,'Demo Shop');
 assert.equal(output.branchName,'Main Branch');
 assert.equal(output.settings.successMalay,'Terima kasih');
});

test('CD R1.1: cashier PAIR only responds success after actual public readback succeeds',async()=>{
 const {ctx,pool}=backendHarness();
 let output;
 const res={set(){return this;},json(value){output=value;return this;}};
 const req={body:{branchId:1},auth:{pool,tenantId:'1',user:{id:'10',role_code:'OWNER',permissions:['pos.view','customer_display.pair','customer_display.publish'],branchIds:['1']}}};
 await ctx.pairCustomerDisplay(req,res);
 assert.equal(output.viewReady,true);
 assert.equal(output.expiresInHours,12);
 assert.equal(validDisplayToken(output.token),true);
});

test('CD R1.1: readback failure does not falsely claim successful pairing to POS',async()=>{
 const {ctx,pool}=backendHarness({publicSessionPresent:false});
 const res={set(){return this;},json(){throw Error('MUST_NOT_RETURN_SUCCESS');}};
 const req={body:{branchId:1},auth:{pool,tenantId:'1',user:{id:'10',role_code:'OWNER',permissions:['pos.view','customer_display.pair','customer_display.publish'],branchIds:['1']}}};
 await assert.rejects(ctx.pairCustomerDisplay(req,res),/CD_PAIR_INVALID/);
});
