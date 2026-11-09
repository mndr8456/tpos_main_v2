import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PRODUCT_CSV_HEADERS,productCsvTemplate,parseProductCsv} from '../src/products-csv.js';

const header=PRODUCT_CSV_HEADERS;
const sample=(country='MYS')=>{
 const fields=Object.fromEntries(header.map(x=>[x,'']));
 Object.assign(fields,{sku:'ISO-001',product_name:'Sample Menu',category:'Beverages',cost_price:'2',selling_price:'5',min_stock_qty:'0',track_stock:'YES',is_weighable:'NO',requires_preparation:'NO',lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'06',lhdn_tax_rate:'0',status:'ACTIVE',product_structure:'SINGLE',base_unit:'PCS',jkdm_tax_type:'NONE',jkdm_tax_rate:'0',jkdm_tax_inclusive:'NO',is_kpdn_controlled:'NO',lhdn_country_of_origin_code:country});
 return header.join(',')+'\n'+header.map(x=>fields[x]).join(',')+'\n';
};
test('new Product CSV includes Country of Origin and template has matching column count',()=>{
 assert.equal(header.at(-1),'lhdn_country_of_origin_code');
 const lines=productCsvTemplate().replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);
 assert.equal(lines[0].split(',').length,30);
 assert.equal(lines[1].split(',').length,30);
});
test('Country of Origin ISO alpha-3 survives parsing, normalization and preview data',()=>{
 const [row]=parseProductCsv(sample('mys'));
 assert.equal(row.data.lhdnCountryOfOriginCode,'MYS');
});
test('legacy 21,25,28,29 column imports remain supported',()=>{
 const lines=sample('MYS').trimEnd().split('\n');
 for(const length of [21,25,28,29]){
  const [row]=parseProductCsv(lines[0].split(',').slice(0,length).join(',')+'\n'+lines[1].split(',').slice(0,length).join(',')+'\n');
  assert.equal(row.data.lhdnCountryOfOriginCode,'');
 }
});
test('Product Preview/Confirm persists imported Country of Origin, not an empty placeholder',async()=>{
 const source=await readFile(new URL('../src/products.js',import.meta.url),'utf8');
 assert.match(source,/lhdnCountryOfOriginCode:d\.lhdnCountryOfOriginCode/);
 assert.doesNotMatch(source,/lhdnProductTariffCode:'',lhdnCountryOfOriginCode:''/);
 assert.match(source,/originCountryCodes\.has\(v\)/);
});
test('Product CSV Export contains real origin and Product Master retains independent verification',async()=>{
 const source=await readFile(new URL('../../frontend/src/Products.jsx',import.meta.url),'utf8');
 assert.match(source,/lhdn_country_of_origin_code:p\.lhdn_country_of_origin_code/);
 assert.match(source,/not Owner Verified Mapping/);
});

test('Import distinguishes suggested LHDN defaults from confirmed Owner mapping',async()=>{
 const parsed=parseProductCsv(sample('MYS'));
 assert.equal(parsed[0].data.lhdnClassificationExplicit,true);
 const text=await readFile(new URL('../src/products.js',import.meta.url),'utf8');
 assert.match(text,/LHDN_DEFAULTS_SUGGESTED/);
 assert.match(text,/LHDN_TAX_TYPE_REVIEW/);
 assert.match(text,/LHDN_COUNTRY_OF_ORIGIN_INVALID/);
});
