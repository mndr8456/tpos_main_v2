import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const backend=fs.readFileSync(path.join(root,'backend/src/pos-drafts.js'),'utf8');
const frontend=fs.readFileSync(path.join(root,'frontend/src/PosTerminal.jsx'),'utf8');
const style=fs.readFileSync(path.join(root,'frontend/src/PosTerminal.css'),'utf8');

function mockZod(){
 const v={};
 for(const name of ['int','positive','max','regex','refine','strict','default','optional','trim','uuid','min'])v[name]=()=>v;
 v.parse=input=>input;
 return {coerce:{number:()=>v},number:()=>v,string:()=>v,enum:()=>v,boolean:()=>v,object:()=>v};
}
function loadHandlers(){
 const script=backend.replace(/^import .*?;\s*$/gm,'').replace(/\bexport\s+(?=async\s+function|function|const\s)/g,'')+'\n globalThis.routeHandlers={createPosDraft,changePosDraftStatus};';
 const sandbox={z:mockZod(),createHash,evaluateDiscount:()=>{},evaluateVoucher:()=>{},totalDraftLines:()=>({lines:[],subtotal:'0.00'}),format:()=>{},Intl,Date,JSON,Number,String,Error,Object,Promise,console};
 vm.runInNewContext(script,sandbox,{filename:'pos-drafts.js'});
 return sandbox.routeHandlers;
}
function fakeDb({hasShift=true,failNextInsert=false}={}){
 let db={drafts:[],commands:[],audits:[],nextId:1};
 let shiftId=5;
 const conn={
  async beginTransaction(){this.snapshot=structuredClone(db);},
  async commit(){this.snapshot=null;},
  async rollback(){if(this.snapshot)db=this.snapshot;this.snapshot=null;},
  release(){},
  async execute(sql,args=[]){
   if(sql.includes('FROM cash_shifts WHERE'))return [[hasShift?{id:shiftId,status:'OPEN',branch_id:1}:undefined]];
   if(sql.includes('FROM pos_drafts WHERE request_key='))return [[db.drafts.find(d=>d.request_key===args[0])]];
   if(sql.includes("FROM pos_drafts WHERE cashier_user_id=?")&&sql.includes("status='DRAFT'"))return [[db.drafts.filter(d=>d.cashier_user_id===args[0]&&d.shift_id===args[1]&&d.branch_id===args[2]&&d.status==='DRAFT').at(-1)]];
   if(sql.includes('FROM pos_drafts d JOIN branches b')){
    const found=db.drafts.find(d=>d.id===Number(args[0]));
    return [[found?{...found,branch_name:'Main Branch'}:undefined]];
   }
   if(sql.includes('FROM pos_draft_lines'))return [[]];
   if(sql.includes('FROM pos_draft_commands WHERE'))return [[db.commands.find(c=>c.draft_id===Number(args[0])&&c.request_key===args[1])]];
   if(sql.startsWith('INSERT INTO pos_drafts(')){
    if(failNextInsert){failNextInsert=false;throw new Error('SIMULATED_DB_INSERT_FAILURE');}
    const [request_key,branch_id,cashier_user_id,shift_id,order_scope]=args;
    if(db.drafts.some(d=>d.request_key===request_key))throw new Error('DUPLICATE_REQUEST_KEY');
    const id=db.nextId++;
    db.drafts.push({id,request_key,branch_id,cashier_user_id,shift_id,order_scope,status:'DRAFT',version:1});
    return [{insertId:id}];
   }
   if(sql.startsWith('INSERT INTO pos_draft_audit_logs')){db.audits.push({id:db.audits.length+1, draftId:args[0], actor:args[1],action:args[2]});return [{}];}
   if(sql.startsWith('INSERT INTO pos_draft_commands')){db.commands.push({draft_id:Number(args[0]),request_key:args[1],request_hash:args[2]});return [{}];}
   if(sql.startsWith('UPDATE pos_drafts SET status=')){
    const d=db.drafts.find(d=>d.id===Number(args[1]));d.status=args[0];d.version+=1;return [{}];
   }
   throw new Error('UNEXPECTED_SQL '+sql);
  }
 };
 const pool={async getConnection(){return conn;}};
 const req=body=>({body,auth:{pool,user:{id:7,role_code:'CASHIER',permissions:['pos.cart.manage'],branchIds:['1']}}});
 const invoke=async(handler,body,id)=>{
  const response={payload:undefined,status(code){this.statusCode=code;return this;},json(value){this.payload=value;return this;}};
  await handler({...req(body),params:{id}},response);return response.payload;
 };
 return {get state(){return db;},invoke,request:req,setShiftId(value){shiftId=value;}};
}

test('R1.2 automatic terminal entry reuses one editable DRAFT for an OPEN shift',async()=>{
 const h=loadHandlers(),db=fakeDb();
 const first=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 const second=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 assert.equal(first.draft.id,second.draft.id);
 assert.equal(db.state.drafts.length,1);
 assert.equal(db.state.drafts[0].status,'DRAFT');
});

