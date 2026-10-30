import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {parseVoucherCsv,normalizeVoucherCsvDate,voucherCsvTemplate,VOUCHER_CSV_HEADERS,csvEscapeVoucher} from '../src/vouchers-csv.js';
import {generateVoucherCode} from '../src/voucher-code.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>readFileSync(resolve(root,file),'utf8');
const row=(code,name='Voucher RM5',start='1/11/2026 0:00',end='14/11/2026 23:59')=>[code,name,'Potongan RM5','FIXED_AMOUNT','5.00','10.00','',start,end,'BOTH','ALL','','100','','INACTIVE'];
const csv=rows=>'\uFEFF'+VOUCHER_CSV_HEADERS.join(',')+'\r\n'+rows.map(r=>r.map(csvEscapeVoucher).join(',')).join('\r\n')+'\r\n';

test('R1.6 Excel Malaysia DD/MM/YYYY timestamps convert to full canonical local timestamps',()=>{
 assert.equal(normalizeVoucherCsvDate('1/11/2026 0:00'),'2026-11-01 00:00:00');
 assert.equal(normalizeVoucherCsvDate('14/11/2026 23:59'),'2026-11-14 23:59:00');
 assert.equal(normalizeVoucherCsvDate('2026-11-30 23:59'),'2026-11-30 23:59:00');
 assert.equal(normalizeVoucherCsvDate('2026-11-30T23:59:59'),'2026-11-30 23:59:59');
 assert.equal(normalizeVoucherCsvDate('31/02/2026 0:00'),'2026-02-31 00:00:00'); // real calendar validation remains in Zod
});
test('R1.6 accepts empty codes for separate vouchers, retains names and normalizes Excel dates',()=>{
 const parsed=parseVoucherCsv(csv([row(''),row(''),row('')]));
 assert.deepEqual(parsed.map(r=>r.data.voucherCode),['','','']);
 assert.deepEqual(parsed.map(r=>r.line),[2,3,4]);
 assert.equal(parsed[0].data.startsAt,'2026-11-01 00:00:00');
 assert.equal(parsed[0].data.endsAt,'2026-11-14 23:59:00');
 assert.equal(parseVoucherCsv(voucherCsvTemplate())[0].data.voucherCode,'');
});
test('R1.6 manually supplied codes remain unique and invalid codes are not silently overwritten',()=>{
 const rows=parseVoucherCsv(csv([row('EXISTING1'),row('existing1'),row('')]));
 assert.equal(rows[0].data.voucherCode,'EXISTING1');
 assert.equal(rows[1].error,'DUPLICATE_VOUCHER_CODE');
 assert.equal(rows[2].data.voucherCode,'');
});
test('R1.6 batch generator uses one transaction, distinct codes, per-voucher audit and bounded quantity',()=>{
 const code=read('backend/src/vouchers.js');
 assert.match(code,/generateQuantity:z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(200\)/);
 assert.match(code,/const result=await tx\(req\.auth\.pool,async conn=>\{/);
 assert.match(code,/for\(let index=0;index<generateQuantity;index\+\+\)/);
 assert.match(code,/data=\{\.\.\.template,voucherCode:generateVoucherCode\(\)\}/);
 assert.match(code,/await audit\(conn,insert\.insertId,req\.auth\.user\.id,'VOUCHER_CREATE',null,data\)/);
 assert.match(code,/voucherCodes:result\.map\(x=>x\.voucherCode\)/);
 assert.match(code,/generateQuantity>1&&parsed\.usageLimit==null\?\{\.\.\.parsed,usageLimit:1\}:parsed/);
 const codes=Array.from({length:200},()=>generateVoucherCode());
 assert.equal(new Set(codes).size,200);
});
test('R1.6 CSV import resolves blank code only at Confirm, with atomic all-or-nothing writes',()=>{
 const src=read('backend/src/vouchers.js');
 assert.match(src,/voucherCode:fields\.voucherCode\|\|'VCH-PREVIEWONLY'/);
 assert.match(src,/r\.data\.voucherCode&&existing\.has\(r\.data\.voucherCode\)/);
 assert.match(src,/if\(!template\.voucherCode\)\{/);
 assert.match(src,/generated\.push\(record\.voucherCode\)/);
 assert.match(src,/usageLimit:template\.usageLimit\?\?1/);
 assert.match(src,/await tx\(req\.auth\.pool,async conn=>/);
 assert.match(src,/await audit\(conn,insert\.insertId,req\.auth\.user\.id,'VOUCHER_IMPORT',null,record\)/);
});
test('R1.6 frontend provides bounded Create quantity and differentiates batch from Print selection',()=>{
 const src=read('frontend/src/Vouchers.jsx');
 assert.match(src,/Quantity to Generate/);
 assert.match(src,/max="200"/);
 assert.match(src,/generateQuantity:Number\(generateQuantity\)/);
 assert.match(src,/function SelectVoucherDialog\(/);
 assert.match(src,/function VoucherImport\(/);
 assert.match(src,/Leave Voucher Code empty/);
 assert.match(src,/Each voucher receives a distinct auto-generated code/);
});
