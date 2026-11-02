// Inventory R1.8 numeric columns remain right aligned without touching financial values.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const jsx=read('frontend/src/Inventory.jsx');
const css=read('frontend/src/Inventory.css');

test('Inventory balance table retains approved columns and right aligns QOH, Cost and Total headers',()=>{
 assert.match(jsx,/\['SKU','Product','Branch','Status','QOH','Cost \(RM\)','Total \(RM\)','', 'Actions'\]/);
 assert.match(jsx,/\.map\(\(h,i\)=><th key=\{i\} className=\{i>=4&&i<=6\?'inv-numeric':undefined\}\>\{h\}<\/th>\)/);
 assert.match(css,/\.inv-page \.inv-numeric\{[^}]*text-align:right/);
});
test('Inventory balance cells preserve numeric alignment and 2dp formatting without changing values',()=>{
 assert.match(jsx,/<td className="inv-numeric">\{r.initialized\?decimal\(r.quantity_on_hand\):'—'\}<\/td>/);
 assert.match(jsx,/<td className="inv-numeric">\{r.initialized\?decimal\(r.average_cost\):'—'\}<\/td>/);
 assert.match(jsx,/<td className="inv-numeric">\{r.initialized\?decimal\(r.carrying_value\):'—'\}<\/td>/);
 assert.match(jsx,/Opening Stock can be recorded only once per product and branch/);
 assert.doesNotMatch(jsx,/Physical Opening Stock is supported/);
});
