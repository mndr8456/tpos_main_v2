import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRODUCT_CSV_HEADERS,PRODUCT_CSV_ROW_LIMIT,PRODUCT_CSV_BYTE_LIMIT,parseProductCsv,productCsvTemplate} from '../src/products-csv.js';
const source=p=>readFile(new URL(`../../${p}`,import.meta.url),'utf8');
const headers=PRODUCT_CSV_HEADERS.join(',');
const row=i=>{
 const record=Object.fromEntries(PRODUCT_CSV_HEADERS.map(x=>[x,'']));
 Object.assign(record,{sku:`PRD${i}`,barcode:`BAR${i}`,product_name:`Product ${i}`,product_type:'GOODS',category:'Beverages',cost_price:'1.00',selling_price:'2.00',min_stock_qty:'0.00',track_stock:'YES',is_weighable:'NO',weighing_unit:'KG',requires_preparation:'NO',lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'06',lhdn_tax_rate:'0',is_tax_inclusive:'NO',status:'ACTIVE',product_structure:'SINGLE',base_unit:'PCS',jkdm_tax_type:'NONE',jkdm_tax_rate:'0.00',jkdm_tax_inclusive:'NO'});
 return PRODUCT_CSV_HEADERS.map(h=>record[h]).join(',');
};
const csv=count=>headers+'\r\n'+Array.from({length:count},(_,i)=>row(i+1)).join('\r\n')+'\r\n';
test('R3 5,000 rows parse and 5,001 are rejected by same parser',()=>{
 assert.equal(PRODUCT_CSV_ROW_LIMIT,5000);
 const rows=parseProductCsv(csv(5000));
 assert.equal(rows.length,5000);
 assert.equal(rows[4999].line,5001);
 assert.throws(()=>parseProductCsv(csv(5001)),/CSV_ROW_LIMIT/);
});
test('R3 8 MiB parser boundary applies to Preview and Confirm',()=>{
 assert.equal(PRODUCT_CSV_BYTE_LIMIT,8*1024*1024);
 assert.throws(()=>parseProductCsv('X'.repeat(PRODUCT_CSV_BYTE_LIMIT+1)),/CSV_TOO_LARGE/);
});
test('R3 import accepts R1 21-column and R2 25-column formats',()=>{
 const sample=row(1).split(',');
 for(const count of [21,25,28,29]){
  const data=PRODUCT_CSV_HEADERS.slice(0,count).join(',')+'\n'+sample.slice(0,count).join(',')+'\n';
  const [result]=parseProductCsv(data);
  assert.equal(result.data.productStructure,'SINGLE');
  assert.equal(result.data.jkdmTaxType,'NONE');
 }
});
test('R3 distinct JKDM SST fields roundtrip in CSV and template',()=>{
 assert.equal(PRODUCT_CSV_HEADERS.length,30);
 assert.match(productCsvTemplate(),/jkdm_tax_type,jkdm_tax_rate,jkdm_tax_inclusive,is_kpdn_controlled,lhdn_country_of_origin_code/);
 const data=csv(1).replace(',NONE,0.00,NO,',',SALES_TAX,10.00,YES,');
 const [item]=parseProductCsv(data);
 assert.equal(item.data.jkdmTaxType,'SALES_TAX');
 assert.equal(item.data.jkdmTaxRate,'10.00');
 assert.equal(item.data.jkdmTaxInclusive,true);
});
test('R3 API has distinct permission-guarded image routes and upload type limits',async()=>{
 const [app,backend,front]=await Promise.all([source('backend/src/app.js'),source('backend/src/products.js'),source('frontend/src/Products.jsx')]);
 assert.match(app,/products\/:id\/image',authenticate,permitted\('products\.update'\),uploadProductImage/);
 assert.match(app,/products\/:id\/image',authenticate,permitted\('products\.view'\),readProductImage/);
 assert.match(backend,/imageDirectory\(req\.auth\.tenantId\)/);
 assert.match(backend,/IMAGE_TOO_LARGE/);
 assert.match(backend,/IMAGE_INVALID_TYPE/);
 assert.match(backend,/PRODUCT_IMAGE_MAX_BYTES=2\*1024\*1024/);
 assert.match(front,/Choose File/);
 assert.match(front,/product-image-preview/);
});
test('R3 migration is additive and avoids re-running Product R2 on existing tenants',async()=>{
 const [sql,setup,tenant]=await Promise.all([source('database/008_tenant_product_r3.sql'),source('backend/scripts/setup-products-r3.js'),source('backend/src/tenants.js')]);
 for(const field of ['jkdm_tax_type','jkdm_tax_rate','jkdm_tax_inclusive'])assert.match(sql,new RegExp('ADD COLUMN '+field));
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
 assert.match(setup,/if\(apply&&count===0\)await executeSchema\(t\.db_name,'008_tenant_product_r3\.sql'\)/);
 assert.doesNotMatch(setup,/executeSchema\(t\.db_name,'007_tenant_products\.sql'\)/);
 assert.match(tenant,/executeSchema\(dbName,'008_tenant_product_r3\.sql'\)/);
});
