import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {legacyReceiptNumber} from '../src/pos-receipt-number.js';
const file=new URL('../src/pos-cash-checkout.js',import.meta.url);
const src=readFileSync(file,'utf8');
const receiptFunction=src.slice(src.indexOf('async function receipt('),src.indexOf('export async function cashCheckout('));
function fixture(salesOn,serviceOn){
 const queries=[];
 const conn={async execute(sql){queries.push(sql);
  if(sql.includes('FROM pos_sales s JOIN branches'))return [[{id:1,posted_time:'2026-11-02 20:13:34',branch_name:'Main Branch',cashier_name:'Hakim bin Othman',order_scope:'TAKE_AWAY',subtotal:'10.03',total:'10.05',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.02',cash_received:'20.00',cash_change:'9.95'}]];
  if(sql.includes('FROM pos_sale_lines'))return [[{product_name:'POS Checkout Test',quantity:'1.00',unit_price:'10.03',line_total:'10.03'}]];
  if(sql.includes('FROM company_profiles'))return [[{registered_name:'Restoran Selera Aqim Tom Yam',address_line1:'18, Jalan TPS 1/2',address_line2:'Taman Pelangi Semenyih',postcode:'43500',city:'Semenyih',state:'Selangor',country:'MY',phone:'0136547891',email:'hakim@gmail.com'}]];
  if(sql.includes('FROM company_registrations'))return [[{ssm_registration_number:'202012345678',ssm_old_registration_number:'KT-365478',sst_sales_tax_number:'S10-1234-000012',sst_service_tax_number:'W10-2003-32000013'}]];
  if(sql.includes('FROM sst_tax_settings'))return [[{tax_type:'SALES_TAX',is_enabled:salesOn?1:0},{tax_type:'SERVICE_TAX',is_enabled:serviceOn?1:0}]];
  throw Error('Unexpected SQL '+sql);
 }};
 const sandbox=vm.createContext({str:value=>String(value),legacyReceiptNumber});
 vm.runInContext(receiptFunction+'\nglobalThis.readReceipt=receipt;',sandbox);
 return {read:()=>sandbox.readReceipt(conn,1),queries};
}
test('Both enabled SST registrations appear independently below company contact',async()=>{
 const f=fixture(true,true),r=await f.read();
 assert.equal(r.salesTaxNumber,'S10-1234-000012');assert.equal(r.serviceTaxNumber,'W10-2003-32000013');
 assert.equal(r.ssmOldNumber,'KT-365478');assert.equal(r.email,'hakim@gmail.com');
 assert.deepEqual(Array.from(r.addressLines),['18, Jalan TPS 1/2, Taman Pelangi Semenyih','43500 Semenyih, Selangor. MY']);
 assert.equal(f.queries.filter(x=>x.includes('FROM sst_tax_settings')).length,1);
});
test('Owner disables Sales Tax: hide Sales Tax registration without hiding Service Tax',async()=>{
 const r=await fixture(false,true).read();assert.equal(r.salesTaxNumber,'');assert.equal(r.serviceTaxNumber,'W10-2003-32000013');
});
test('Owner disables Service Tax: hide Service Tax registration without hiding Sales Tax',async()=>{
 const r=await fixture(true,false).read();assert.equal(r.salesTaxNumber,'S10-1234-000012');assert.equal(r.serviceTaxNumber,'');
});
test('Owner disables both GST/SST switches: neither number appears, even if stored in tenant registration',async()=>{
 const r=await fixture(false,false).read();assert.equal(r.salesTaxNumber,'');assert.equal(r.serviceTaxNumber,'');
});
test('Receipt template matches approved V1 address/contact, tax registrations, metadata and cash groups',()=>{
 const jsx=readFileSync(new URL('../../frontend/src/PosCashReceipt.jsx',import.meta.url),'utf8');
 const css=readFileSync(new URL('../../frontend/src/PosCashReceipt.css',import.meta.url),'utf8');
 assert.ok(jsx.indexOf('r.phone&&')<jsx.indexOf('r.email&&'));
 assert.ok(jsx.indexOf('r.email&&')<jsx.indexOf('r.salesTaxNumber&&'));
 assert.ok(jsx.indexOf('r.salesTaxNumber&&')<jsx.indexOf('r.serviceTaxNumber&&'));
 assert.ok(jsx.indexOf('pos-receipt-title')<jsx.indexOf('pos-receipt-metadata'));
 for(const field of ['Receipt No.','Date','Branch','Cashier','Total Before Rounding','Grand Total (MYR)','Cash Tendered','Change'])assert.ok(jsx.includes(field),field);
 assert.match(css,/grid-template-columns:90px 9px minmax\(0,1fr\)/);
 assert.match(css,/pos-receipt-company \{text-align:center/);
 assert.match(css,/@media print/);
 assert.doesNotMatch(jsx,/ UTC/);
});
test('POS does not create an empty draft from initial app load or Hold',()=>{
 const js=readFileSync(new URL('../../frontend/src/PosTerminal.jsx',import.meta.url),'utf8');
 const api=readFileSync(new URL('../src/pos-drafts.js',import.meta.url),'utf8');
 assert.doesNotMatch(js,/ensureExisting:true|createNext:true|Preparing your order automatically/);
 assert.match(api,/productId:id,quantity:qty/);
 assert.match(api,/if\(!Number\(count\.total\)\)throw bad\('POS_CANNOT_HOLD_EMPTY_ORDER'/);
 assert.match(api,/if\(data\.remove\)\{\s*const \[\[remaining\]\]/);
});
