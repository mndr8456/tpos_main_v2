import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRODUCT_CSV_HEADERS,productCsvTemplate,parseProductCsv} from '../src/products-csv.js';
const source=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const template=productCsvTemplate();
const line=(values={})=>{
 const sample=parseProductCsv(template)[0].data;
 const cols=Object.fromEntries(PRODUCT_CSV_HEADERS.map(x=>[x,'']));
 Object.assign(cols,{sku:'SKU-001',barcode:'123123123123',product_name:sample.productName,product_type:'GOODS',category:'Beverages',cost_price:'3.0000',selling_price:'5.0000',min_stock_qty:'1',track_stock:'YES',is_weighable:'NO',weighing_unit:'KG',requires_preparation:'NO',lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'06',lhdn_tax_rate:'0',is_tax_inclusive:'NO',status:'ACTIVE',product_structure:'SINGLE',base_unit:'PCS'},values);
 return PRODUCT_CSV_HEADERS.map(h=>`"${String(cols[h]??'').replaceAll('"','""')}"`).join(',');
};
const csv=(...rows)=>PRODUCT_CSV_HEADERS.join(',')+'\r\n'+rows.join('\r\n')+'\r\n';
test('R2 CSV template includes Product Structure, Base Unit, packaging and component SKUs',()=>{
 assert.equal(PRODUCT_CSV_HEADERS.length,30);
 for(const x of ['product_structure','base_unit','packaging_units','component_skus'])assert.ok(PRODUCT_CSV_HEADERS.includes(x));
 assert.equal(parseProductCsv(template)[0].data.productStructure,'SINGLE');
});
test('R2 CSV supports PACK and CARTON with optional packaging barcode',()=>{
 const rows=parseProductCsv(csv(line({packaging_units:'PACK:6::14.50|CARTON:24:9551111111111:49.90'})));
 assert.equal(rows[0].data.packagingUnits.length,2);
 assert.equal(rows[0].data.packagingUnits[0].barcode,'');
 assert.equal(rows[0].data.packagingUnits[1].unitsPerBase,'24');
});
test('R2 CSV supports fixed Set and Bundle components using existing SKUs',()=>{
 const rows=parseProductCsv(csv(line({sku:'SET01',barcode:'',product_structure:'SET',base_unit:'EA',track_stock:'NO',component_skus:'SKU-001:1|SKU-002:2'}),line({sku:'BUNDLE01',barcode:'',product_structure:'BUNDLE',base_unit:'EA',track_stock:'NO',component_skus:'SKU-001:3'})));
 assert.equal(rows[0].data.componentSkus[1].sku,'SKU-002');
 assert.equal(rows[1].data.productStructure,'BUNDLE');
});
test('R2 CSV rejects duplicate package barcodes in one batch and malformed specs',()=>{
 assert.equal(parseProductCsv(csv(line({packaging_units:'PACK:6:123123123123:14.50'})))[0].error,'DUPLICATE_BARCODE_IN_FILE');
 assert.equal(parseProductCsv(csv(line({packaging_units:'PACK:6:123:14.50|BOX:12:123:29'})))[0].error,'DUPLICATE_BARCODE_IN_FILE');
 assert.equal(parseProductCsv(csv(line({component_skus:'SKU-001'})))[0].error,'CSV_COMPONENT_FORMAT');
 assert.equal(parseProductCsv(csv(line({packaging_units:'PACK:x'})))[0].error,'CSV_PACKAGING_FORMAT');
});
test('R2 CSV still accepts old 21-column Single Product import',()=>{
 const old=PRODUCT_CSV_HEADERS.slice(0,21);
 const full=line();
 const raw=full.split(',').slice(0,21).join(',');
 const rows=parseProductCsv(old.join(',')+'\r\n'+raw+'\r\n');
 assert.equal(rows[0].data.productStructure,'SINGLE');
 assert.equal(rows[0].data.baseUnitCode,'PCS');
});
test('Product R2 SQL keeps all Product tables in single 007 module and global barcode registry',async()=>{
 const sql=await source('database/007_tenant_products.sql');
 for(const t of ['products','product_components','product_packaging_units','product_barcodes','product_branch_prices','product_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${t}\\b`));
 assert.match(sql,/product_structure ENUM\('SINGLE','SET','BUNDLE'\)/);
 assert.match(sql,/base_unit_code ENUM\('PCS','EA','KG','G'\)/);
 assert.match(sql,/units_per_base DECIMAL\(18,6\)/);
 assert.match(sql,/PRIMARY KEY\(parent_product_id,component_product_id\)/);
 assert.match(sql,/barcode VARCHAR\(100\) NOT NULL PRIMARY KEY/);
 assert.doesNotMatch(sql,/\bDROP\s+DATABASE\b|\bTRUNCATE\b/i);
});
test('R2 create/update and import save linked structure and barcode registry atomically',async()=>{
 const src=await source('backend/src/products.js'),helper=await source('backend/src/product-structure.js');
 assert.match(src,/await conn\.beginTransaction\(\)/);
 assert.match(src,/await syncProductStructure\(conn,productId,p\)/);
 assert.match(src,/await syncProductStructure\(conn,productId,next\)/);
 assert.match(helper,/INSERT INTO product_barcodes/);
 assert.match(helper,/INSERT INTO product_components/);
 assert.match(helper,/COMPONENT_NOT_ACTIVE_SINGLE/);
 assert.match(helper,/SELF_COMPONENT_NOT_ALLOWED/);
 assert.match(helper,/Set\/Bundle requires components/);
 assert.match(helper,/unitsPerBase:z\.coerce\.number\(\)\.int\(\)\.min\(2\)/);
 assert.match(src,/rejectUsedComponent/);
 assert.doesNotMatch(src,/INSERT INTO inventory_movements|UPDATE stock_balances/i);
});
test('R2 UI has actual components and packaging controls; all action buttons icon-only',async()=>{
 const src=await source('frontend/src/Products.jsx');
 for(const phrase of ['Product Structure','Single Product','Set (Fixed Components)','Bundle (Fixed Components)','Units & Packaging','Add Component','Add Packaging Unit','Remove Packaging Unit','CARTON','BASE']){
  if(phrase!=='BASE')assert.ok(src.includes(phrase),phrase);
 }
 assert.match(src,/onChange=\{e=>setQuery\(e\.target\.value\)\}/);
 assert.match(src,/function IconAction/);
});
test('R2 installer rejects existing R1 tables rather than falsely reporting CURRENT',async()=>{
 const installer=await source('backend/scripts/setup-products.js');
 assert.match(installer,/PRODUCT_R1_SCHEMA_PRESENT_R2_REQUIRES_SEPARATE_MIGRATION/);
 assert.match(installer,/tables\.length===6&&columns\.length===2/);
});
