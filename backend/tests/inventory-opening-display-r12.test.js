// Opening Stock two-decimal UI; no precision beyond 2dp can be saved to Inventory DB.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../frontend/src/Inventory.jsx',import.meta.url),'utf8');

test('Opening Quantity and Actual Unit Cost start at 0.00, not six/eight decimal zeros',()=>{
 assert.match(source,/\[quantity,setQuantity\]=useState\('0\.00'\)/);
 assert.match(source,/\[unitCost,setUnitCost\]=useState\('0\.00'\)/);
 assert.doesNotMatch(source,/useState\('0\.000000(?:00)?'\)/);
});

test('Save action has a short caption, while Opening Stock identity and API remain unchanged',()=>{
 assert.match(source,/\{busy\?'Saving\.\.\.':'Save'\}<\/button>/);
 assert.match(source,/INVENTORY \/ OPENING STOCK/);
 assert.match(source,/request\('\/inventory\/opening',\{method:'POST',body\}\)/);
 assert.match(source,/onSave\(\{branchId:Number\(branchId\),productId:Number\(productId\),quantity,unitCost,reference:reference\.trim\(\),requestKey\}\)/);
});

test('Blur formatting shows exactly two decimals for valid input without silent rounding',()=>{
 const expression=source.match(/const normalizeInputDecimal=value=>\{[^\n]+\};/);
 assert.ok(expression,'normalizeInputDecimal helper exists');
 const format=runInNewContext(expression[0]+'\nnormalizeInputDecimal;',{});
 const pairs=[['0','0.00'],['0.000000','0.00'],['2','2.00'],['2.5','2.50'],['2.75','2.75'],['2.756666','2.756666'],['1e2','1e2']];
 for(const [input,want] of pairs)assert.equal(format(input),want,input);
 assert.match(source,/onBlur=\{\(\)=>setQuantity\(current=>normalizeInputDecimal\(current\)\)\}/);
 assert.match(source,/onBlur=\{\(\)=>setUnitCost\(current=>normalizeInputDecimal\(current\)\)\}/);
 assert.match(source,/const validQuantity=\/.*\\d\{1,2\}/);
 assert.match(source,/const validCost=\/.*\\d\{1,2\}/);
});
