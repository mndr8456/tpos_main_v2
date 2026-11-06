import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAX_BULK_ROWS,BULK_HEADERS,parseCsvTable,normalizeBulkRequest,manifestHash,openingMovementKey,bulkTotals} from '../src/inventory-bulk-logic.js';
import {previewBulkOpening,confirmBulkOpening} from '../src/inventory-opening-bulk.js';
const root=new URL('../../',import.meta.url);const file=p=>readFileSync(new URL(p,root),'utf8');
const key='25bd8e2c-c6b2-458b-8233-bca30fe2a2ba';
const input={branchId:1,reference:'Opening count Nov 2026',requestKey:key,rows:[{sku:'PRD-000001',quantity:'98',unitCost:'3.50'},{sku:'PRD-000002',quantity:'0.00',unitCost:'0.00'}]};
const products=[{id:'144',sku:'PRD-000001',product_name:'AGLIO',product_type:'GOODS',product_structure:'SINGLE',track_stock:1,status:'ACTIVE',is_deleted:0},{id:'145',sku:'PRD-000002',product_name:'BIHUN',product_type:'GOODS',product_structure:'SINGLE',track_stock:1,status:'ACTIVE',is_deleted:0}];
const auth={user:{id:'7',role_code:'OWNER',permissions:['inventory.opening']}};
function fakeDb(){
 const state={started:0,committed:0,rolledBack:0,balances:[],movements:[],lines:[],batch:null,lockedExisting:false};let nextId=300;
 async function execute(sql,params){
  if(sql.startsWith('SELECT id,code,name FROM branches'))return [[{id:'1',code:'MAIN',name:'Main Branch'}]];
  if(sql.startsWith('SELECT id FROM branches'))return [[{id:'1'}]];
  if(sql.includes('FROM inventory_bulk_opening_batches WHERE'))return [[state.batch].filter(Boolean)];
  if(sql.includes('FROM products WHERE sku IN'))return [products.filter(p=>params.includes(p.sku))];
  if(sql.includes('FROM inventory_branch_balances WHERE'))return [state.lockedExisting?[{product_id:'144'}]:[]];
  if(sql.startsWith('INSERT INTO inventory_bulk_opening_batches')){state.batch={id:100,request_key:params[0],payload_hash:params[1],branch_id:params[2],actor_user_id:params[3],row_count:params[5]};return [{insertId:100}];}
  if(sql.startsWith('INSERT INTO inventory_branch_balances')){state.balances.push(params);return [{affectedRows:params.length/5}];}
  if(sql.startsWith('INSERT INTO inventory_movements')){state.movements.push(params);return [{insertId:nextId++}];}
  if(sql.startsWith('INSERT INTO inventory_bulk_opening_lines')){state.lines.push(params);return [{affectedRows:1}];}
  throw Error(`MOCK_SQL_UNEXPECTED: ${sql}`);
 }
 const conn={execute,beginTransaction:async()=>{state.started++;},commit:async()=>{state.committed++;},rollback:async()=>{state.rolledBack++;},release:()=>{}};
 return {state,pool:{execute,getConnection:async()=>conn}};
}
function response(){return {body:null,statusCode:200,set(){return this;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
function request(body,pool,role='OWNER',permissions=['inventory.opening']){return {body,headers:{cookie:'tpos_v2r_session=1.99.'+'A'.repeat(43)},auth:{tenantId:'1',sessionId:'99',user:{...auth.user,role_code:role,permissions},pool}};}

test('R2 quick entries are exact, explicit zero is allowed, missing cost is rejected',()=>{
 const data=normalizeBulkRequest(input);assert.equal(data.errors.length,0);assert.equal(data.rows.length,2);
 assert.deepEqual(bulkTotals(data.rows),{quantity:'98.00',value:'343.00'});
 const bad=normalizeBulkRequest({...input,rows:[{sku:'A',quantity:'0.00',unitCost:'5.00'}]});assert.ok(bad.errors.length);
 assert.ok(normalizeBulkRequest({...input,rows:[{sku:'A',quantity:'1.234',unitCost:'2'}]}).errors.length);
});
test('R2 CSV parses quoted names and skips blank quantities; malicious headers and large files fail',()=>{
 const csv=[BULK_HEADERS.join(','),'PRD-000001,"AGLIO, CHICKEN",MAIN,98,3.50,5.00','PRD-000002,BIHUN,MAIN,,0.00,5.00'].join('\r\n');
 assert.equal(parseCsvTable(csv)[0].productName,'AGLIO, CHICKEN');
 const parsed=normalizeBulkRequest({...input,rows:undefined,csvText:csv});assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].sku,'PRD-000001');
 assert.throws(()=>parseCsvTable('SKU,Qty\nPRD-000001,1'),/CSV_HEADERS_INVALID/);
 assert.throws(()=>parseCsvTable('x'.repeat(2*1024*1024+1)),/CSV_SIZE_INVALID/);
 assert.throws(()=>normalizeBulkRequest({...input,rows:Array(MAX_BULK_ROWS+1).fill({sku:'AA',quantity:'1',unitCost:'2'})}),/ROW_LIMIT/);
});
test('R2 rejects duplicate SKUs, bad branch and reused idempotency hash',()=>{
 const parsed=normalizeBulkRequest({...input,rows:[input.rows[0],input.rows[0]]});assert.equal(parsed.errors.length,1);
 assert.throws(()=>normalizeBulkRequest({...input,branchId:'1 OR 1=1'}),/BRANCH_INVALID/);
 assert.notEqual(manifestHash(normalizeBulkRequest(input),'7'),manifestHash(normalizeBulkRequest({...input,reference:'Different reference'}),'7'));
 assert.notEqual(openingMovementKey(key,144),openingMovementKey(key,145));
 assert.match(openingMovementKey(key,144),/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
test('R2 preview never writes, returns all rows and a short-lived confirmation token',async()=>{
 const {state,pool}=fakeDb();const res=response();await previewBulkOpening(request(input,pool),res);
 assert.equal(res.body.validCount,2);assert.equal(res.body.errorCount,0);assert.equal(res.body.totals.value,'343.00');assert.ok(res.body.previewToken);assert.equal(state.started,0);assert.equal(state.movements.length,0);
});
test('R2 confirm atomically records batch, balances, immutable movements and exact costs; replay is idempotent',async()=>{
 const {state,pool}=fakeDb();const pr=response();await previewBulkOpening(request(input,pool),pr);
 const body={...input,previewToken:pr.body.previewToken,confirmAcknowledged:true};
 const res=response();await confirmBulkOpening(request(body,pool),res);
 assert.equal(res.statusCode,201);assert.equal(res.body.count,2);assert.equal(res.body.accountingPosted,false);
 assert.equal(state.started,1);assert.equal(state.committed,1);assert.equal(state.rolledBack,0);
 assert.equal(state.balances.length,1);assert.equal(state.movements.length,2);assert.equal(state.lines.length,2);
 assert.equal(state.lines[0][4],'3.50');assert.equal(state.lines[1][4],'0.00');
 const retry=response();await confirmBulkOpening(request(body,pool),retry);assert.equal(retry.body.idempotent,true);assert.equal(state.movements.length,2);
});
test('R2 stale branch products or tampered preview reject all writes with rollback',async()=>{
 const {state,pool}=fakeDb();const pr=response();await previewBulkOpening(request(input,pool),pr);
 const body={...input,previewToken:pr.body.previewToken,confirmAcknowledged:true};
 state.lockedExisting=true;
 await assert.rejects(()=>confirmBulkOpening(request(body,pool),response()),/INVENTORY_BULK_STALE_OR_INVALID_REPREVIEW/);
 assert.equal(state.rolledBack,1);assert.equal(state.balances.length,0);assert.equal(state.movements.length,0);
 state.lockedExisting=false;
 await assert.rejects(()=>confirmBulkOpening(request({...body,reference:'Changed after preview'},pool),response()),/PREVIEW_EXPIRED_OR_CHANGED/);
});
test('R2 permission denies non-owner/admin and missing inventory.opening before querying database',async()=>{
 const {pool}=fakeDb();await assert.rejects(()=>previewBulkOpening(request(input,pool,'SUPERVISOR'),response()),/OWNER_ADMIN_ONLY/);
 await assert.rejects(()=>previewBulkOpening(request(input,pool,'ADMIN',[]),response()),/OWNER_ADMIN_ONLY/);
});
test('R2 CSV branch mismatch cannot reach confirm',async()=>{
 const {pool}=fakeDb();const csv=[BULK_HEADERS.join(','),'PRD-000001,AGLIO,OTHER,3,5.00,5.00'].join('\n');
 const res=response();await previewBulkOpening(request({...input,rows:undefined,csvText:csv},pool),res);assert.equal(res.body.canConfirm,false);assert.match(res.body.errors[0].errors.join(','),/BRANCH_CODE_MISMATCH/);
});
test('R2 route/SQL/new tenant preserve existing single stock, receipt and account rules',()=>{
 const app=file('backend/src/app.js');const sql=file('database/038_tenant_inventory_bulk_opening.sql');const tenants=file('backend/src/tenants.js');const inventory=file('frontend/src/Inventory.jsx');const modal=file('frontend/src/InventoryBulkOpening.jsx');const backend=file('backend/src/inventory-opening-bulk.js');
 assert.match(app,/permitted\('inventory\.opening'\),previewBulkOpening/);assert.match(app,/permitted\('inventory\.opening'\),confirmBulkOpening/);
 assert.match(sql,/actual_unit_cost DECIMAL\(18,2\)/);assert.match(sql,/uq_inventory_bulk_batch_key/);assert.match(sql,/movement_id BIGINT UNSIGNED/);assert.match(tenants,/038_tenant_inventory_bulk_opening\.sql/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/);
 assert.match(backend,/beginTransaction\(\)/);assert.match(backend,/await conn\.commit\(\)/);assert.match(backend,/await conn\.rollback\(\)/);
 assert.match(inventory,/Bulk Opening Stock/);assert.match(modal,/CSV Template/);assert.match(modal,/Quick Entry/);assert.match(modal,/Preview/);
});
