import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makePosCashJournal} from '../src/pos-cash-ledger.js';
import {makePosNonCashJournal} from '../src/pos-noncash-ledger.js';
import {makeCheckoutEvidenceR13} from '../src/einvoice-checkout-snapshot-r13.js';
import {makeCheckoutLineTaxEvidenceC42} from '../src/einvoice-line-tax-evidence-c42.js';
import {makeReductionAllocationPreviewC43A} from '../src/einvoice-reduction-allocation-c43a.js';
import {assertReduction,normalizedCodes} from '../src/pos-reduction-settlement.js';
const source=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const moneyBalance=rows=>rows.reduce((sum,row)=>sum+BigInt(row.debit.replace('.',''))-BigInt(row.credit.replace('.','')),0n);
const bill={subtotal:'27.50',subtotalBeforeTax:'27.50',discount:'0.00',voucher:'5.00',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0,total:'22.50'};
const adjustment={discount_amount:'0.00',voucher_amount:'5.00'};
const sale={id:7,branch_id:1,receipt_number:'2026110912340007',payment_method:'CASH',subtotal:'27.50',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.00',total:'22.50'};
const lines=[{id:11,sale_id:7,product_id:17,product_name:'Food',sku:'F17',quantity:'1.000',unit_price:'27.5000',line_total:'27.50'}];
const rawLines=[{product_id:17,unit_code:'EA'}];
test('R1 CASH voucher posts RM22.50 from gross RM27.50 with balanced real journal',()=>{
 const journal=makePosCashJournal(bill,'10.00');
 assert.equal(moneyBalance(journal),0n);
 assert.equal(journal.find(row=>row.accountCode==='1010').debit,'22.50');
 assert.equal(journal.find(row=>row.accountCode==='4010').credit,'22.50');
 assert.equal(journal.find(row=>row.accountCode==='5010').debit,'10.00');
});
test('R1 DUITNOW_QR voucher uses clearing and not cash with balanced journal',()=>{
 const journal=makePosNonCashJournal(bill,'10.00','DUITNOW_QR');
 assert.equal(moneyBalance(journal),0n);
 assert.equal(journal.find(row=>row.accountCode==='1022').debit,'22.50');
 assert.ok(!journal.some(row=>row.accountCode==='1010'));
});
test('R1 C4.1 immutable checkout evidence reconciles voucher without historical inference',()=>{
 const snapshot=makeCheckoutEvidenceR13({sale,lines,rawLines,adjustment});
 assert.equal(snapshot.amounts.voucher,'5.00');
 assert.equal(snapshot.amounts.subtotal,'27.50');
 assert.equal(snapshot.amounts.total,'22.50');
 assert.equal(snapshot.authoritative_ubl_mapping_complete,false);
 assert.throws(()=>makeCheckoutEvidenceR13({sale,lines,rawLines}),/EINV_C4_SALE_TOTAL_MISMATCH/);
});
test('R1 C4.2A records actual voucher allocation in taxable base, never invented tax',()=>{
 const doc=makeCheckoutLineTaxEvidenceC42({sale,lines,productTaxRows:[{id:17,jkdm_tax_type:'NONE'}],quote:{bill,sst:{salesTax:{enabled:false},serviceTax:{enabled:false}}},adjustment});
 assert.equal(doc.lines[0].voucher_amount,'5.00');
 assert.equal(doc.lines[0].taxable_base,'22.50');
 assert.equal(doc.lines[0].tax_amount,'0.00');
 assert.equal(doc.tax_method,'EXCLUSIVE_PERCENT_ON_POST_REDUCTION_LINE');
 assert.equal(doc.submission_ready,false);
});
test('R1 C4.2A fails closed on an unbound or contradictory voucher amount',()=>{
 const input={sale,lines,productTaxRows:[{id:17,jkdm_tax_type:'NONE'}],quote:{bill,sst:{salesTax:{enabled:false},serviceTax:{enabled:false}}}};
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42(input),/EINV_C42_REDUCTIONS_NOT_CONNECTED/);
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...input,adjustment:{discount_amount:'0.00',voucher_amount:'4.99'}}),/EINV_C42_REDUCTIONS_NOT_CONNECTED/);
});
test('R1 mixed taxable voucher discount matches authoritative POS tax math',()=>{
 const two={...bill,subtotal:'20.00',subtotalBeforeTax:'20.00',voucher:'5.00',serviceTax:'0.45',total:'15.45'};
 const r={...sale,subtotal:'20.00',service_tax:'0.45',total:'15.45'};
 const items=[{id:1,sale_id:7,product_id:1,line_total:'10.00'},{id:2,sale_id:7,product_id:2,line_total:'10.00'}];
 const doc=makeCheckoutLineTaxEvidenceC42({sale:r,lines:items,productTaxRows:[{id:1,jkdm_tax_type:'SERVICE_TAX'},{id:2,jkdm_tax_type:'NONE'}],quote:{bill:two,sst:{salesTax:{enabled:false},serviceTax:{enabled:true,registrationConfigured:true,rate:'6.000'}}},adjustment});
 assert.equal(doc.lines[0].tax_amount,'0.45');
 assert.deepEqual(doc.lines.map(x=>x.voucher_amount),['2.50','2.50']);
 assert.equal(doc.totals.payable,'15.45');
});
test('R1 discount and voucher are never stacked, and missing validation blocks checkout',()=>{
 assert.deepEqual(normalizedCodes({discountCode:'',voucherCode:' vch-01 '}),{discountCode:'',voucherCode:'VCH-01'});
 assert.throws(()=>assertReduction({bill,discount:{eligible:false},voucher:{eligible:false}},{discountCode:'',voucherCode:'VCH-01'}),/POS_VOUCHER_NOT_ELIGIBLE/);
 assert.throws(()=>assertReduction({bill,discount:{eligible:true},voucher:{eligible:true}},{discountCode:'ABC',voucherCode:'VCH-01'}),/POS_STACKING_POLICY_NOT_APPROVED/);
 assert.doesNotThrow(()=>assertReduction({bill,discount:{eligible:false},voucher:{eligible:true}},{discountCode:'',voucherCode:'VCH-01'}));
});
test('R1 zero reduction retains old accounting, evidence and tax behavior',()=>{
 const zero={...bill,voucher:'0.00',total:'27.50'};
 const journal=makePosCashJournal(zero,'10.00');
 assert.equal(moneyBalance(journal),0n);
 assert.equal(journal.find(row=>row.accountCode==='4010').credit,'27.50');
 const snapshot=makeCheckoutEvidenceR13({sale:{...sale,total:'27.50'},lines,rawLines});
 assert.ok(!('discount' in snapshot.amounts));
 assert.ok(!('voucher' in snapshot.amounts));
});
test('R1 database settlement requires real sale and immutable 050 reduction ledgers',()=>{
 const sql=source('database/050_tenant_pos_reduction_settlement.sql');
 for(const name of ['pos_sale_reductions','pos_payment_attempt_reductions','psr_no_update','psr_no_delete','ppar_no_delete','voucher_reservation_id'])assert.ok(sql.includes(name),name);
 assert.match(sql,/FOREIGN KEY\(sale_id\) REFERENCES pos_sales\(id\)/);
 assert.doesNotMatch(sql,/\b(?:DELETE FROM|TRUNCATE|DROP TABLE)\b/i);
 const cash=source('backend/src/pos-cash-checkout.js'),manual=source('backend/src/pos-multi-payment.js');
 for(const code of [cash,manual]){
  assert.match(code,/await persistSaleReduction\(conn,/);
  assert.match(code,/await captureCheckoutLineTaxEvidenceC42\(conn,/);
  assert.match(code,/await conn\.commit\(\)/);
  assert.match(code,/await conn\.rollback\(\)/);
 }
});
test('R1 QR reserves before START commit, redeems only at PAID, and allows explicit unpaid release',()=>{
 const js=source('backend/src/pos-multi-payment.js'),helper=source('backend/src/pos-reduction-settlement.js');
 assert.match(js,/await reserveCheckoutVoucher\(conn,/);
 assert.match(js,/await persistPendingReduction\(conn,/);
 assert.match(js,/if\(attempt.status!==['"]PENDING['"]\)/);
 assert.match(js,/verifiedInMerchantAccount/);
 assert.match(js,/await cancelPendingReduction\(conn,/);
 assert.match(js,/unpaidConfirmed!==true/);
 assert.match(helper,/await redeemVoucher\(conn,/);
 assert.match(helper,/await releaseVoucher\(conn,/);
 assert.match(helper,/status='REDEEMED'/);
 assert.match(helper,/status='RELEASED'/);
});
test('R1 no external MyInvois submission, KDS re-dispatch or historical sale backfill',()=>{
 const sourceFiles=['pos-reduction-settlement.js','pos-cash-checkout.js','pos-multi-payment.js'].map(x=>source('backend/src/'+x)).join('\n');
 assert.doesNotMatch(sourceFiles,/submitDocuments|createInvoiceSignature|kdsDispatch\(/i);
 const sql=source('database/050_tenant_pos_reduction_settlement.sql');
 assert.doesNotMatch(sql,/UPDATE\s+pos_sales|INSERT\s+INTO\s+pos_sales|UPDATE\s+einvoice_/i);
 const app=source('backend/src/app.js');
 assert.match(app,/permitted\('pos.checkout.manual'\),cancelPendingManualPayment/);
});

test('R1 voucher reservation and redemption use one real sale linkage, not the quote',async()=>{
 const {reserveCheckoutVoucher,persistSaleReduction}=await import('../src/pos-reduction-settlement.js');
 const calls=[];
 const voucher={id:1,status:'ACTIVE',is_deleted:0,order_scope:'BOTH',eligibility_type:'ALL',starts_at:'2026-11-01 00:00:00',ends_at:'2026-11-30 23:59:59',discount_type:'FIXED',discount_value:'5.00',minimum_spend:'0.00',maximum_discount:null,usage_limit:1,per_customer_limit:null};
 const reservation={id:31,voucher_id:1,status:'RESERVED',checkout_ref:'POS_DRAFT_9',discount_amount:'5.00',sale_ref:null};
 const conn={async execute(sql,params){
  calls.push(sql);
  if(sql.includes('FROM vouchers v WHERE v.id=? FOR UPDATE'))return [[voucher]];
  if(sql.includes('FROM voucher_reservations WHERE reservation_key='))return [[]];
  if(sql.includes('FROM voucher_reservations WHERE voucher_id=? AND status IN'))return [[]];
  if(sql.includes('FROM voucher_targets WHERE voucher_id='))return [[]];
  if(sql.startsWith('INSERT INTO voucher_reservations'))return [{insertId:31}];
  if(sql.startsWith('INSERT INTO voucher_audit_logs'))return [{affectedRows:1}];
  if(sql.startsWith('INSERT INTO pos_sale_reductions'))return [{affectedRows:1}];
  if(sql.startsWith('SELECT voucher_id FROM voucher_reservations'))return [[{voucher_id:1}]];
  if(sql.includes('SELECT * FROM voucher_reservations WHERE id='))return [[reservation]];
  if(sql.includes('SELECT draft_id FROM pos_sales'))return [[{draft_id:9}]];
  if(sql.includes('JOIN pos_sale_reductions r ON r.sale_id=s.id'))return [[{id:7,status:'PAID',voucher_amount:'5.00',voucher_reservation_id:31}]];
  if(sql.startsWith('UPDATE voucher_reservations SET status='))return [{affectedRows:1}];
  throw Error('UNEXPECTED_MOCK_SQL '+sql);
 }};
 const reservationId=await reserveCheckoutVoucher(conn,{master:{voucherId:'1'},requestKey:'12345678-aaaa-bbbb-cccc-111111111111',draft:{id:9,order_scope:'TAKE_AWAY'},saleLines:[{product_id:17,category_id:1,lineTotal:'27.50'}],quote:{bill},userId:2,now:'2026-11-09 14:00:00'});
 assert.equal(reservationId,'31');
 await persistSaleReduction(conn,{saleId:7,branchId:1,master:{voucherId:'1'},reservationId,quote:{bill},userId:2});
 assert.ok(calls.some(x=>x.startsWith('INSERT INTO pos_sale_reductions')));
 assert.ok(calls.some(x=>x.startsWith("UPDATE voucher_reservations SET status='REDEEMED'")));
 assert.ok(calls.some(x=>x.includes('JOIN pos_sale_reductions r ON r.sale_id=s.id')));
});
test('R1 voucher cannot redeem without a matching PAID sale / reservation amount',async()=>{
 const {persistSaleReduction}=await import('../src/pos-reduction-settlement.js');
 const voucher={id:1,status:'ACTIVE',is_deleted:0,order_scope:'BOTH',eligibility_type:'ALL',starts_at:'2026-11-01 00:00:00',ends_at:'2026-11-30 23:59:59',discount_type:'FIXED',discount_value:'5.00',minimum_spend:'0.00',usage_limit:1};
 let redeemed=false;
 const conn={async execute(sql){
  if(sql.startsWith('INSERT INTO pos_sale_reductions'))return [{affectedRows:1}];
  if(sql.includes('SELECT voucher_id FROM voucher_reservations'))return [[{voucher_id:1}]];
  if(sql.includes('FROM vouchers v WHERE v.id='))return [[voucher]];
  if(sql.includes('SELECT * FROM voucher_reservations WHERE id='))return [[{id:31,voucher_id:1,status:'RESERVED',checkout_ref:'POS_DRAFT_9',discount_amount:'5.00',sale_ref:null}]];
  if(sql.includes('SELECT draft_id FROM pos_sales'))return [[{draft_id:9}]];
  if(sql.includes('JOIN pos_sale_reductions r ON r.sale_id=s.id'))return [[{id:7,status:'PAID',voucher_amount:'4.00',voucher_reservation_id:31}]];
  if(sql.startsWith('UPDATE voucher_reservations')){redeemed=true;return [{affectedRows:1}];}
  throw Error('UNEXPECTED_MOCK_SQL '+sql);
 }};
 await assert.rejects(persistSaleReduction(conn,{saleId:7,branchId:1,master:{voucherId:'1'},reservationId:'31',quote:{bill},userId:2}),/POS_SALE_NOT_VERIFIED/);
 assert.equal(redeemed,false);
});
