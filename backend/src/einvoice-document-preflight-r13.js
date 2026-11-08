// EINV-R1.3 Phase C1: immutable POS reconciliation and supplier preflight.
// No personal data is returned. This is NOT an e-Invoice generator.
import {assessInvoiceReadiness} from './einvoice-document-foundation-r13.js';

function decimal(value,places,code) {
  const raw=String(value??'');
  if(!new RegExp(`^(?:0|[1-9]\\d{0,14})\\.\\d{${places}}$`).test(raw)) throw new Error(code);
  return BigInt(raw.replace('.',''));
}
const fail=(code)=>Object.freeze({ok:false,code});

/** No mutation, no API, no buyer data in response. Supports sale snapshot only. */
export function preflightInvoiceSnapshot({sale,lines,buyer,supplier,request,environment}={}) {
  const base=assessInvoiceReadiness({sale,lines,buyer,supplier,request,environment});
  if(base.code!=='EINV_R13_UBL_SIGNING_NOT_IMPLEMENTED')return fail(base.code||'EINV_R13_INPUT_INVALID');
  if(!Array.isArray(lines)||lines.length>1000)return fail('EINV_R13_LINE_COUNT_INVALID');
  try {
    const subtotal=decimal(sale.subtotal,2,'EINV_R13_SUBTOTAL_INVALID');
    const total=decimal(sale.total,2,'EINV_R13_TOTAL_INVALID');
    const taxSales=decimal(sale.sales_tax,2,'EINV_R13_TAX_INVALID');
    const taxService=decimal(sale.service_tax,2,'EINV_R13_TAX_INVALID');
    const charge=decimal(sale.service_charge,2,'EINV_R13_CHARGE_INVALID');
    const sum=lines.reduce((n,line)=>{
      if(!String(line.product_name||'').trim()||String(line.product_name).length>300)throw new Error('EINV_R13_LINE_NAME_INVALID');
      const quantity=decimal(line.quantity,3,'EINV_R13_QUANTITY_INVALID');
      const unitPrice=decimal(line.unit_price,4,'EINV_R13_UNIT_PRICE_INVALID');
      if(quantity<=0n||unitPrice<0n)throw new Error('EINV_R13_LINE_AMOUNT_INVALID');
      const amount=decimal(line.line_total,2,'EINV_R13_LINE_TOTAL_INVALID');
      if(amount<0n)throw new Error('EINV_R13_LINE_TOTAL_INVALID');
      // Source POS may have per-line rounding. Do not infer or overwrite persisted amounts.
      return n+amount;
    },0n);
    if(sum!==subtotal)return fail('EINV_R13_LINE_SUBTOTAL_MISMATCH');
    if(taxSales>0n||taxService>0n)return fail('EINV_R13_TAX_CLASSIFICATION_SNAPSHOT_REQUIRED');
    if(charge>0n)return fail('EINV_R13_SERVICE_CHARGE_MAPPING_REQUIRED');
    if(total<0n)return fail('EINV_R13_TOTAL_INVALID');
    if(!['REGISTERED','NOT_REGISTERED'].includes(supplier.sstStatus))return fail('EINV_R13_SUPPLIER_SST_DECISION_REQUIRED');
    if(supplier.sstStatus==='REGISTERED'&&!String(supplier.sstNumber??'').trim())return fail('EINV_R13_SUPPLIER_SST_NUMBER_REQUIRED');
    if(!supplier.identificationType||!supplier.msicCode||!supplier.address1||!supplier.city||!supplier.state||!supplier.country||!supplier.phone)return fail('EINV_R13_SUPPLIER_UBL_FIELDS_REQUIRED');
    return Object.freeze({ok:true,code:'EINV_R13_SNAPSHOT_RECONCILED_SIGNING_PENDING',documentVersion:'1.1',lineCount:lines.length,canSubmit:false});
  }catch(error){return fail(/^EINV_R13_[A-Z_]+$/.test(error.message)?error.message:'EINV_R13_INVALID_SNAPSHOT');}
}
