import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const backendRoot = fileURLToPath(new URL('..', import.meta.url));
const src = file => readFileSync(resolve(backendRoot, '..', 'frontend', 'src', file), 'utf8');

test('R2.1.4: POS receipt print uses a dedicated frame, not the fixed POS overlay', () => {
 const pos = src('PosTerminal.jsx');
 const printer = src('pos-receipt-print.js');
 assert.match(pos, /import\s*\{printPosReceipt\}\s*from\s*['"]\.\/pos-receipt-print\.js['"]/);
 assert.match(pos, /onClick=\{\(\)=>printPosReceipt\(receiptNodeRef\.current\)\}/);
 assert.doesNotMatch(pos, /onClick=\{\(\)=>window\.print\(\)\}/);
 assert.match(printer, /document\.createElement\('iframe'\)/);
 assert.match(printer, /doc\.body\.appendChild\(receiptCopy\)/);
 assert.match(printer, /printableWindow\.print\(\)/);
 assert.doesNotMatch(printer, /document\.body\.innerHTML\s*=/);
});

test('R2.1.4: print uses a single live receipt node with original payment data', () => {
 const receipt = src('PosCashReceipt.jsx');
 const pos = src('PosTerminal.jsx');
 assert.match(receipt, /ref=\{printRef\} className="pos-print-receipt"/);
 assert.match(pos, /<PosCashReceipt receipt=\{receipt\} printRef=\{receiptNodeRef\}\s*\/>/);
 assert.match(receipt, /r\.paymentReference/);
 assert.match(receipt, /Grand Total \(MYR\)/);
 assert.match(receipt, /r\.lines\.map/);
});

test('R2.1.4: print geometry is isolated from other module print CSS and fits the receipt height', () => {
 const printer = src('pos-receipt-print.js');
 assert.match(printer, /import receiptCss from '\.\/PosCashReceipt\.css\?inline'/);
 assert.match(printer, /receiptPageHeightMm\(receiptHeight, pixelsPerMm\)/);
 assert.match(printer, /@page\{size:\$\{PAPER_WIDTH_MM\}mm \$\{pageHeightMm\}mm;margin:0\}/);
 assert.match(printer, /body>\.pos-print-receipt\{position:static!important/);
 assert.match(printer, /cloneNode\(true\)/);
 assert.match(printer, /addEventListener\('afterprint', cleanup/);
});
