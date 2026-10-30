import test from 'node:test';
import assert from 'node:assert/strict';
import {exportDiscountCsv} from '../../frontend/src/discount-csv-export.js';
import {parseDiscountCsv} from '../src/discounts-csv.js';
const row={discount_code:'TDR1NEG',discount_name:'Negative sort',description:'Test normal description',discount_type:'PERCENTAGE',discount_scope:'ORDER',discount_value:'10.00',minimum_spend:'0.00',maximum_discount_amount:null,start_date:null,end_date:null,usage_limit:null,sort_order:-10,status:'ACTIVE',eligibility_type:'ALL',targets:[]};
test('Discount CSV negative Sort Order survives export and import without leading apostrophe',()=>{
 const exported=exportDiscountCsv([row]);
 const parsed=parseDiscountCsv(exported);
 assert.equal(parsed.length,1);
 assert.equal(parsed[0].data.sortOrder,'-10');
 assert.equal(parsed[0].data.discountCode,row.discount_code);
});
test('Discount CSV normal Sort Order and quoted text survive export and import',()=>{
 const exported=exportDiscountCsv([{...row,discount_code:'TDR1QUO',discount_name:'Promo, weekend',description:'A "special" offer',sort_order:20}]);
 const parsed=parseDiscountCsv(exported);
 assert.equal(parsed[0].data.sortOrder,'20');
 assert.equal(parsed[0].data.discountName,'Promo, weekend');
 assert.equal(parsed[0].data.description,'A "special" offer');
});
test('Discount CSV exported untrusted text starting formula prefixes remains Excel-safe',()=>{
 const exported=exportDiscountCsv([{...row,discount_name:'=HYPERLINK("https://example.test")'}]);
 assert.match(exported,/"'=HYPERLINK\(""https:\/\/example\.test""\)"/);
});
