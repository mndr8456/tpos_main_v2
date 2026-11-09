import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {randomUUID,createHash} from 'node:crypto';
import {inventoryIssue} from '../src/inventory-cost.js';
import {makePosCashJournal} from '../src/pos-cash-ledger.js';
import {totalDraftLines} from '../src/pos-money.js';
import {parseSen,fmtSen} from '../src/cash-shift-money.js';
import {assignPosReceiptNumber,legacyReceiptNumber} from '../src/pos-receipt-number.js';
const source=readFileSync(new URL('../src/pos-cash-checkout.js',import.meta.url),'utf8');
const chain={int(){return this},positive(){return this},max(){return this},regex(){return this},uuid(){return this},trim(){return this},default(){return this},strict(){return this},parse(v){return v}};
const z={coerce:{number:()=>chain},object:()=>chain,string:()=>chain,uuid:()=>chain,number:()=>chain};
// The real receipt-number writer participates in the mocked atomic transaction.
const saleTaxRateSnapshot=()=>({salesTaxRate:null,serviceTaxRate:null,serviceChargeRate:null});
const DEFAULT_RECEIPT_FOOTER='Thank you.';
const normalizedCodes=({discountCode='',voucherCode=''})=>({discountCode:discountCode.trim(),voucherCode:voucherCode.trim()});
const assertReduction=()=>{};
const lockReductionMaster=async()=>({});
const reserveCheckoutVoucher=async()=>null;
const persistSaleReduction=async()=>{};
// This legacy vm harness strips ES imports. Simulate the new C4 transaction participant,
// and verify its INSERT belongs to the same transaction as the POS sale.
const captureCheckoutSnapshotR13=async(conn,{saleId,rawLines})=>{
 assert.equal(saleId,11);
 assert.ok(Array.isArray(rawLines)&&rawLines.length>0);
 await conn.execute('INSERT INTO einvoice_checkout_snapshots(sale_id,snapshot_status) VALUES(?,?)',[saleId,'INCOMPLETE']);
};
const captureCheckoutLineTaxEvidenceC42=async(conn,{saleId,quote})=>{assert.equal(saleId,11);assert.ok(quote.bill);await conn.execute('INSERT INTO einvoice_line_tax_evidence_c42(sale_id) VALUES(?)',[saleId]);};
const captureCheckoutVerifiedMappingEvidenceC42B=async(conn,{saleId})=>{assert.equal(saleId,11);await conn.execute('INSERT INTO einvoice_line_mapping_evidence_c42b(sale_id) VALUES(?)',[saleId]);};
const captureReceiptFooter=async(conn,saleId)=>{const [saved]=await conn.execute('INSERT INTO pos_sale_receipt_footers(sale_id,footer_message) SELECT ?,footer_message FROM receipt_settings WHERE id=1',[saleId]);if(saved.affectedRows!==1)throw Error('RECEIPT_SETTINGS_NOT_INITIALIZED');};
function checkoutHarness(){
 const ctx={z,randomUUID,createHash,inventoryIssue,makePosCashJournal,totalDraftLines,parseSen,fmtSen,saleTaxRateSnapshot,assignPosReceiptNumber,legacyReceiptNumber,captureReceiptFooter,captureCheckoutSnapshotR13,captureCheckoutLineTaxEvidenceC42,captureCheckoutVerifiedMappingEvidenceC42B,normalizedCodes,assertReduction,lockReductionMaster,reserveCheckoutVoucher,persistSaleReduction,DEFAULT_RECEIPT_FOOTER,console,Map,JSON,BigInt,Number,String,Error,Set,Promise};
 const text=source.replace(/^import .*?;$/gm,'').replace(/export async function /g,'async function ').replace(/export function /g,'function ');
 const sandbox=vm.createContext(ctx);vm.runInContext(text+'\nglobalThis.cashCheckoutHarness=cashCheckout;',sandbox);
 return sandbox.cashCheckoutHarness;
}
function fixture({stock='10.00',failOn='',saleExists=false}={}){
 const writes=[];let commits=0,rollbacks=0,released=0;
 const sale={id:11,draft_id:7,branch_id:1,cashier_user_id:2,shift_id:9,table_id:null,order_scope:'TAKE_AWAY',cash_received:'30.00',total:'25.00',posted_time:'2026-11-02 12:00:00',branch_name:'Main Branch',cashier_name:'Cashier',subtotal:'25.00',sales_tax:'0.00',service_tax:'0.00',service_charge:'0.00',rounding_adjustment:'0.00',cash_change:'5.00',payment_method:'CASH'};
 const line={id:4,product_id:3,product_name:'Nasi',sku:'PRD-3',quantity:'5.000',unit_price:'5.0000',category_id:1,unit_code:'PCS',track_stock:1,product_type:'GOODS'};
 const conn={async beginTransaction(){writes.push('BEGIN')},async commit(){commits++},async rollback(){rollbacks++},release(){released++},async execute(sql,params){
  if(failOn&&sql.includes(failOn))throw Error('SIMULATED_MYSQL_FAILURE');
  if(sql.startsWith('SELECT id,draft_id,cash_received,total FROM pos_sales WHERE request_key'))return [[saleExists?{id:11,draft_id:7,cash_received:'30.00',total:'25.00'}:undefined].filter(Boolean)];
  if(sql.startsWith('SELECT shift_id,branch_id,cashier_user_id FROM pos_drafts'))return [[{shift_id:9,branch_id:1,cashier_user_id:2}]];
  if(sql.startsWith('SELECT id,status,branch_id,cashier_user_id FROM cash_shifts'))return [[{id:9,status:'OPEN',branch_id:1,cashier_user_id:2}]];
  if(sql.startsWith('SELECT id,branch_id,shift_id,cashier_user_id,order_scope,table_id,status,version FROM pos_drafts'))return [[{id:7,branch_id:1,shift_id:9,cashier_user_id:2,order_scope:'TAKE_AWAY',table_id:null,status:'DRAFT',version:1}]];
  if(sql.includes('FROM payment_method_settings WHERE branch_id'))return [[{is_active:1}]];
  if(sql.startsWith('SELECT id,product_id,product_name,sku,quantity,unit_price,track_stock,product_type,category_id,unit_code FROM pos_draft_lines'))return [[line]];
  if(sql.startsWith("SELECT id FROM pos_payment_attempts WHERE draft_id="))return [[]];
  if(sql.includes("TABLE_NAME='pos_sale_reductions'"))return [[{n:0}]];
  if(sql.startsWith('SELECT id,track_stock,product_structure,product_type,status,is_deleted FROM products'))return [[{id:3,track_stock:1,product_structure:'SINGLE',product_type:'GOODS',status:'ACTIVE',is_deleted:0}]];
  if(sql.startsWith('SELECT quantity_on_hand,carrying_value,average_cost FROM inventory_branch_balances'))return [[{quantity_on_hand:stock,carrying_value:'35.00',average_cost:'3.50'}]];
  if(sql.startsWith('INSERT INTO')){writes.push(sql);return [{insertId:sql.includes('pos_sales(')?11:22,affectedRows:1}]}
  if(sql.startsWith('UPDATE')){writes.push(sql);return [{affectedRows:1}]}
  if(sql.startsWith("SELECT receipt_number,DATE_FORMAT(posted_at"))return [[{receipt_number:null,receipt_prefix:'2026111200'}]];
  if(sql.startsWith('SELECT s.*,DATE_FORMAT(s.posted_at'))return [[sale]];
  if(sql.startsWith('SELECT product_name,sku,quantity,unit_price,line_total,inventory_cost FROM pos_sale_lines'))return [[{product_name:'Nasi',quantity:'5.000',unit_price:'5.0000',line_total:'25.00',inventory_cost:'17.50'}]];
  if(sql.includes('FROM pos_sale_receipt_footers WHERE sale_id=?'))return [[{footer_message:'Thank you.'}]];
  if(sql.startsWith('SELECT registered_name,trading_name'))return [[{registered_name:'Test Business',address_line1:'Test Street',city:'Kajang',postcode:'43000',state:'Selangor'}]];
  if(sql.startsWith('SELECT ssm_registration_number'))return [[{ssm_registration_number:'SSM-TEST'}]];
  if(sql.startsWith('SELECT tax_type,is_enabled FROM sst_tax_settings'))return [[{tax_type:'SALES_TAX',is_enabled:1},{tax_type:'SERVICE_TAX',is_enabled:0}]];
  throw Error('UNEXPECTED_QUERY:'+sql);
 }};
 const profile={auth:{pool:{getConnection:async()=>conn},user:{id:2,role_code:'CASHIER',branchIds:['1'],permissions:['pos.checkout.cash','pos.cart.manage']}}};
 const req={...profile,params:{id:'7'},body:{requestKey:'c129522e-42c7-4cc0-8f1d-69d2acee815b',expectedVersion:1,expectedTotal:'25.00',cashReceived:'30.00',discountCode:'',voucherCode:''}};
 const res={statusCode:200,set(){return this},status(v){this.statusCode=v;return this},json(v){this.value=v;return this}};
 const quote={bill:{total:'25.00',subtotalBeforeTax:'25.00',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0}};
 return {conn,req,res,quote,writes,stats:()=>({commits,rollbacks,released})};
}
const get=checkoutHarness();
// The quote function is intentionally stubbed here; the authoritative quote itself has dedicated SST/tax tests.
const calculateDraftQuote=async(_conn,_req,_draftId,_codes)=>({bill:{total:'25.00',subtotalBeforeTax:'25.00',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0}});
// Inject quote into the handler's module context for deterministic tenant DB tests.
function handler(){const sandbox=vm.createContext({z,randomUUID,createHash,inventoryIssue,makePosCashJournal,totalDraftLines,parseSen,fmtSen,calculateDraftQuote,saleTaxRateSnapshot,assignPosReceiptNumber,legacyReceiptNumber,captureReceiptFooter,captureCheckoutSnapshotR13,captureCheckoutLineTaxEvidenceC42,captureCheckoutVerifiedMappingEvidenceC42B,normalizedCodes,assertReduction,lockReductionMaster,reserveCheckoutVoucher,persistSaleReduction,DEFAULT_RECEIPT_FOOTER,console,Map,JSON,BigInt,Number,String,Error,Set,Promise});const s=source.replace(/^import .*?;$/gm,'').replace(/export async function /g,'async function ').replace(/export function /g,'function ');vm.runInContext(s+'\nglobalThis.handler=cashCheckout;',sandbox);return sandbox.handler;}
test('Cash checkout commits a single sale, stock issue, journal, cash received and receipt',async()=>{
 const f=fixture();await handler()(f.req,f.res);
 assert.equal(f.res.statusCode,201);assert.equal(f.res.value.receipt.total,'25.00');assert.equal(f.res.value.receipt.cashChange,'5.00');
 assert.deepEqual(f.stats(),{commits:1,rollbacks:0,released:1});
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO pos_sales(')).length,1);
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO pos_sale_receipt_footers(')).length,1);
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO einvoice_checkout_snapshots(')).length,1);
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO einvoice_line_tax_evidence_c42(')).length,1);
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO einvoice_line_mapping_evidence_c42b(')).length,1);
 assert.equal(f.res.value.receipt.footerMessage,'Thank you.');
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO inventory_movements(')).length,1);
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO accounting_journal_lines(')).length,4);
 assert.ok(f.writes.some(x=>x.includes("status='COMPLETED'")));
});
test('Insufficient stock rolls back without a sale or financial journal',async()=>{
 const f=fixture({stock:'4.00'});
 await assert.rejects(handler()(f.req,f.res),/POS_INSUFFICIENT_STOCK/);
 assert.equal(f.stats().rollbacks,1);assert.equal(f.writes.filter(x=>x.includes('INSERT INTO')).length,0);
});
test('MySQL failure after inserting sale rolls back all writes',async()=>{
 const f=fixture({failOn:'INSERT INTO pos_sale_lines'});
 await assert.rejects(handler()(f.req,f.res),/SIMULATED_MYSQL_FAILURE/);
 assert.equal(f.stats().commits,0);assert.equal(f.stats().rollbacks,1);
});
test('Idempotent request returns existing receipt without a second sale',async()=>{
 const f=fixture({saleExists:true});await handler()(f.req,f.res);
 assert.equal(f.res.value.idempotent,true);assert.equal(f.stats().commits,1);
 assert.equal(f.writes.filter(x=>x.includes('INSERT INTO')).length,0);
});
