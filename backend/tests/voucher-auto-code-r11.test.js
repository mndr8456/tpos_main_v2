import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateVoucherCode} from '../src/voucher-code.js';
import {qrSvg,barcodeSvg} from '../../frontend/src/voucher-codes.js';

const source=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');

test('Voucher R1.1 generated code is a fixed-length Code128/QR-safe uppercase bearer token',()=>{
 const empty=generateVoucherCode(Buffer.alloc(10));
 const full=generateVoucherCode(Buffer.alloc(10,255));
 assert.equal(empty,'VCH-2222222222222222');
 assert.equal(full,'VCH-ZZZZZZZZZZZZZZZZ');
 assert.match(generateVoucherCode(),/^VCH-[2-9A-HJ-NP-Z]{16}$/);
 assert.throws(()=>generateVoucherCode(Buffer.alloc(8)),/VOUCHER_CODE_RANDOM_BYTES_INVALID/);
 assert.throws(()=>generateVoucherCode('static'),/VOUCHER_CODE_RANDOM_BYTES_INVALID/);
});

test('Voucher R1.1 5,000 automatically generated voucher codes do not duplicate and share barcode/QR payload',()=>{
 const codes=new Set();
 for(let i=0;i<5000;i++){
  const code=generateVoucherCode();
  assert.equal(code.length,20);
  assert.match(qrSvg(code),/<svg/);
  assert.match(barcodeSvg(code),/<svg/);
  codes.add(code);
 }
 assert.equal(codes.size,5000);
});

test('Voucher R1.1 Create generates on backend, blocks manually supplied codes and retries unique constraint collisions',async()=>{
 const sourceText=await source('backend/src/vouchers.js');
 assert.match(sourceText,/import \{generateVoucherCode\} from '\.\/voucher-code\.js'/);
 assert.match(sourceText,/if\(body\.voucherCode\)throw problem\('VOUCHER_CODE_AUTO_GENERATED'\)/);
 assert.match(sourceText,/for\(let attempt=0;attempt<5;attempt\+\+\)/);
 assert.match(sourceText,/const parsed=voucherSchema\.parse\(\{\.\.\.fieldsOnly,voucherCode:'VCH-VALIDATIONONLY'\}\)/);
 assert.match(sourceText,/if\(e\.code==='ER_DUP_ENTRY'&&attempt<4\)continue/);
 assert.match(sourceText,/res\.status\(201\)\.json\(\{id:result\[0\]\.id,voucherCode:result\[0\]\.voucherCode/);
 assert.match(sourceText,/await audit\(conn,insert\.insertId,req\.auth\.user\.id,'VOUCHER_CREATE',null,data\)/);
});

test('Voucher R1.1 Edit cannot mutate issued voucher code; Create field is readonly and CSV import remains explicit',async()=>{
 const backend=await source('backend/src/vouchers.js'),frontend=await source('frontend/src/Vouchers.jsx');
 assert.match(backend,/if\(data\.voucherCode!==before\.voucher_code\)throw problem\('VOUCHER_CODE_IMMUTABLE',409\)/);
 assert.match(frontend,/value=\{record\?form\.voucherCode:'Generated automatically on save'\} readOnly/);
 assert.match(frontend,/\.\.\.\(record\?\{voucherCode\}:\{\}\)/);
 assert.match(frontend,/`Voucher created: \$\{result\.voucherCode\}`/);
 assert.match(backend,/export async function importVouchers/);
 assert.match(backend,/const template=row\.data/);
});
