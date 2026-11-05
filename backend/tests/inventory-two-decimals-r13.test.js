import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {inventoryOpening,inventoryReceive,inventoryIssue} from '../src/inventory-cost.js';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const ui=read('frontend/src/Inventory.jsx');
const api=read('backend/src/inventory.js');
const migration=read('database/023_tenant_inventory_two_decimals.sql');
const installer=read('backend/scripts/setup-inventory-two-decimals.js');

test('Stock list has exact approved headers in the approved order',()=>{
 assert.match(ui,/\['SKU','Product','Branch','Status','QOH','Cost \(RM\)','Total \(RM\)','', 'Actions'\]/);
 assert.doesNotMatch(ui,/\['#','SKU','Product','Branch','Stock Status','Quantity On Hand'/);
 assert.match(ui,/colSpan=\{canSeeValue\?9:7\}/);
});
test('All Inventory visible quantities, ledger quantities, exports and modal default use two decimals',()=>{
 assert.match(ui,/r\.initialized\?decimal\(r\.quantity_on_hand\)/);
 assert.match(ui,/exact\(m\.quantity_delta\)/);
 assert.match(ui,/exact\(m\.quantity_after\)/);
 assert.match(ui,/r\.initialized\?decimal\(r\.average_cost\)/);
 assert.match(ui,/r\.initialized\?decimal\(r\.carrying_value\)/);
 assert.match(ui,/r\.initialized\?decimal\(r\.quantity_on_hand\):''/);
 assert.match(ui,/\[quantity,setQuantity\]=useState\('0\.00'\)/);
 assert.match(ui,/\[unitCost,setUnitCost\]=useState\('0\.00'\)/);
 assert.match(ui,/\{busy\?'Saving\.\.\.':'Save'\}/);
 assert.doesNotMatch(ui,/0\.000000(?=[^0-9])/);
});
test('Inventory decimal presentation uses BigInt, avoiding JS Number precision loss',()=>{
 const snippet=ui.match(/const centsOf=value=>\{[^\n]+\};\nconst formatCents=cents=>\{[^\n]+\};\nconst decimal=value=>\{[^\n]+\};/);
 assert.ok(snippet);
 const functions=runInNewContext(snippet[0]+'\n({decimal,formatCents,centsOf})',{});
 for(const [input,expected] of [['5.000000','5.00'],['2.75666667','2.76'],['1000000000000000.99','1,000,000,000,000,000.99'],['-2.505','-2.51'],['0','0.00']])assert.equal(functions.decimal(input),expected);
});
test('Inventory API and math reject more than two decimal places',()=>{
 assert.match(api,/quantity:decimal2,unitCost:decimal2/);
 for(const input of ['1.001','0.005','2.75666667'])assert.throws(()=>inventoryOpening('1',input));
 assert.throws(()=>inventoryOpening('5.001','2.00'));
 assert.deepEqual(inventoryOpening('18','2.76'),{quantity:'18.00',carryingValue:'49.68',averageCost:'2.76'});
 const updated=inventoryReceive(inventoryOpening('2','2.50'),'3','4.00');
 assert.deepEqual(updated,{quantity:'5.00',carryingValue:'17.00',averageCost:'3.40'});
 const issue=inventoryIssue(updated,'2');
 assert.equal(issue.issuedCost,'6.80');
});
test('023 only alters eight inventory decimal columns to DECIMAL(18,2) and keeps historic 022 intact',()=>{
 assert.equal((migration.match(/MODIFY COLUMN/g)||[]).length,8);
 assert.equal((migration.match(/MODIFY COLUMN [a-z_]+ DECIMAL\(18,2\) NOT NULL/g)||[]).length,8);
 assert.doesNotMatch(migration,/\b(?:DROP TABLE|TRUNCATE|DELETE FROM|UPDATE products|CREATE DATABASE)\b/i);
 assert.match(read('backend/src/tenants.js'),/023_tenant_inventory_two_decimals\.sql/);
 assert.match(read('database/022_tenant_inventory_foundation.sql'),/quantity_on_hand DECIMAL\(18,6\)/);
});
test('Migration preflight fails closed on non-cent historical amounts and supports re-run',()=>{
 assert.match(installer,/process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/<> ROUND\(\$\{n\},2\)/);
 assert.match(installer,/BLOCKED_PRECISION_LOSS/);
 assert.match(installer,/INVENTORY_PRECISION_CHANGED_AFTER_PREFLIGHT/);
 assert.match(installer,/if\(now\.changes\[table\]\)/);
 assert.match(installer,/if\(failed\)process\.exitCode=1/);
});
