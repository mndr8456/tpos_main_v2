// EINV-R1.3 C3: read-only, non-sensitive assessment of immutable POS snapshot gaps.
// A caller-provided source label is NOT proof of an authoritative checkout snapshot.
// No SQL, crypto key access, document signing, or MyInvois submission.
export const EINV_R13_C3_SUBMISSION_ENABLED = false;
const money = value => {
  const m = /^(-?)(0|[1-9]\d{0,13})\.(\d{2})$/.exec(String(value ?? ''));
  if (!m) return null;
  return (m[1] === '-' ? -1n : 1n) * (BigInt(m[2]) * 100n + BigInt(m[3]));
};
const integerId = value => /^(?:[1-9]\d*)$/.test(String(value ?? ''));
const amount = (value,missing) => {
  const n=money(value);
  if(n===null) missing.add('INVALID_MONETARY_SNAPSHOT');
  return n;
};
const has = (obj,key) => Object.prototype.hasOwnProperty.call(obj || {},key);
/**
 * Evidence must originate from a separately verified immutable checkout writer.
 * Do not trust flags or source labels provided to this function as evidence.
 * Until that writer, DB constraint, and readback exist, canBuildSignedInvoice is false.
 */
export function inspectInvoiceSnapshotGapsR13({sale,lines,request,environment}={}) {
  const gaps = new Set();
  if(environment!=='SANDBOX') gaps.add('SANDBOX_ONLY');
  if(!sale || sale.status!=='PAID' || !integerId(sale.id) || !String(sale.receipt_number || '').trim()) gaps.add('PAID_SALE_REQUIRED');
  if(!request || request.status!=='REQUESTED' || request.environment!=='SANDBOX' || !sale || String(request.sale_id)!==String(sale.id)) gaps.add('BUYER_REQUEST_REQUIRED');
  if(!Array.isArray(lines) || !lines.length || lines.length>1000) gaps.add('SALE_LINES_REQUIRED');
  const validLines=Array.isArray(lines) ? lines : [];
  const ids=new Set();
  let sum=0n, sumKnown=true;
  for(const line of validLines){
    if(!line || !integerId(line.id) || ids.has(String(line.id)) || !sale || String(line.sale_id)!==String(sale.id)) gaps.add('SALE_LINE_IDENTITY_INVALID');
    if(line && integerId(line.id)) ids.add(String(line.id));
    if(!line || !String(line.product_name||'').trim()) gaps.add('PRODUCT_NAME_SNAPSHOT_REQUIRED');
    const n=money(line?.line_total);
    if(n===null || n<0n){gaps.add('INVALID_LINE_TOTAL');sumKnown=false;} else sum+=n;
    if(!/^\d+\.\d{3}$/.test(String(line?.quantity??'')) || !/^\d+\.\d{4}$/.test(String(line?.unit_price??'')))gaps.add('LINE_PRICE_QUANTITY_SNAPSHOT_REQUIRED');
    // POS's present line schema does not persist these at immutable checkout time.
    // Merely attaching a matching classification or a source string later is insufficient.
    if(!line || !has(line,'einvoice_classification_at_sale') || !has(line,'einvoice_unit_code_at_sale'))gaps.add('IMMUTABLE_LINE_CLASSIFICATION_REQUIRED');
    if(!line || !has(line,'einvoice_tax_type_at_sale') || !has(line,'einvoice_tax_amount_at_sale'))gaps.add('IMMUTABLE_LINE_TAX_SNAPSHOT_REQUIRED');
  }
  const subtotal=amount(sale?.subtotal,gaps), total=amount(sale?.total,gaps);
  const salesTax=amount(sale?.sales_tax,gaps),serviceTax=amount(sale?.service_tax,gaps),serviceCharge=amount(sale?.service_charge,gaps),rounding=amount(sale?.rounding_adjustment,gaps);
  const discount=amount(sale?.discount_amount??'0.00',gaps),voucher=amount(sale?.voucher_amount??'0.00',gaps);
  if(subtotal!==null && sumKnown && sum!==subtotal) gaps.add('LINE_SUBTOTAL_MISMATCH');
  if([subtotal,total,salesTax,serviceTax,serviceCharge,rounding].every(v=>v!==null) && subtotal+salesTax+serviceTax+serviceCharge+rounding!==total)gaps.add('SALE_TOTAL_MISMATCH');
  if(discount!==null && discount!==0n || voucher!==null && voucher!==0n)gaps.add('DISCOUNT_VOUCHER_ALLOCATION_SNAPSHOT_REQUIRED');
  if(salesTax!==null && salesTax!==0n || serviceTax!==null && serviceTax!==0n)gaps.add('TAX_BREAKDOWN_SNAPSHOT_REQUIRED');
  if(serviceCharge!==null && serviceCharge!==0n)gaps.add('SERVICE_CHARGE_ALLOCATION_SNAPSHOT_REQUIRED');
  if(rounding!==null && rounding!==0n)gaps.add('ROUNDING_COMPONENT_MAPPING_REQUIRED');
  // No established checkout-time snapshot writer + DB evidence verification in C3.
  gaps.add('AUTHORITATIVE_SNAPSHOT_PERSISTENCE_NOT_IMPLEMENTED');
  gaps.add('SIGNED_UBL_NOT_IMPLEMENTED');
  return Object.freeze({ok:gaps.size===0,code:'EINV_R13_C3_READ_ONLY_GAP_REPORT',gaps:Object.freeze([...gaps].sort()),lineCount:validLines.length,canBuildSignedInvoice:false,canSubmit:false});
}
