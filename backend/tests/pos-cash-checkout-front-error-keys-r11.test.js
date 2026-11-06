import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../../frontend/src/PosTerminal.jsx',import.meta.url),'utf8');
const payment=readFileSync(new URL('../../frontend/src/PosMultiPayment.jsx',import.meta.url),'utf8');

test('POS Cash Checkout error dictionary has no duplicate draft version key',()=>{
 const dictionary=source.match(/const readableError=code=>\(\{([^\n]*)\}\)\[code\]/);
 assert.ok(dictionary,'POS error dictionary exists');
 const keys=[...dictionary[1].matchAll(/(?:^|,)\s*([A-Z][A-Z0-9_]*):/g)].map(match=>match[1]);
 assert.equal(keys.filter(key=>key==='POS_DRAFT_VERSION_CHANGED').length,1);
 assert.equal(new Set(keys).size,keys.length,'All POS error mappings use unique keys');
 assert.match(dictionary[1],/POS_DRAFT_VERSION_CHANGED:'Order changed in another session\. Refresh and retry\.'/);
 assert.match(payment,/Confirm Cash Payment/,'Live cash checkout remains available');
 assert.match(source,/POS_CASH_INSUFFICIENT_TENDER/,'Cash checkout failures retain their descriptions');
});
