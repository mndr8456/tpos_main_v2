import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeCheckoutLineTaxEvidenceC42,captureCheckoutLineTaxEvidenceC42,EINV_C42_SUBMISSION_ENABLED} from '../src/einvoice-line-tax-evidence-c42.js';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const sale={id:20,branch_id:1,subtotal:'25.00',sales_tax:'0.80',service_tax:'0.60',service_charge:'0.00',rounding_adjustment:'0.00',total:'26.40'};
const lines=[{id:41,sale_id:20,product_id:7,line_total:'10.00'},{id:42,sale_id:20,product_id:8,line_total:'10.00'},{id:43,sale_id:20,product_id:9,line_total:'5.00'}];
const productTaxRows=[{id:7,jkdm_tax_type:'SALES_TAX'},{id:8,jkdm_tax_type:'SERVICE_TAX'},{id:9,jkdm_tax_type:'NONE'}];
const quote={sst:{salesTax:{enabled:true,registrationConfigured:true,rate:'8.000'},serviceTax:{enabled:true,registrationConfigured:true,rate:'6.000'}},bill:{subtotal:'25.00',subtotalBeforeTax:'25.00',salesTax:'0.80',serviceTax:'0.60',discount:'0.00',voucher:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0,total:'26.40'}};
const args={sale,lines,productTaxRows,quote};
test('C4.2A captures exact checkout Sales Tax and Service Tax independently',()=>{
 const doc=makeCheckoutLineTaxEvidenceC42(args);
 assert.deepEqual(doc.lines.map(x=>x.tax_amount),['0.80','0.60','0.00']);
 assert.deepEqual(doc.lines.map(x=>x.effective_jkdm_tax_type),['SALES_TAX','SERVICE_TAX','NONE']);
 assert.equal(doc.totals.payable,'26.40');assert.equal(doc.submission_ready,false);assert.equal(EINV_C42_SUBMISSION_ENABLED,false);
});
test('C4.2A denies unregistered or disabled tax and never infers LHDN codes from POS or product defaults',()=>{
 const doc=makeCheckoutLineTaxEvidenceC42({...args, sale:{...sale,sales_tax:'0.00',total:'25.60'},quote:{...quote,sst:{...quote.sst,salesTax:{enabled:false,registrationConfigured:false,rate:'8.000'}},bill:{...quote.bill,salesTax:'0.00',total:'25.60'}}});
 assert.equal(doc.lines[0].tax_amount,'0.00');assert.equal(doc.lines[0].effective_jkdm_tax_type,'NONE');
 assert.equal(doc.lines[0].lhdn_classification,null);assert.equal(doc.lines[0].lhdn_tax_type_code,null);assert.equal(doc.lines[0].ubl_unit_code,null);
});
test('C4.2A fails closed when checkout tax, invoice amount or rounding does not reconcile',()=>{
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...args,sale:{...sale,sales_tax:'0.79'}}),/EINV_C42_LINE_TAX_RECONCILIATION_FAILED/);
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...args,sale:{...sale,total:'26.41'}}),/EINV_C42_BILL_RECONCILIATION_FAILED/);
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...args,sale:{...sale,rounding_adjustment:'0.01'}}),/EINV_C42_ROUNDING_RECONCILIATION_FAILED/);
});
test('C4.2A rejects unconnected reduction, duplicate line and unverifiable tax rate',()=>{
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...args,quote:{...quote,bill:{...quote.bill,discount:'1.00'}}}),/EINV_C42_REDUCTIONS_NOT_CONNECTED/);
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...args,lines:[lines[0],lines[0]]}),/EINV_C42_SALE_LINE_MISMATCH/);
 assert.throws(()=>makeCheckoutLineTaxEvidenceC42({...args,quote:{...quote,sst:{...quote.sst,salesTax:{...quote.sst.salesTax,rate:'999'}}}}),/EINV_C42_INVALID_RATE/);
});
test('C4.2A keeps the immutable C4.1 snapshot untouched and never sends MyInvois data',async()=>{
 const sql=read('database/048_tenant_einvoice_line_tax_evidence.sql');
 assert.match(sql,/UNIQUE \(sale_id\)/);assert.match(sql,/BEFORE UPDATE/);assert.match(sql,/BEFORE DELETE/);
 assert.doesNotMatch(sql,/UPDATE\s+einvoice_checkout_snapshots|ALTER\s+TABLE\s+pos_sales|DELETE\s+FROM|DROP\s+TABLE/i);
 for(const name of ['pos-cash-checkout.js','pos-multi-payment.js']){
  const source=read('backend/src/'+name);const a=source.indexOf('await captureCheckoutSnapshotR13(conn,{saleId,rawLines});'),b=source.indexOf('await captureCheckoutLineTaxEvidenceC42(conn,{saleId,quote});');
  assert.ok(a>0&&b>a);assert.ok(source.indexOf('await conn.commit()',b)>b);
 }
 assert.match(read('backend/src/tenants.js'),/048_tenant_einvoice_line_tax_evidence\.sql/);
 assert.match(read('backend/scripts/setup-einvoice-line-tax-evidence.js'),/process\.argv\.includes\('--apply'\)/);
});
test('C4.2A writes a digest inside caller transaction and remains optional before 048',async()=>{
 const requests=[];
 const conn={execute:async(sql,p=[])=>{
  requests.push({sql,p});
  if(sql.includes('information_schema.TABLES'))return [[{n:1}]];
  if(sql.includes('FROM pos_sales WHERE id='))return [[sale]];
  if(sql.includes('FROM pos_sale_lines WHERE sale_id='))return [lines];
  if(sql.startsWith('SELECT id,jkdm_tax_type FROM products'))return [productTaxRows];
  if(sql.startsWith('INSERT INTO einvoice_line_tax_evidence_c42'))return [{affectedRows:1}];
  throw Error('UNEXPECTED_TEST_QUERY');
 }};
 assert.deepEqual(await captureCheckoutLineTaxEvidenceC42(conn,{saleId:20,quote}),{captured:true,status:'INCOMPLETE'});
 const insert=requests.at(-1);assert.match(insert.sql,/^INSERT INTO einvoice_line_tax_evidence_c42/);assert.match(insert.p[3],/^[a-f0-9]{64}$/);
 const noMigration={execute:async()=>[[{n:0}]]};
 assert.deepEqual(await captureCheckoutLineTaxEvidenceC42(noMigration,{saleId:20,quote}),{captured:false,reason:'MIGRATION_048_NOT_APPLIED'});
});
