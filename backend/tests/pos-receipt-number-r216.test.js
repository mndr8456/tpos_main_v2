import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FEATURE_037,INDEX_037,assessReceiptNumber037} from '../src/pos-receipt-number-migration.js';
import {formatPosReceiptNumber,legacyReceiptNumber,assignPosReceiptNumber} from '../src/pos-receipt-number.js';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=name=>readFileSync(resolve(root,name),'utf8');
const column=()=>({type:'varchar(40)',nullable:'YES',defaultValue:null,charset:'ascii',collation:'ascii_bin'});
test('R2.1.6: Receipt No. matches YYYYMMHHMM + four-digit sale ID (20261112200005)',()=>{
 assert.equal(formatPosReceiptNumber('2026111220',5),'20261112200005');
 assert.equal(formatPosReceiptNumber('2026111220','5'),'20261112200005');
 assert.equal(formatPosReceiptNumber('2026111220',15),'20261112200015');
 assert.equal(formatPosReceiptNumber('2026111220',9999),'20261112209999');
});
test('R2.1.6: receipt numbers cannot collide for two different sale IDs, even beyond 9999',()=>{
 const generated=new Set();
 for(let id=1;id<=10005;id++)generated.add(formatPosReceiptNumber('2026111220',id));
 assert.equal(generated.size,10005);
 assert.equal(formatPosReceiptNumber('2026111220',10000),'202611122010000');
 assert.equal(formatPosReceiptNumber('2026111220',10005),'202611122010005');
});
test('R2.1.6: invalid prefixes and sale IDs are rejected, not silently fabricated',()=>{
 for(const prefix of ['202611120','20261112201','20261112AB','2026-11-1220','']) assert.throws(()=>formatPosReceiptNumber(prefix,5),/PREFIX_INVALID/);
 for(const id of [0,-1,'01','abc',''])assert.throws(()=>formatPosReceiptNumber('2026111220',id),/ID_INVALID/);
});
test('R2.1.6: legacy receipts retain historical POS- ID on reprint',()=>{
 assert.equal(legacyReceiptNumber(5),'POS-000000005');
 const cash=source('backend/src/pos-cash-checkout.js');
 assert.match(cash,/receiptNumber:sale\.receipt_number\|\|legacyReceiptNumber\(sale\.id\)/);
});
test('R2.1.6: new number persisted in the sale transaction and reused during every reprint',async()=>{
 const queries=[];
 const conn={execute:async(sql,args)=>{
  queries.push({sql,args});
  if(sql.includes('DATE_FORMAT(posted_at'))return [[{receipt_number:null,receipt_prefix:'2026111220'}]];
  if(sql.startsWith('UPDATE pos_sales SET receipt_number='))return [{affectedRows:1}];
  throw Error('unexpected SQL');
 }};
 assert.equal(await assignPosReceiptNumber(conn,5),'20261112200005');
 assert.equal(queries.length,2);
 assert.deepEqual(queries[1].args,['20261112200005',5]);
 assert.match(queries[0].sql,/FOR UPDATE/);
 assert.match(queries[1].sql,/AND receipt_number IS NULL/);
});
test('R2.1.6: existing stored number is returned untouched',async()=>{
 let queries=0;
 const conn={execute:async()=>{queries++;return [[{receipt_number:'20261112200005',receipt_prefix:'2026111220'}]];}};
 assert.equal(await assignPosReceiptNumber(conn,5),'20261112200005');
 assert.equal(queries,1);
});
test('R2.1.6: cash and noncash assign within atomic posting and audit their real receipt numbers',()=>{
 for(const path of ['backend/src/pos-cash-checkout.js','backend/src/pos-multi-payment.js']){
  const s=source(path);
  assert.match(s,/const receiptNumber=await assignPosReceiptNumber\(conn,saleId\)/);
  assert.match(s,/receipt:receiptNumber/);
  assert.match(s,/receiptNumber,req\.auth\.user\.id/);
  const posAssign=s.indexOf('const receiptNumber=await assignPosReceiptNumber(conn,saleId)');
  const posCommit=s.indexOf('await conn.commit()',posAssign);
  assert.ok(posAssign>=0&&posCommit>posAssign);
 }
});
test('R2.1.6: new tenant 037 SQL is additive, unique, and preserves existing issued receipt numbers',()=>{
 const sql=source('database/037_tenant_pos_receipt_number.sql');
 assert.match(sql,/ADD COLUMN receipt_number VARCHAR\(40\).*NULL/);
 assert.match(sql,/ADD UNIQUE KEY uq_pos_sales_receipt_number\(receipt_number\)/);
 assert.doesNotMatch(sql,/UPDATE\s+pos_sales|DROP\s+TABLE|DELETE\s+FROM|TRUNCATE|BACKFILL/i);
 assert.match(sql,/INSERT IGNORE INTO tpos_feature_setup_history/);
 assert.equal(FEATURE_037,'pos_receipt_number_r216_037');
 assert.equal(INDEX_037,'uq_pos_sales_receipt_number');
});
test('R2.1.6: migration 037 handles CURRENT and partial installation and blocks altered indexes',()=>{
 const complete={hasSaleTable:true,has036:true,markerRecorded:true,column:column(),indexRows:[{column:'receipt_number',nonUnique:0,sequence:1}]};
 assert.equal(assessReceiptNumber037(complete).current,true);
 assert.equal(assessReceiptNumber037({...complete,markerRecorded:false}).repairable,true);
 assert.equal(assessReceiptNumber037({...complete,column:null,indexRows:[]}).repairable,true);
 assert.deepEqual(assessReceiptNumber037({...complete,has036:false}).blockers,['POS_036_REQUIRED']);
 assert.ok(assessReceiptNumber037({...complete,indexRows:[{column:'receipt_number',nonUnique:1,sequence:1}]}).blockers.includes('RECEIPT_NUMBER_INDEX_INCOMPATIBLE'));
 assert.ok(assessReceiptNumber037({...complete,column:{...column(),type:'varchar(14)'}}).blockers.includes('RECEIPT_NUMBER_COLUMN_INCOMPATIBLE'));
});
test('R2.1.6: migration is read-only by default and new tenants provision 037 after 036',()=>{
 const setup=source('backend/scripts/setup-pos-receipt-number.js');
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/if\(!apply\)/);
 assert.match(setup,/tenantDatabase\(tenantId\)/);
 assert.match(setup,/information_schema\.columns/);
 assert.match(setup,/information_schema\.statistics/);
 assert.match(source('backend/src/tenants.js'),/executeSchema\(dbName,'036_tenant_pos_receipt_tax_rates\.sql'\);\s*await executeSchema\(dbName,'037_tenant_pos_receipt_number\.sql'\)/);
 assert.equal(JSON.parse(source('backend/package.json')).scripts['db:pos:receipt-number'],'node scripts/setup-pos-receipt-number.js');
});
