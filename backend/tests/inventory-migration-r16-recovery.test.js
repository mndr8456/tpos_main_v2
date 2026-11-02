// Offline migration-runner contract tests: simulate a partially migrated MySQL schema.
// These tests NEVER connect to MySQL or write production data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root=new URL('../../',import.meta.url);
const source=readFileSync(new URL('backend/scripts/setup-inventory-two-decimals.js',root),'utf8');
const body=source.replace(/^import \{centralPool,tenantPool,closePools\} from '\.\.\/src\/database\.js';\s*/m,'');
const runScript=Object.getPrototypeOf(async function(){}).constructor;

const schema={
 inventory_branch_balances:{quantity_on_hand:[18,2],carrying_value:[18,2],average_cost:[18,2]},
 inventory_movements:{quantity_delta:[18,2],value_delta:[24,2],quantity_after:[18,2],carrying_value_after:[24,2],average_cost_after:[18,2]}
};
function harness(initial,{overflow=false}={}){
 const columns=structuredClone(initial);
 const altered=[];
 const output=[];
 const failures=[];
 const pool={
  async execute(sql){
   assert.match(sql,/information_schema\.columns/);
   return [Object.entries(columns).flatMap(([table,definitions])=>Object.entries(definitions).map(([name,pair])=>({
    table_name:table,column_name:name,data_type:'decimal',numeric_precision:pair[0],numeric_scale:pair[1],is_nullable:'NO'
   })))];
  },
  async query(sql){
   if(/^SELECT /i.test(sql)){
    const table=sql.match(/FROM (inventory_branch_balances|inventory_movements)/)?.[1];
    assert.ok(table);
    const counts=Object.fromEntries(Object.keys(columns[table]).flatMap(name=>[
     [name,0], [`range_${name}`, overflow&&name==='value_delta'?1:0]
    ]));
    return [[counts]];
   }
   const match=sql.match(/^ALTER TABLE (inventory_branch_balances|inventory_movements) /);
   assert.ok(match,`Unexpected database write: ${sql}`);
   const table=match[1];
   const names=[...sql.matchAll(/MODIFY COLUMN ([a-z_]+) DECIMAL\(18,2\) NOT NULL/g)].map(x=>x[1]);
   assert.ok(names.length);
   for(const name of names){
    assert.ok(columns[table][name],`Unknown column ${table}.${name}`);
    assert.notDeepEqual(columns[table][name],[18,2],`Unneeded ALTER of ${table}.${name}`);
    columns[table][name]=[18,2];
   }
   altered.push({table,names});
   return [];
  }
 };
 const centralPool=()=>({execute:async()=>[[{id:1,db_name:'tpos_v2_tenant_1',status:'ACTIVE'}]]});
 const tenantPool=()=>pool;
 const closePools=async()=>{};
 const run=async(apply)=>{
  const fakeProcess={argv:['node','setup-inventory-two-decimals.js',...(apply?['--apply']:[])],exitCode:0};
  await new runScript('centralPool','tenantPool','closePools','process','console',body)(centralPool,tenantPool,closePools,fakeProcess,{
   log:s=>output.push(JSON.parse(s)),error:s=>failures.push(JSON.parse(s))
  });
  return fakeProcess.exitCode;
 };
 return {columns,altered,output,failures,run};
}

test('R1.6: readonly mode detects DECIMAL(24,2) but never alters it',async()=>{
 const h=harness(schema);
 assert.equal(await h.run(false),0);
 assert.deepEqual(h.altered,[]);
 assert.equal(h.output[0].status,'MISSING');
 assert.equal(h.output[0].applied,false);
});

test('R1.6: --apply changes only pending ledger columns; second pass is CURRENT',async()=>{
 const h=harness(schema);
 assert.equal(await h.run(true),0);
 assert.deepEqual(h.altered,[{table:'inventory_movements',names:['value_delta','carrying_value_after']}]);
 assert.equal(h.output[0].status,'APPLIED');
 assert.equal(await h.run(false),0);
 assert.equal(h.output.at(-2).status,'CURRENT');
 assert.equal(h.altered.length,1);
});

test('R1.6: out-of-range monetary value blocks --apply before ANY ALTER',async()=>{
 const h=harness(schema,{overflow:true});
 assert.equal(await h.run(true),1);
 assert.deepEqual(h.altered,[]);
 assert.equal(h.failures[0].status,'BLOCKED_DECIMAL_OVERFLOW');
 assert.equal(h.failures[0].rangeViolations[0].column,'inventory_movements.value_delta');
});
