import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRODUCT_CSV_HEADERS,productCsvTemplate,parseProductCsv} from '../src/products-csv.js';
const read=p=>readFile(new URL(`../../${p}`,import.meta.url),'utf8');
const sample=()=>productCsvTemplate().replace(/^\uFEFF/,'');
test('KPDN CSV template adds a YES/NO field; existing records default to NO',()=>{
 assert.equal(PRODUCT_CSV_HEADERS.length,29);
 assert.equal(PRODUCT_CSV_HEADERS.at(-1),'is_kpdn_controlled');
 const [row]=parseProductCsv(sample());
 assert.equal(row.data.isKpdnControlled,false);
 const lines=sample().trim().split('\r\n');
 const cells=lines[1].split(',');cells[cells.length-1]='YES';
 assert.equal(parseProductCsv(`${lines[0]}\r\n${cells.join(',')}\r\n`)[0].data.isKpdnControlled,true);
 cells[cells.length-1]='NOT_A_BOOLEAN';
 assert.equal(parseProductCsv(`${lines[0]}\r\n${cells.join(',')}\r\n`)[0].data.isKpdnControlled,'INVALID');
});
test('All historical Product CSV header lengths remain accepted (21/25/28)',()=>{
 const lines=sample().trim().split('\r\n');
 for(const cols of [21,25,28]){
  const parsed=parseProductCsv(`${PRODUCT_CSV_HEADERS.slice(0,cols).join(',')}\r\n${lines[1].split(',').slice(0,cols).join(',')}\r\n`);
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].data.isKpdnControlled,false);
 }
});
test('KPDN API create/edit/import are audited with a separate boolean and do not alter tax settings',async()=>{
 const code=await read('backend/src/products.js');
 assert.match(code,/isKpdnControlled:z\.boolean\(\)\.default\(false\)/);
 assert.match(code,/p\.isKpdnControlled&&p\.productType!=='GOODS'/);
 assert.match(code,/is_kpdn_controlled/);
 assert.match(code,/Number\(p\.isKpdnControlled\)/);
 assert.match(code,/isKpdnControlled:d\.isKpdnControlled/);
 assert.match(code,/await audit\(conn,actor,productId,action,null,p\)/);
 assert.match(code,/await audit\(conn,req\.auth\.user\.id,productId,'PRODUCT_UPDATE'/);
 assert.match(code,/jkdmTaxType:z\.enum/);
});
test('KPDN Add/Edit has a single bottom X and shows flag in View and list',async()=>{
 const jsx=await read('frontend/src/Products.jsx');
 const start=jsx.indexOf('function ProductDialog('),end=jsx.indexOf('const productAuditActionBy=');
 const dialog=jsx.slice(start,end);
 assert.match(dialog,/KPDN — Controlled Goods/);
 assert.match(dialog,/onChange=\{checked\('isKpdnControlled'\)\}/);
 assert.match(dialog,/original\.is_kpdn_controlled/);
 assert.match(dialog,/<IconAction icon=\{X\} label="Cancel"/);
 assert.doesNotMatch(dialog,/label="Close" onClick=\{onClose\}/);
 assert.match(jsx,/Detail label="KPDN Controlled Goods"/);
 assert.match(jsx,/className="product-kpdn-pill"/);
 assert.match(jsx,/is_kpdn_controlled/);
});
test('KPDN migration 015 is additive, non destructive and has explicit read-only/apply installer',async()=>{
 const [sql,setup,tenant,pkg]=await Promise.all([read('database/015_tenant_product_kpdn.sql'),read('backend/scripts/setup-products-kpdn.js'),read('backend/src/tenants.js'),read('backend/package.json')]);
 assert.match(sql,/ALTER TABLE products/);
 assert.match(sql,/ADD COLUMN is_kpdn_controlled BOOLEAN NOT NULL DEFAULT FALSE/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/if\(apply&&!current\)/);
 assert.match(tenant,/executeSchema\(dbName,'015_tenant_product_kpdn\.sql'\)/);
 assert.match(pkg, /db:products:kpdn/);
});
