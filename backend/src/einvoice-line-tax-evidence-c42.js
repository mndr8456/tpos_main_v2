// C4.2A: append-only checkout-time POS tax evidence, NOT submission-ready UBL.
// This engine reconciles the already-posted bill; it NEVER computes a new checkout total.
import {createHash} from 'node:crypto';
import {makeReductionAllocationPreviewC43A} from './einvoice-reduction-allocation-c43a.js';
const cents = value => {
 const m=/^(-?)(0|[1-9]\d{0,13})\.(\d{2})$/.exec(String(value??''));
 if(!m)throw Error('EINV_C42_INVALID_AMOUNT');
 return (m[1]==='-'?-1n:1n)*(BigInt(m[2])*100n+BigInt(m[3]));
};
const money = value => `${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;
const milli = value => {
 const m=/^(0|[1-9]\d{0,2})(?:\.(\d{1,3}))?$/.exec(String(value??''));
 if(!m)throw Error('EINV_C42_INVALID_RATE');
 const n=BigInt(m[1])*1000n+BigInt((m[2]||'').padEnd(3,'0'));
 if(n>100000n)throw Error('EINV_C42_INVALID_RATE');
 return n;
};
const safeId=value=>/^[1-9]\d*$/.test(String(value??''));
export const EINV_C42_SUBMISSION_ENABLED=false;
export function makeCheckoutLineTaxEvidenceC42({sale,lines,productTaxRows,quote,adjustment=null}={}) {
 if(!sale||!safeId(sale.id)||!Array.isArray(lines)||!lines.length||!Array.isArray(productTaxRows)||!quote?.sst||!quote?.bill)throw Error('EINV_C42_INPUT_MISSING');
 const taxMap=new Map(productTaxRows.map(p=>[String(p.id),p]));
 if(taxMap.size!==productTaxRows.length)throw Error('EINV_C42_DUPLICATE_PRODUCT_TAX');
 const rates={SALES_TAX:quote.sst.salesTax,SERVICE_TAX:quote.sst.serviceTax};
 const reductions=cents(quote.bill.discount)+cents(quote.bill.voucher);
 if(reductions>0n&&(!adjustment||cents(adjustment.discount_amount)!==cents(quote.bill.discount)||cents(adjustment.voucher_amount)!==cents(quote.bill.voucher)))throw Error('EINV_C42_REDUCTIONS_NOT_CONNECTED');
 const allocation=reductions>0n?makeReductionAllocationPreviewC43A({lines:lines.map(l=>({saleLineId:l.id,productId:l.product_id,lineTotal:String(l.line_total)})),bill:quote.bill,saleId:sale.id}):null;
 const allocated=new Map((allocation?.lines||[]).map(l=>[l.sale_line_id,l]));
 const sums={SALES_TAX:0n,SERVICE_TAX:0n},ids=new Set();let gross=0n;
 const evidence=lines.map(line=>{
  if(!safeId(line.id)||ids.has(String(line.id))||String(line.sale_id)!==String(sale.id)||!safeId(line.product_id))throw Error('EINV_C42_SALE_LINE_MISMATCH');
  ids.add(String(line.id));
  const product=taxMap.get(String(line.product_id));
  if(!product)throw Error('EINV_C42_PRODUCT_TAX_MISSING');
  const amount=cents(line.line_total);if(amount<0n)throw Error('EINV_C42_NEGATIVE_LINE');gross+=amount;
  const type=String(product.jkdm_tax_type??'NONE');
  if(!['NONE','SALES_TAX','SERVICE_TAX'].includes(type))throw Error('EINV_C42_UNKNOWN_TAX_TYPE');
  const settings=rates[type];
  const active=type!=='NONE'&&settings?.enabled===true&&settings?.registrationConfigured===true;
  const appliedRate=active?milli(settings.rate):0n;
  const row=allocated.get(String(line.id));
  const reduced=row?cents(row.post_reduction_base):amount;
  const tax=active?(reduced*appliedRate+50000n)/100000n:0n;
  if(active)sums[type]+=tax;
  return {sale_line_id:String(line.id),product_id:String(line.product_id),pos_jkdm_tax_type:type,
   effective_jkdm_tax_type:active?type:'NONE',effective_rate_pct:active?String(settings.rate):'0',
   taxable_base:money(reduced),tax_amount:money(tax),
   lhdn_classification:null,lhdn_tax_type_code:null,ubl_unit_code:null,
   discount_amount:row?.discount_amount??'0.00',voucher_amount:row?.voucher_amount??'0.00',mapping_confirmed:false};
 });
 if(sums.SALES_TAX!==cents(sale.sales_tax)||sums.SERVICE_TAX!==cents(sale.service_tax))throw Error('EINV_C42_LINE_TAX_RECONCILIATION_FAILED');
 if(gross!==cents(quote.bill.subtotal))throw Error('EINV_C42_GROSS_RECONCILIATION_FAILED');

 for(const [db,calc] of [['subtotal','subtotalBeforeTax'],['sales_tax','salesTax'],['service_tax','serviceTax'],['service_charge','serviceCharge'],['total','total']]){
  if(cents(sale[db])!==cents(quote.bill[calc]))throw Error('EINV_C42_BILL_RECONCILIATION_FAILED');
 }
 if(cents(sale.rounding_adjustment)!==BigInt(quote.bill.roundingAdjustmentSen))throw Error('EINV_C42_ROUNDING_RECONCILIATION_FAILED');
 return {version:'C4.2A',sale_id:String(sale.id),branch_id:String(sale.branch_id),status:'INCOMPLETE',
  tax_method:reductions>0n?'EXCLUSIVE_PERCENT_ON_POST_REDUCTION_LINE':'EXCLUSIVE_PERCENT_ON_LINE_TOTAL_NO_REDUCTIONS',lines:evidence,
  totals:{gross_lines:money(gross),sales_tax:money(sums.SALES_TAX),service_tax:money(sums.SERVICE_TAX),service_charge:String(sale.service_charge),rounding_adjustment:String(sale.rounding_adjustment),payable:String(sale.total)},
  invoice_level_service_charge_allocation:null,invoice_level_rounding_allocation:null,
  missing_mapping:['EXPLICIT_PRODUCT_CLASSIFICATION_CONFIRMATION','LHDN_TAX_TYPE_CODES','UBL_UNIT_CODES','SERVICE_CHARGE_UBL_TREATMENT','ROUNDING_UBL_TREATMENT','DIGITAL_SIGNATURE'],submission_ready:false};
}
export async function captureCheckoutLineTaxEvidenceC42(conn,{saleId,quote,adjustment=null}) {
 const [[table]]=await conn.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='einvoice_line_tax_evidence_c42'");
 if(Number(table?.n)!==1)return {captured:false,reason:'MIGRATION_048_NOT_APPLIED'};
 const [[sale]]=await conn.execute('SELECT id,branch_id,subtotal,sales_tax,service_tax,service_charge,rounding_adjustment,total FROM pos_sales WHERE id=?',[saleId]);
 const [lines]=await conn.execute('SELECT id,sale_id,product_id,line_total FROM pos_sale_lines WHERE sale_id=? ORDER BY id',[saleId]);
 const products=[...new Set(lines.map(l=>String(l.product_id)))];
 const [productTaxRows]=await conn.execute(`SELECT id,jkdm_tax_type FROM products WHERE id IN (${products.map(()=>'?').join(',')})`,products);
 const document=makeCheckoutLineTaxEvidenceC42({sale,lines,productTaxRows,quote,adjustment});
 const json=JSON.stringify(document),hash=createHash('sha256').update(json).digest('hex');
 await conn.execute('INSERT INTO einvoice_line_tax_evidence_c42(sale_id,branch_id,evidence_json,evidence_sha256) VALUES(?,?,?,?)',[saleId,sale.branch_id,json,hash]);
 return {captured:true,status:'INCOMPLETE'};
}
