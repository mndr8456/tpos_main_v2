import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const backend=fs.readFileSync(path.join(root,'backend/src/pos-drafts.js'),'utf8');
const frontend=fs.readFileSync(path.join(root,'frontend/src/PosTerminal.jsx'),'utf8');

function mockZod(){
 const v={};for(const name of ['int','positive','max','regex','refine','strict','default','optional','nullable','trim','uuid','min'])v[name]=()=>v;
 v.parse=input=>input;return {coerce:{number:()=>v},number:()=>v,string:()=>v,enum:()=>v,boolean:()=>v,object:()=>v};
}
function handlers(){
 const code=backend.replace(/^import .*?;\s*$/gm,'').replace(/\bexport\s+(?=async\s+function|function|const\s)/g,'')+'\nglobalThis.api={createPosDraft,changePosDraftStatus};';
 const sandbox={z:mockZod(),createHash,evaluateDiscount:()=>{},evaluateVoucher:()=>{},totalDraftLines:rows=>({lines:rows,subtotal:'10.50'}),format:()=>{},Intl,Date,JSON,Number,String,Error,Object,Promise,Set};
 vm.runInNewContext(code,sandbox,{filename:'pos-drafts.js'});return sandbox.api;
}
function fixture({hasShift=true,productValid=true,failInsert=false}={}){
 let state={drafts:[],lines:[],commands:[],audits:[],nextId:1};
 const conn={snapshot:null,async beginTransaction(){this.snapshot=structuredClone(state)},async commit(){this.snapshot=null},async rollback(){if(this.snapshot)state=this.snapshot;this.snapshot=null},release(){},
  async execute(sql,args=[]){
   if(sql.includes('FROM cash_shifts WHERE'))return [[hasShift?{id:5,status:'OPEN',branch_id:1}:undefined]];
   if(sql.includes('FROM pos_drafts WHERE request_key='))return [[state.drafts.find(d=>d.request_key===args[0])]];
   if(sql.includes('FROM pos_drafts d JOIN branches b')){const d=state.drafts.find(x=>x.id===Number(args[0]));return [[d?{...d,branch_name:'Main Branch'}:undefined]];}
   if(sql.startsWith('SELECT id,product_id,product_name,sku'))return [state.lines.filter(x=>x.draft_id===Number(args[0]))];
   if(sql.startsWith('SELECT p.id,p.sku'))return [[productValid?{id:10,product_name:'AGLIO OLIO',sku:'PRD-10',barcode:null,category_id:1,base_unit_code:'EA',is_weighable:0,track_stock:1,product_type:'GOODS',product_structure:'SINGLE',price:'10.50'}:undefined]];
   if(sql.startsWith('INSERT INTO pos_drafts(')){
    if(failInsert){failInsert=false;throw Error('SIMULATED_MYSQL_FAILURE')}
    const [request_key,branch_id,cashier_user_id,shift_id,order_scope,table_id]=args;
    const id=state.nextId++;state.drafts.push({id,request_key,branch_id,cashier_user_id,shift_id,order_scope,table_id,status:'DRAFT',version:1});return [{insertId:id}];
   }
   if(sql.startsWith('INSERT INTO pos_draft_lines(')){const [draft_id,product_id,product_name,sku,barcode,category_id,unit_code,quantity,unit_price,track_stock,product_type]=args;state.lines.push({id:state.lines.length+1,draft_id,product_id,product_name,sku,barcode,category_id,unit_code,quantity,unit_price,track_stock,product_type});return [{insertId:state.lines.length}];}
   if(sql.startsWith('INSERT INTO pos_draft_audit_logs')){state.audits.push({draftId:args[0],action:args[2]});return [{}];}
   if(sql.includes('FROM pos_draft_commands WHERE'))return [[state.commands.find(c=>c.draft_id===Number(args[0])&&c.request_key===args[1])]];
   if(sql.startsWith('INSERT INTO pos_draft_commands')){state.commands.push({draft_id:Number(args[0]),request_key:args[1],request_hash:args[2]});return [{}];}
   if(sql.startsWith('SELECT COUNT(*) AS total FROM pos_draft_lines'))return [[{total:state.lines.filter(l=>l.draft_id===Number(args[0])).length}]];
   if(sql.startsWith('UPDATE pos_drafts SET status=')){const d=state.drafts.find(x=>x.id===Number(args[1]));d.status=args[0];d.version++;return [{}];}
   throw Error('UNEXPECTED_QUERY: '+sql);
  }
 };
 const req=body=>({body,auth:{pool:{getConnection:async()=>conn},user:{id:7,role_code:'CASHIER',permissions:['pos.cart.manage'],branchIds:['1']},company:{business_type:'RESTAURANT'}}});
 const call=async(fn,body,draftId)=>{const res={status(v){this.statusCode=v;return this},json(v){this.payload=v;return this}};await fn({...req(body),params:{id:draftId}},res);return res.payload;};
 const input=()=>({branchId:1,orderScope:'TAKE_AWAY',productId:10,quantity:'1',requestKey:randomUUID()});
 return {get state(){return state},call,input,conn};
}
test('Opening POS must not POST an empty order and New Order has no number',()=>{
 assert.doesNotMatch(frontend,/ensureExisting:true/);
 assert.doesNotMatch(frontend,/createNext:true/);
 assert.match(frontend,/current\?`Order #\$\{current\.draft\.id\}`:'New Order'/);
 assert.match(frontend,/request\('\/pos\/drafts',\{method:'POST',body:\{branchId:Number\(branchId\),orderScope,tableId:/);
 assert.match(backend,/if\(!data\.productId\|\|!data\.quantity\)throw bad\('POS_FIRST_PRODUCT_REQUIRED'/);
});
test('First valid item creates one draft and one line atomically',async()=>{
 const h=handlers(),db=fixture();const created=await db.call(h.createPosDraft,db.input());
 assert.equal(created.draft.id,'1');assert.equal(db.state.drafts.length,1);assert.equal(db.state.lines.length,1);
 assert.deepEqual(db.state.audits.map(x=>x.action),['CREATE','ADD_LINE']);
});
test('Empty creation request is rejected and no order ID consumed',async()=>{
 const h=handlers(),db=fixture();await assert.rejects(db.call(h.createPosDraft,{branchId:1,requestKey:randomUUID(),orderScope:'TAKE_AWAY'}),/POS_FIRST_PRODUCT_REQUIRED/);
 assert.equal(db.state.drafts.length,0);assert.equal(db.state.nextId,1);
});
test('Invalid product never saves an empty draft',async()=>{
 const h=handlers(),db=fixture({productValid:false});await assert.rejects(db.call(h.createPosDraft,db.input()),/POS_PRODUCT_NOT_AVAILABLE/);
 assert.equal(db.state.drafts.length,0);
});
test('SQL failure during first cart insert rolls back and does not leave a saved order',async()=>{
 const h=handlers(),db=fixture({failInsert:true});await assert.rejects(db.call(h.createPosDraft,db.input()),/SIMULATED_MYSQL_FAILURE/);
 assert.equal(db.state.drafts.length,0);assert.equal(db.state.lines.length,0);
});
test('Retrying initial add with the same idempotency key returns same order',async()=>{
 const h=handlers(),db=fixture(),input=db.input();const a=await db.call(h.createPosDraft,input);const b=await db.call(h.createPosDraft,input);
 assert.equal(a.draft.id,b.draft.id);assert.equal(db.state.drafts.length,1);assert.equal(db.state.lines.length,1);
});
test('Hold saves only an order with an item; no successor created',async()=>{
 const h=handlers(),db=fixture();const start=await db.call(h.createPosDraft,db.input());
 const held=await db.call(h.changePosDraftStatus,{status:'HELD',expectedVersion:1,requestKey:randomUUID()},start.draft.id);
 assert.equal(held.draft.status,'HELD');assert.equal(db.state.drafts.length,1);
 assert.deepEqual(db.state.audits.map(x=>x.action),['CREATE','ADD_LINE','HOLD']);
});
test('Repeated Hold request is idempotent; still no empty replacement',async()=>{
 const h=handlers(),db=fixture();const start=await db.call(h.createPosDraft,db.input());const cmd={status:'HELD',expectedVersion:1,requestKey:randomUUID()};
 await db.call(h.changePosDraftStatus,cmd,start.draft.id);await db.call(h.changePosDraftStatus,cmd,start.draft.id);
 assert.equal(db.state.drafts.length,1);assert.equal(db.state.audits.filter(x=>x.action==='HOLD').length,1);
});
test('Cash Shift required before first item can persist',async()=>{
 const h=handlers(),db=fixture({hasShift:false});await assert.rejects(db.call(h.createPosDraft,db.input()),/POS_OPEN_SHIFT_REQUIRED/);
 assert.equal(db.state.drafts.length,0);
});
test('Only non-empty HELD orders appear as saved orders',()=>{
 assert.match(backend,/d\.status='HELD' AND EXISTS \(SELECT 1 FROM pos_draft_lines/);
 assert.match(frontend,/setCurrent\(null\);resetOrderControls\(\)/);
 assert.doesNotMatch(frontend,/Your order is being prepared automatically/);
});
