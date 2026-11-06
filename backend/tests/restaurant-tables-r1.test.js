import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const sql=read('database/021_tenant_restaurant_tables.sql');
const service=read('backend/src/restaurant-tables.js');
const pos=read('backend/src/pos-drafts.js');
const ui=read('frontend/src/RestaurantTables.jsx');
const terminal=read('frontend/src/PosTerminal.jsx');
const app=read('backend/src/app.js');
const installer=read('backend/scripts/setup-restaurant-tables.js');
function parsers(){
 const code=read('backend/src/restaurant-tables-csv.js').replace(/import \{z\} from 'zod';/,'').replaceAll('export const ','const ').replaceAll('export function ','function ');
 const stub={};for(const f of ['trim','min','max','default','strict','int','positive','optional'])stub[f]=()=>stub;
 const z={string:()=>stub,number:()=>stub,coerce:{number:()=>stub},object:()=>stub,enum:()=>stub};
 const sandbox={z,Buffer,Error};vm.runInNewContext(code+'\n globalThis.csv={parseTableCsv,csvRows,csvTemplate};',sandbox);
 return sandbox.csv;
}
test('SQL 021 creates V1 fields plus tenant branch isolation and append-only table audit',()=>{
 for(const field of ['table_number','table_name','table_area','seating_capacity','table_status','sort_order','is_deleted','branch_id'])assert.match(sql,new RegExp(`\\b${field}\\b`));
 assert.match(sql,/CREATE TABLE IF NOT EXISTS restaurant_tables/);assert.match(sql,/CREATE TABLE IF NOT EXISTS restaurant_table_audit_logs/);
 assert.match(sql,/uq_restaurant_table_branch_number\(branch_id,table_number\)/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|tpos_v1_/i);
});
test('SQL 021 reserves one live draft per table and makes HOLD occupy, DISCARD release',()=>{
 assert.match(sql,/active_table_id BIGINT UNSIGNED GENERATED ALWAYS AS/);
 assert.match(sql,/status IN \('DRAFT','HELD'\)/);
 assert.match(sql,/UNIQUE KEY uq_pos_draft_live_table\(active_table_id\)/);
 assert.match(sql,/chk_pos_dine_in_table/);
});
test('Cashier can view table master but never edit/delete/import/export',()=>{
 assert.match(sql,/WHERE r.code IN \('SUPERVISOR','CASHIER','HR'\)/);
 assert.match(sql,/SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='restaurant_tables.view'/);
 for(const [method,url,permission] of [['post','', 'create'],['put','/:id','update'],['delete','/:id','delete']]){
  assert.ok(app.includes(`app.${method}('/api/v2/restaurant-tables${url}',authenticate,permitted('restaurant_tables.${permission}')`));
 }
 assert.match(ui,/has\('restaurant_tables.create'\)/);assert.match(ui,/has\('restaurant_tables.delete'\)/);
});
test('R1 CSV import parses empty / duplicate / invalid rows, legacy header and quotes safely',()=>{
 const c=parsers();const template=c.csvTemplate();assert.match(template,/Table Number,?/);assert.equal(c.parseTableCsv(template).length,1);
 const header='Table Number,Table Name,Table Area,Seating Capacity,Table Status,Status,Sort Order,Branch Code';
 const rows=`${header}\r\nT01,"Hall, West",Main,4,AVAILABLE,ACTIVE,-1,MAIN\r\nT02,Table 2,Outside,6,RESERVED,ACTIVE,2,MAIN`;
 const parsed=c.parseTableCsv(rows);assert.equal(parsed.length,2);assert.equal(parsed[0].tableName,'Hall, West');assert.equal(parsed[0].sortOrder,-1);
 assert.throws(()=>c.parseTableCsv(`${rows}\r\nT01,Duplicate,Main,4,AVAILABLE,ACTIVE,1,MAIN`),/DUPLICATE/);
 assert.throws(()=>c.parseTableCsv(`${header}\nT01,Bad,Main,0,AVAILABLE,ACTIVE,1,MAIN`),/INVALID/);
 assert.throws(()=>c.parseTableCsv('junk'),/CSV_EMPTY/);
 const legacy=c.parseTableCsv('Table Number,Table Name,Table Area,Seating Capacity,Table Status,Status,Sort Order\nT03,Legacy,Main,4,AVAILABLE,ACTIVE,1');assert.equal(legacy.length,1);
 const v1=c.parseTableCsv('table_number,table_name,table_area,seating_capacity,table_status,status,sort_order\nT04,Original V1,Indoor,4,available,active,1');assert.equal(v1[0].tableNumber,'T04');
 const exported=c.parseTableCsv('id,table_number,table_name,table_area,seating_capacity,table_status,status,sort_order,created_at,updated_at\n5,T05,Original Export,Indoor,2,available,active,2,2026-01-01,2026-01-02');assert.equal(exported[0].tableName,'Original Export');
});
test('R1 export formula-escapes untrusted names without breaking negative numeric sort',()=>{
 const c=parsers();const out=c.csvRows([['T01','=MALICIOUS','Area',4,'AVAILABLE','ACTIVE',-10,'MAIN']]);
 assert.match(out,/"'=MALICIOUS"/);assert.match(out,/"-10"/);assert.doesNotMatch(out,/"'-10"/);
});
test('R1 import uses transactional Confirm and branch validation; Preview cannot write',()=>{
 assert.match(service,/parseTableCsv\(csv\)/);
 assert.match(service,/async function validateImport/);
 assert.match(service,/export async function previewTableImport/);
 assert.match(service,/export async function importTables/);
 const preview=service.slice(service.indexOf('export async function previewTableImport'),service.indexOf('export async function importTables'));
 assert.doesNotMatch(preview,/INSERT INTO|UPDATE restaurant_tables/);
 assert.match(service,/transact\(req.auth.pool,async conn=>/);
 assert.match(service,/await audit\(conn,req,ins.insertId,'IMPORT'/);
});
test('R1 Dine In assignment requires own open shift and locks target table before draft',()=>{
 const body=pos.slice(pos.indexOf('export async function assignPosTable'));
 assert.match(body,/POS_DINE_IN_NOT_APPLICABLE/);
 assert.match(body,/POS_DRAFT_NOT_OWNED/);
 assert.match(body,/SELECT \* FROM restaurant_tables WHERE id=\? AND is_deleted=0 FOR UPDATE/);
 assert.ok(body.indexOf('FOR UPDATE')<body.indexOf('const d=await draft'));
 assert.match(body,/await ensureEditable\(conn,req,d\)/);
 assert.match(body,/POS_TABLE_OCCUPIED/);
 assert.match(body,/await command\(conn,d,'ASSIGN_TABLE'/);
 assert.match(body,/UPDATE pos_drafts SET table_id=\?,order_scope=\?,version=version\+1/);
});
test('R1 Hold never frees table, Discard records release audit, checkout stays blocked',()=>{
 assert.match(pos,/data.status==='DISCARDED'&&d.table_id/);
 assert.match(pos,/reason:'DISCARDED'/);
 assert.match(terminal,/Select Dine In Table/);
 assert.match(terminal,/Held \/ Saved Orders/);
 assert.match(terminal,/PosMultiPayment/);
 assert.match(pos,/checkoutAvailable:false/);
});
test('Installer is explicit --apply, registers new tenants and refuses partial migration',()=>{
 assert.match(installer,/process.argv.includes\('--apply'\)/);
 assert.match(installer,/PARTIAL_SCHEMA_REQUIRES_MANUAL_REVIEW/);
 assert.match(installer,/WHERE status='ACTIVE'/);
 assert.match(read('backend/src/tenants.js'),/executeSchema\(dbName,'021_tenant_restaurant_tables.sql'\)/);
 assert.match(read('backend/package.json'),/db:restaurant-tables/);
});
test('UI and nav preserve role restrictions, auto-search, table status and branch lists',()=>{
 for(const x of ['Search Restaurant Tables','Filter Branch','Filter Table Status','Import Restaurant Tables','Preview Import','Confirm Import','Table Activity Log'])assert.ok(ui.includes(x));
 assert.match(read('frontend/src/App.jsx'),/RestaurantTables profile=\{profile\}/);
 assert.match(read('frontend/src/App.jsx'),/canViewRestaurantTables/);
 assert.match(terminal,/branchTables/);
 assert.match(terminal,/assigned_cashier/);
});
function assignmentHarness({tableStatus='AVAILABLE',occupant=null,waiterOccupant=null,owner=7,branch=1,company='RESTAURANT'}={}){
 const code=pos.slice(pos.indexOf('export async function assignPosTable')).replace('export async function','async function');
 const events=[];const d={id:10,branch_id:1,cashier_user_id:7,shift_id:4,table_id:null,status:'DRAFT',version:1};
 const conn={async execute(query,args){
  if(query.startsWith('SELECT branch_id,cashier_user_id,table_id FROM pos_drafts'))return [[{branch_id:branch,cashier_user_id:owner,table_id:d.table_id}]];
  if(query.startsWith('SELECT * FROM restaurant_tables'))return [[{id:3,branch_id:branch,status:'ACTIVE',table_status:tableStatus}]];
  if(query.startsWith('SELECT id,cashier_user_id FROM pos_drafts WHERE active_table_id='))return [[occupant]];
  // Order Terminal R1: a submitted WAITER Dine In order also reserves its table.
  if(query.startsWith('SELECT id FROM waiter_orders WHERE active_table_id='))return [[waiterOccupant]];
  if(query.startsWith('UPDATE pos_drafts SET table_id=')){d.table_id=args[0];d.order_scope=args[1];d.version++;events.push('UPDATE');return [{}];}
  if(query.startsWith('INSERT INTO restaurant_table_audit_logs')){events.push('AUDIT');return [{}];}
  throw Error('UNEXPECTED_SQL '+query);
 }};
 const sandbox={id:{parse:x=>Number(x)},assignSchema:{parse:x=>x},
  has:(req,p)=>req.auth.user.permissions.includes(p),bad:(msg,status)=>Object.assign(Error(msg),{status}),
  access:(req,b)=>{if(!req.auth.user.branchIds.includes(String(b)))throw Error('NO_BRANCH_ACCESS');},
  transact:async(pool,fn)=>fn(conn),draft:async()=>d,
  command:async(_,draft,action,key,params)=>{if(params.expectedVersion!==draft.version)throw Error('VERSION_CONFLICT');return true;},
  ensureEditable:async()=>{if(d.status!=='DRAFT')throw Error('MUST_RESUME');},
  detail:async()=>({draft:{...d},checkoutAvailable:false}),log:async()=>{events.push('POS_AUDIT');},Number,String,JSON,Error,Set,Map,Promise};
 vm.runInNewContext(code+'\n globalThis.handler=assignPosTable',sandbox);
 const req={params:{id:'10'},body:{tableId:3,expectedVersion:1,requestKey:randomUUID()},auth:{company:{business_type:company},pool:{},user:{id:7,role_code:'CASHIER',branchIds:['1'],permissions:['pos.cart.manage']}}};
 const res={set(){return this;},json(data){this.value=data;return this;}};
 return {handler:sandbox.handler,req,res,events,d};
}
test('Dine In handler actually assigns an available table and audits change',async()=>{
 const h=assignmentHarness();await h.handler(h.req,h.res);
 assert.equal(h.res.value.draft.order_scope,'DINE_IN');assert.equal(h.res.value.draft.table_id,3);
 assert.deepEqual(h.events,['UPDATE','AUDIT','POS_AUDIT']);
 assert.equal(h.res.value.checkoutAvailable,false);
});
test('Dine In handler blocks occupied and unavailable tables without writes',async()=>{
 for(const options of [{occupant:{id:12,cashier_user_id:8}},{waiterOccupant:{id:25}},{tableStatus:'RESERVED'},{tableStatus:'CLEANING'}]){
  const h=assignmentHarness(options);await assert.rejects(()=>h.handler(h.req,h.res),/POS_TABLE_OCCUPIED|POS_TABLE_NOT_AVAILABLE/);assert.deepEqual(h.events,[]);
 }
});
test('Dine In handler blocks unowned order and inappropriate business type',async()=>{
 for(const options of [{owner:8},{company:'GROCERY'}]){
  const h=assignmentHarness(options);await assert.rejects(()=>h.handler(h.req,h.res),/POS_DRAFT_NOT_OWNED|POS_DINE_IN_NOT_APPLICABLE/);assert.deepEqual(h.events,[]);
 }
});
