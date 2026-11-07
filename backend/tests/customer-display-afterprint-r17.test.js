import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(new URL(`../../frontend/${file}`,import.meta.url),'utf8');
const pos=read('src/PosTerminal.jsx');
const printer=read('src/pos-receipt-print.js');
const viewer=read('public/customer-display.js');

test('CD R1.7: receipt closes after afterprint, not on print invocation',()=>{
 assert.match(pos,/printPosReceipt\(receiptNodeRef\.current,closePaidReceipt\)/);
 assert.doesNotMatch(pos,/if\(printPosReceipt\(receiptNodeRef\.current\)\)closePaidReceipt\(\)/);
 assert.match(printer,/printableWindow\.addEventListener\('afterprint', finish/);
 assert.match(printer,/if \(finished\) return/);
 assert.match(printer,/setTimeout\(finish, 60000\)/);
});
test('CD R1.7: refresh is server-authoritative and monitor pairing stays intact',()=>{
 assert.match(pos,/receiptOpen:false/);
 assert.match(pos,/\.then\(\(\)=>refreshPairedDisplay\(\)\)/);
 assert.match(pos,/monitor\.postMessage\(\{type:'TPOS_CUSTOMER_DISPLAY_REFRESH'\},window\.location\.origin\)/);
 assert.match(viewer,/event\.origin!==window\.location\.origin/);
 assert.match(viewer,/event\.source!==window\.opener/);
 assert.match(viewer,/if\(event\.data\?\.type==='TPOS_CUSTOMER_DISPLAY_REFRESH'\)void poll\(\)/);
 assert.doesNotMatch(pos,/customerDisplayWindowRef\.current\.location\.reload/);
});
