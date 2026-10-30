import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateVoucher} from '../src/voucher-evaluation.js';
import {reserveVoucher,redeemVoucher,releaseVoucher} from '../src/voucher-pos.js';
import {qrSvg,barcodeSvg} from '../../frontend/src/voucher-codes.js';
const source=p=>readFile(new URL(`../../${p}`,import.meta.url),'utf8');
const voucher={id:1,voucher_code:'GIFT2026_001',discount_type:'PERCENTAGE',discount_value:'10.00',minimum_spend:'20.00',maximum_discount:'5.00',starts_at:'2026-10-30 00:00:00',ends_at:'2026-12-31 23:59:59',order_scope:'BOTH',eligibility_type:'ALL',usage_limit:2,per_customer_limit:1,status:'ACTIVE',is_deleted:0};
const context={now:'2026-11-01 12:00:00',orderScope:'DINE_IN',customerRef:'CUSTOMER123',usedCount:0,customerUsedCount:0,targetIds:[],lines:[{productId:3,categoryId:2,subtotal:'100.00'}]};
test('Voucher R1 evaluates in integer sen, applies cap and rejects excess fixed amount',()=>{
 const out=evaluateVoucher(voucher,context);
 assert.equal(out.eligible,true);assert.equal(out.discountAmount,'5.00');assert.equal(out.eligibleSubtotal,'100.00');
 const fixed=evaluateVoucher({...voucher,discount_type:'FIXED_AMOUNT',discount_value:'99.00',maximum_discount:null,minimum_spend:'0.00'},context);
 assert.equal(fixed.discountAmount,'99.00');
 const tiny=evaluateVoucher({...voucher,discount_type:'FIXED_AMOUNT',discount_value:'99.00',maximum_discount:null,minimum_spend:'0.00'},{...context,lines:[{subtotal:'2.75'}]});assert.equal(tiny.discountAmount,'2.75');
});
test('Voucher R1 enforces validity, order scope, and minimum spend',()=>{
 assert.equal(evaluateVoucher(voucher,{...context,now:'2026-10-29 23:59:59'}).reason,'OUTSIDE_VALIDITY');
 assert.equal(evaluateVoucher(voucher,{...context,orderScope:'TAKE_AWAY'}).eligible,true);
 assert.equal(evaluateVoucher({...voucher,order_scope:'DINE_IN'},{...context,orderScope:'TAKE_AWAY'}).reason,'ORDER_SCOPE_MISMATCH');
 assert.equal(evaluateVoucher(voucher,{...context,lines:[{subtotal:'15.00'}]}).reason,'MINIMUM_SPEND');
});
test('Voucher R1 enforces product/category targeting and inactive products',()=>{
 assert.equal(evaluateVoucher({...voucher,eligibility_type:'PRODUCT'},{...context,targetIds:['3']}).discountAmount,'5.00');
 assert.equal(evaluateVoucher({...voucher,eligibility_type:'PRODUCT'},{...context,targetIds:['4']}).reason,'NO_ELIGIBLE_ITEMS');
 assert.equal(evaluateVoucher({...voucher,eligibility_type:'CATEGORY'},{...context,targetIds:['2']}).eligible,true);
 assert.equal(evaluateVoucher(voucher,{...context,lines:[{subtotal:'100.00',active:false}]}).reason,'NO_ELIGIBLE_ITEMS');
});
test('Voucher R1 global and per-customer limits count RESERVED with REDEEMED',()=>{
 assert.equal(evaluateVoucher(voucher,{...context,usedCount:2}).reason,'USAGE_LIMIT_REACHED');
 assert.equal(evaluateVoucher(voucher,{...context,customerUsedCount:1}).reason,'CUSTOMER_USAGE_LIMIT_REACHED');
 assert.equal(evaluateVoucher(voucher,{...context,customerRef:null}).reason,'CUSTOMER_REQUIRED');
});
test('Voucher R1 reserve is idempotent for same checkout and rejects reused key',async()=>{
 const queries=[];const conn={execute:async(sql,params)=>{queries.push(sql);if(sql.includes('FROM vouchers WHERE id=? FOR UPDATE'))return [[voucher]];if(sql.includes('FROM voucher_reservations WHERE reservation_key='))return [[{id:7,voucher_id:1,checkout_ref:'CHK-1',checkout_type:'RETAIL',customer_ref:'CUSTOMER123',status:'RESERVED',discount_amount:'5.00'}]];throw Error('Unexpected SQL '+sql);}};
 const common={voucherId:1,reservationKey:'RESERVATION-1',checkoutRef:'CHK-1',checkoutType:'RETAIL',customerRef:'CUSTOMER123',operatorUserId:1,lines:context.lines,orderScope:'DINE_IN',now:context.now};
 const r=await reserveVoucher(conn,common);assert.equal(r.reused,true);assert.equal(r.reservationId,'7');assert.match(queries[0],/FOR UPDATE/);
 await assert.rejects(reserveVoucher(conn,{...common,checkoutRef:'CHK-OTHER'}),/RESERVATION_KEY_REUSED/);
});
test('Voucher R1 redemption requires verified persisted sale in same transaction',async()=>{
 let changed=0;const conn={execute:async(sql)=>{if(sql.includes('SELECT voucher_id FROM voucher_reservations'))return [[{voucher_id:1}]];if(sql.includes('FROM vouchers WHERE id=? FOR UPDATE'))return [[voucher]];if(sql.includes('SELECT * FROM voucher_reservations WHERE id=? FOR UPDATE'))return [[{status:'RESERVED',sale_ref:null,checkout_ref:'CHK-1',discount_amount:'5.00'}]];if(sql.startsWith('UPDATE voucher_reservations')){changed++;return [{affectedRows:1}];}if(sql.startsWith('INSERT INTO voucher_audit_logs'))return [{affectedRows:1}];throw Error(sql);}};
 await assert.rejects(redeemVoucher(conn,{reservationId:7,saleRef:'SALE-1',operatorUserId:1}),/POS_SALE_VERIFICATION_REQUIRED/);
 await assert.rejects(redeemVoucher(conn,{reservationId:7,saleRef:'SALE-1',operatorUserId:1,verifyPersistedSale:async()=>false}),/POS_SALE_NOT_VERIFIED/);
 assert.equal(changed,0);
 const r=await redeemVoucher(conn,{reservationId:7,saleRef:'SALE-1',operatorUserId:1,verifyPersistedSale:async()=>true});assert.equal(r.status,'REDEEMED');assert.equal(changed,1);
});
test('Voucher R1 release needs verified unpaid checkout, never redeemed',async()=>{
 let changed=0;const conn={execute:async(sql)=>{if(sql.includes('SELECT voucher_id FROM voucher_reservations'))return [[{voucher_id:1}]];if(sql.includes('FROM vouchers WHERE id=? FOR UPDATE'))return [[voucher]];if(sql.includes('SELECT * FROM voucher_reservations WHERE id=? FOR UPDATE'))return [[{status:'RESERVED',sale_ref:null,checkout_ref:'CHK-1'}]];if(sql.startsWith('UPDATE voucher_reservations')){changed++;return [{affectedRows:1}];}if(sql.startsWith('INSERT INTO voucher_audit_logs'))return [{affectedRows:1}];throw Error(sql);}};
 await assert.rejects(releaseVoucher(conn,{reservationId:7,operatorUserId:1,reason:'Cancelled'}),/POS_UNPAID_VERIFICATION_REQUIRED/);
 await assert.rejects(releaseVoucher(conn,{reservationId:7,operatorUserId:1,reason:'Cancelled',verifyUnpaidCheckout:async()=>false}),/POS_CHECKOUT_NOT_UNPAID/);
 assert.equal(changed,0);
 const r=await releaseVoucher(conn,{reservationId:7,operatorUserId:1,reason:'Cancelled',verifyUnpaidCheckout:async()=>true});assert.equal(r.status,'RELEASED');assert.equal(changed,1);
});
test('Voucher R1 Code128 and QR encode same exact code without network calls',()=>{
 const code='GIFT2026_001',qr=qrSvg(code),barcode=barcodeSvg(code);
 assert.match(qr,/<svg/);assert.match(qr,/<path/);assert.match(barcode,/<rect/);assert.doesNotMatch(qr+barcode,/(src|href)="https?:/);
 assert.throws(()=>qrSvg('x<script>'));
});
test('Voucher R1 SQL is isolated, additive, uses tenant user links and default paper 18.55x8.45 cm',async()=>{
 const sql=await source('database/012_tenant_vouchers.sql');assert.match(sql,/18\.55,8\.45/);assert.match(sql,/voucher_reservations/);assert.match(sql,/reservation_key/);assert.match(sql,/CHECK\(ends_at>starts_at\)/);assert.match(sql,/UNIQUE KEY uq_voucher_code/);assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|ALTER TABLE|DELETE FROM discounts/i);
 const tenant=await source('backend/src/tenants.js');assert.ok(tenant.indexOf('011_tenant_dashboard_accountant_supervisor.sql')<tenant.indexOf('012_tenant_vouchers.sql'));
});
test('Voucher R1 API guards management and owner-only print settings; no untrusted HTTP redemption',async()=>{
 const app=await source('backend/src/app.js'),guards=await source('backend/src/voucher-owner-guard.js');
 assert.match(app,/permitted\('vouchers\.print\.settings'\),voucherOwnerOnly,saveVoucherPrintSettings/);
 assert.match(guards,/r\.code='OWNER'/);
 assert.match(app,/permitted\('vouchers\.manage'\),createVoucher/);
 assert.match(app,/permitted\('vouchers\.view'\),listVouchers/);
 assert.doesNotMatch(app,/app\.(post|put|patch)\('\/api\/v2\/vouchers\/.*(reserve|redeem|release)/);
});
test('Voucher R1 frontend has print dimensions, code128/QR, icons, and protected owner settings',async()=>{
 const ui=await source('frontend/src/Vouchers.jsx'),nav=await source('frontend/src/App.jsx');
 for(const term of ['qrSvg','barcodeSvg','window.open','@page','widthCm','heightCm','Voucher Activity Log','Voucher Eligibility Preview'])assert.ok(ui.includes(term),term);
 assert.match(ui,/allowed\('vouchers\.print\.settings'\)/);assert.match(nav,/canViewVouchers/);
});

test('Voucher R1 CSV preview parser accepts BOM/CRLF/quoted text and enforces 1,000 rows',async()=>{
 const {parseVoucherCsv,voucherCsvTemplate,VOUCHER_CSV_HEADERS,csvEscapeVoucher}=await import('../src/vouchers-csv.js');
 const example=parseVoucherCsv(voucherCsvTemplate());assert.equal(example.length,1);assert.equal(example[0].data.voucherCode,'');
 const fields=['GIFT2026_002','Voucher "Special"','Text, with comma','FIXED_AMOUNT','15.00','20.00','','2026-11-01 00:00:00','2026-12-31 23:59:59','BOTH','ALL','','100','1','INACTIVE'];
 const csv='\uFEFF'+VOUCHER_CSV_HEADERS.join(',')+'\r\n'+fields.map(csvEscapeVoucher).join(',')+'\r\n';const result=parseVoucherCsv(csv);assert.equal(result[0].data.voucherName,'Voucher "Special"');assert.equal(result[0].data.description,'Text, with comma');
 const row=fields.map(csvEscapeVoucher).join(',');
 assert.equal(parseVoucherCsv(VOUCHER_CSV_HEADERS.join(',')+'\n'+Array.from({length:1000},(_,i)=>row.replace('GIFT2026_002',`GIFT${String(i).padStart(5,'0')}`)).join('\n')).length,1000);
 assert.throws(()=>parseVoucherCsv(VOUCHER_CSV_HEADERS.join(',')+'\n'+Array.from({length:1001},(_,i)=>row.replace('GIFT2026_002',`GIFT${String(i).padStart(5,'0')}`)).join('\n')),/CSV_ROW_LIMIT/);
});

test('Voucher R1 CSV import preview, confirm and export are permissioned and transactional',async()=>{
 const backend=await source('backend/src/vouchers.js'),app=await source('backend/src/app.js');
 assert.match(backend,/export async function previewVoucherImport/);assert.match(backend,/export async function importVouchers/);
 assert.match(backend,/const result=await tx\(req\.auth\.pool/);
 assert.match(backend,/rows\.some\(x=>x\.error\)/);
 assert.match(app,/permitted\('vouchers\.manage'\),previewVoucherImport/);
 assert.match(app,/permitted\('vouchers\.manage'\),importVouchers/);
 assert.match(app,/permitted\('vouchers\.manage'\),exportVouchers/);
});
