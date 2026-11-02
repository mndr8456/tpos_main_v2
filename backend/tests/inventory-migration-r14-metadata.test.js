import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const script=read('backend/scripts/setup-inventory-two-decimals.js');
const start=script.indexOf('const definitions=');
const end=script.indexOf('\ntry{\n const [tenants]');
assert.ok(start>=0&&end>start,'Could not isolate installer preflight for testing');
const inspect=runInNewContext(`${script.slice(start,end)}\ninspect`,{});

const inventoryColumns={
 inventory_branch_balances:{quantity_on_hand:[18,6],carrying_value:[24,8],average_cost:[18,8]},
 inventory_movements:{quantity_delta:[18,6],value_delta:[24,8],quantity_after:[18,6],carrying_value_after:[24,8],average_cost_after:[18,8]}
};
const makeColumns=(current=false)=>Object.entries(inventoryColumns).flatMap(([table,cols])=>
 Object.entries(cols).map(([name,legacy])=>({
  table_name:table,column_name:name,data_type:'decimal',
  numeric_precision:current?18:legacy[0],numeric_scale:current?2:legacy[1],is_nullable:'NO'
 })));
const poolFor=(columns,counts={})=>({
 execute:async(sql)=>{
  for(const alias of ['table_name','column_name','data_type','numeric_precision','numeric_scale','is_nullable'])
   assert.match(sql,new RegExp('AS '+alias+'\\b'),'Explicit INFORMATION_SCHEMA alias missing: '+alias);
  return [columns];
 },
 query:async(sql)=>{
  const table=sql.match(/FROM (inventory_branch_balances|inventory_movements)/)?.[1];
  assert.ok(table,'Expected inventory-only precision preflight query');
  assert.match(sql,/<> ROUND\(/);
  const names=Object.keys(inventoryColumns[table]);
  return [[Object.fromEntries(names.flatMap(name=>[
   [name,counts[`${table}.${name}`]??0],
   [`range_${name}`,counts[`range_${table}.${name}`]??0]
  ]))]];
 }
});

test('023: 8 original Inventory DECIMAL columns are recognized using stable MySQL aliases',async()=>{
 const result=await inspect(poolFor(makeColumns()));
 assert.equal(result.columnsChecked,8);
 assert.deepEqual(JSON.parse(JSON.stringify(result.changes)),{
  inventory_branch_balances:true,inventory_movements:true
 });
 assert.equal(result.violations.length,0);
});

test('023: fully migrated columns return CURRENT without extra ALTER or preflight reads',async()=>{
 const result=await inspect(poolFor(makeColumns(true)));
 assert.equal(result.columnsChecked,8);
 assert.deepEqual(JSON.parse(JSON.stringify(result.changes)),{
  inventory_branch_balances:false,inventory_movements:false
 });
 assert.equal(result.violations.length,0);
});

test('023: existing fractional ledger values block precision loss',async()=>{
 const result=await inspect(poolFor(makeColumns(),{'inventory_movements.value_delta':3}));
 assert.deepEqual(JSON.parse(JSON.stringify(result.violations)),[
  {column:'inventory_movements.value_delta',rows:3}
 ]);
});

test('023: missing column or wrong DECIMAL schema is not misreported as a safe migration',async()=>{
 const columns=makeColumns();
 await assert.rejects(inspect(poolFor(columns.slice(1))),/INVENTORY_022_SCHEMA_MISSING:inventory_branch_balances.quantity_on_hand/);
 const wrong=makeColumns();wrong[0].numeric_scale=5;
 await assert.rejects(inspect(poolFor(wrong)),/INVENTORY_SCHEMA_INCOMPATIBLE:inventory_branch_balances.quantity_on_hand/);
});

test('023: historical Inventory 022 and Product 007 definitions remain intact',()=>{
 const inventory=read('database/022_tenant_inventory_foundation.sql');
 const product=read('database/007_tenant_products.sql');
 const migration=read('database/023_tenant_inventory_two_decimals.sql');
 assert.match(inventory,/quantity_on_hand DECIMAL\(18,6\)/);
 assert.match(inventory,/carrying_value DECIMAL\(24,8\)/);
 assert.match(inventory,/average_cost DECIMAL\(18,8\)/);
 assert.match(product,/units_per_base DECIMAL\(18,6\)/);
 assert.match(product,/quantity_per_parent DECIMAL\(18,6\)/);
 assert.match(product,/selling_price DECIMAL\(18,4\)/);
 assert.equal((migration.match(/MODIFY COLUMN/g)||[]).length,8);
 assert.doesNotMatch(script,/DROP TABLE|UPDATE inventory_movements SET|UPDATE products SET/);
});


test('R1.6: a partially migrated DECIMAL(24,2) ledger is convertible, not incompatible',async()=>{
 const columns=makeColumns();
 for(const column of columns){
  if(['carrying_value','value_delta','carrying_value_after'].includes(column.column_name))column.numeric_scale=2;
 }
 const result=await inspect(poolFor(columns));
 assert.deepEqual(JSON.parse(JSON.stringify(result.changes)),{
  inventory_branch_balances:true, inventory_movements:true
 });
 assert.deepEqual(JSON.parse(JSON.stringify(result.pendingColumns.inventory_movements)),[
  'quantity_delta','value_delta','quantity_after','carrying_value_after','average_cost_after'
 ]);
 assert.equal(result.violations.length,0);
 assert.equal(result.rangeViolations.length,0);
});

test('R1.6: a half-completed migration recognizes CURRENT columns and only converts pending ones',async()=>{
 const columns=makeColumns(true);
 const ledgerValue=columns.find(c=>c.table_name==='inventory_movements'&&c.column_name==='value_delta');
 ledgerValue.numeric_precision=24;
 const result=await inspect(poolFor(columns));
 assert.deepEqual(JSON.parse(JSON.stringify(result.changes)),{
  inventory_branch_balances:false,inventory_movements:true
 });
 assert.deepEqual(JSON.parse(JSON.stringify(result.pendingColumns)),{
  inventory_branch_balances:[],inventory_movements:['value_delta']
 });
 assert.equal(result.violations.length,0);
 assert.match(script,/now\.pendingColumns\[table\]\.map\(name=>/);
});

test('R1.6: a DECIMAL(24,2) value outside DECIMAL(18,2) range blocks migration',async()=>{
 const columns=makeColumns(true);
 columns.find(c=>c.table_name==='inventory_movements'&&c.column_name==='value_delta').numeric_precision=24;
 const result=await inspect(poolFor(columns,{'range_inventory_movements.value_delta':2}));
 assert.deepEqual(JSON.parse(JSON.stringify(result.rangeViolations)),[
  {column:'inventory_movements.value_delta',rows:2}
 ]);
 assert.match(script,/BLOCKED_DECIMAL_OVERFLOW/);
 assert.match(script,/ABS\(\$\{n\}\) >= 10000000000000000/);
});

test('R1.6: previously valid 24,8 data with sub-cent values remains blocked',async()=>{
 const result=await inspect(poolFor(makeColumns(),{'inventory_movements.value_delta':1}));
 assert.deepEqual(JSON.parse(JSON.stringify(result.violations)),[
  {column:'inventory_movements.value_delta',rows:1}
 ]);
});