test('R1.2 Hold atomically creates a different empty DRAFT and preserves held order',async()=>{
 const h=loadHandlers(),db=fakeDb();
 const original=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 const successor=await db.invoke(h.changePosDraftStatus,{status:'HELD',expectedVersion:1,requestKey:randomUUID(),createNext:true},original.draft.id);
 assert.equal(successor.heldDraftId,original.draft.id);
 assert.notEqual(successor.draft.id,original.draft.id);
 assert.equal(successor.draft.status,'DRAFT');
 assert.equal(db.state.drafts.find(d=>String(d.id)===original.draft.id).status,'HELD');
 assert.equal(db.state.drafts.length,2);
 assert.deepEqual(Array.from(db.state.audits.map(a=>a.action)),['CREATE','HOLD','CREATE']);
});

test('R1.2 repeated Hold requestKey returns same successor with no duplicates',async()=>{
 const h=loadHandlers(),db=fakeDb();
 const old=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 const command={status:'HELD',expectedVersion:1,requestKey:randomUUID(),createNext:true};
 const a=await db.invoke(h.changePosDraftStatus,command,old.draft.id);
 const b=await db.invoke(h.changePosDraftStatus,command,old.draft.id);
 assert.equal(a.draft.id,b.draft.id);
 assert.equal(db.state.drafts.length,2);
 assert.equal(db.state.audits.length,3);
});

test('R1.2 failed successor insert rolls back Hold, command and audit',async()=>{
 const h=loadHandlers(),db=fakeDb();
 const old=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 // Force failure on successor INSERT during status transaction by replacing pool connection execute.
 const conn=await db.request({}).auth.pool.getConnection();
 const real=conn.execute.bind(conn);let failed=false;
 conn.execute=async(sql,args)=>{if(!failed&&sql.startsWith('INSERT INTO pos_drafts(')){failed=true;throw Error('SIMULATED_DB_INSERT_FAILURE');}return real(sql,args);};
 await assert.rejects(()=>db.invoke(h.changePosDraftStatus,{status:'HELD',expectedVersion:1,requestKey:randomUUID(),createNext:true},old.draft.id),/SIMULATED_DB_INSERT_FAILURE/);
 assert.equal(db.state.drafts.length,1);
 assert.equal(db.state.drafts[0].status,'DRAFT');
 assert.equal(db.state.commands.length,0);
 assert.deepEqual(db.state.audits.map(x=>x.action),['CREATE']);
});

test('R1.2 no OPEN shift means automatic terminal entry cannot create an order',async()=>{
 const h=loadHandlers(),db=fakeDb({hasShift:false});
 await assert.rejects(()=>db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'}),/POS_OPEN_SHIFT_REQUIRED/);
 assert.equal(db.state.drafts.length,0);
});


test('R1.2 held order is not auto-resumed when terminal ensures next order',async()=>{
 const h=loadHandlers(),db=fakeDb();
 const held=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 const next=await db.invoke(h.changePosDraftStatus,{status:'HELD',expectedVersion:1,requestKey:randomUUID(),createNext:true},held.draft.id);
 const reentered=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 assert.equal(reentered.draft.id,next.draft.id);
 assert.equal(db.state.drafts.find(d=>String(d.id)===held.draft.id).status,'HELD');
 assert.equal(db.state.drafts.length,2);
});

test('R1.2 cannot use a new shift to Hold an old-shift order and generate a successor',async()=>{
 const h=loadHandlers(),db=fakeDb();
 const original=await db.invoke(h.createPosDraft,{branchId:1,requestKey:randomUUID(),ensureExisting:true,orderScope:'TAKE_AWAY'});
 db.setShiftId(6);
 await assert.rejects(()=>db.invoke(h.changePosDraftStatus,{status:'HELD',expectedVersion:1,requestKey:randomUUID(),createNext:true},original.draft.id),/POS_ORIGINAL_SHIFT_CLOSED/);
 assert.equal(db.state.drafts.length,1);
 assert.equal(db.state.drafts[0].status,'DRAFT');
});

test('R1.2 POS frontend removes New Order button and auto-prepares after Hold',()=>{
 assert.ok(!frontend.includes('pos-new-order'));
 assert.ok(!frontend.includes('onClick={newDraft}'));
 assert.ok(!style.includes('.pos-new-order'));
 assert.match(frontend,/ensureExisting:true/);
 assert.match(frontend,/next==='HELD'\?\{createNext:true\}/);
 assert.match(frontend,/resetOrderControls\(\)/);
 assert.match(frontend,/Order held\. A new empty order is ready/);
 assert.match(frontend,/Saved Orders/);
 assert.match(frontend,/Order resumed/);
 assert.doesNotMatch(frontend,/press New Order/);
});
