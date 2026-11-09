import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeCheckoutEvidenceR13,captureCheckoutSnapshotR13,EINV_C4_SUBMISSION_ENABLED} from '../src/einvoice-checkout-snapshot-r13.js';
const root=new URL('../../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const sale={id:42,branch_id:1,receipt_number:'2026110812340042',payment_method:'CASH',subtotal:'4.90',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.00',total:'4.90'};
const lines=[{id:1,sale_id:42,product_id:7,product_name:'Tea',sku:'TEA',quantity:'1.000',unit_price:'4.9000',line_total:'4.90'}];
const rawLines=[{product_id:7,unit_code:'PCS'}];
test('C4 captures only persisted sale facts and explicitly incomplete UBL mappings',()=>{
 const out=makeCheckoutEvidenceR13({sale,lines,rawLines});
 assert.equal(out.authoritative_ubl_mapping_complete,false);assert.equal(out.lines[0].einvoice_classification,null);
 assert.equal(out.lines[0].pos_unit_code,'PCS');assert.equal(out.lines[0].ubl_unit_code,null);
 assert.equal(EINV_C4_SUBMISSION_ENABLED,false);
});
test('C4 rejects duplicate sale line identities and mismatched totals',()=>{
 assert.throws(()=>makeCheckoutEvidenceR13({sale,lines:[lines[0],lines[0]],rawLines}),/EINV_C4_LINE_IDENTITY_INVALID/);
 assert.throws(()=>makeCheckoutEvidenceR13({sale:{...sale,total:'4.91'},lines,rawLines}),/EINV_C4_SALE_TOTAL_MISMATCH/);
});
test('C4 excludes buyer, tokens and credentials from snapshot',()=>{
 const secret='PRIVATE_BUYER_OAUTH_KEY';const src={sale:{...sale,buyer_name:secret},lines:[{...lines[0],buyer_name:secret}],rawLines};
 const out=makeCheckoutEvidenceR13(src);assert.doesNotMatch(JSON.stringify(out),/PRIVATE_BUYER_OAUTH_KEY/);
 assert.equal(src.sale.buyer_name,secret);
});
test('C4 SQL is additive, no backfill, append-only trigger protections, unique sale',async()=>{
 const sql=await read('database/047_tenant_einvoice_checkout_snapshot.sql');
 assert.match(sql,/UNIQUE \(sale_id\)/);assert.match(sql,/BEFORE UPDATE/);assert.match(sql,/BEFORE DELETE/);
 assert.doesNotMatch(sql,/\b(?:UPDATE\s+(?!ON\s+einvoice_checkout_snapshots)|DELETE\s+FROM|DROP\s+TABLE|ALTER\s+TABLE\s+pos_sales|ALTER\s+TABLE\s+pos_sale_lines)\b/i);
});
test('C4 integrates both cash and noncash inside original transaction before COMMIT',async()=>{
 for(const f of ['pos-cash-checkout.js','pos-multi-payment.js']){
  const src=await read(`backend/src/${f}`);const write=src.indexOf('await captureCheckoutSnapshotR13(conn,{saleId,rawLines});');
  assert.ok(write>src.indexOf('INSERT INTO pos_sale_lines'),f);assert.ok(src.indexOf('await conn.commit()',write)>write,f);
 }
 const tenant=await read('backend/src/tenants.js');assert.match(tenant,/047_tenant_einvoice_checkout_snapshot\.sql/);
});
test('C4 writes and reads back a deterministic digest in existing transaction; no migration means no checkout change',async()=>{
 let inserted=null;const sql=[];
 const conn={execute:async(q,args=[])=>{
  sql.push(q);
  if(q.includes('information_schema.TABLES'))return [[{n:1}]];
  if(q.includes('FROM pos_sales WHERE id='))return [[sale]];
  if(q.includes('FROM pos_sale_lines WHERE sale_id='))return [lines];
  if(q.startsWith('INSERT INTO einvoice_checkout_snapshots')){inserted=args;return [{affectedRows:1}]}
  throw Error('UNEXPECTED_QUERY');
 }};
 assert.deepEqual(await captureCheckoutSnapshotR13(conn,{saleId:42,rawLines}),{captured:true,status:'INCOMPLETE'});
 assert.equal(inserted[4],createHash('sha256').update(inserted[3],'utf8').digest('hex'));
 assert.equal(inserted[0],42);
 const noMigration={execute:async()=>[[{n:0}]]};
 assert.deepEqual(await captureCheckoutSnapshotR13(noMigration,{saleId:42,rawLines}),{captured:false,reason:'MIGRATION_047_NOT_APPLIED'});
});
