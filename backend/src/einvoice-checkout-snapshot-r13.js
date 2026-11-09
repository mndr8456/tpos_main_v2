// EINV-R1.3 C4.1. Persist only facts known at POS checkout, alongside sale posting.
// Deliberately incomplete: never infer historical LHDN classification, allocation or UBL tax codes.
// No buyer information, OAuth secrets, signatures, API calls or invoice status changes.
import {createHash} from 'node:crypto';
export const EINV_C4_SUBMISSION_ENABLED = false;
const integer = x => /^(?:[1-9]\d*)$/.test(String(x ?? ''));
const money = x => {
 const m=/^(-?)(0|[1-9]\d{0,13})\.(\d{2})$/.exec(String(x ?? ''));
 if(!m)throw Error('EINV_C4_MONETARY_INVALID');
 return (m[1]==='-'?-1n:1n)*(BigInt(m[2])*100n+BigInt(m[3]));
};
const amt = x => {money(x);return String(x);};
const norm = x => x==null?null:String(x);
export function makeCheckoutEvidenceR13({sale,lines,rawLines,adjustment=null}={}) {
 if(!sale||!integer(sale.id)||!integer(sale.branch_id)||!String(sale.receipt_number||'').trim())throw Error('EINV_C4_SALE_IDENTITY_REQUIRED');
 if(!Array.isArray(lines)||!lines.length||!Array.isArray(rawLines)||!rawLines.length)throw Error('EINV_C4_LINES_REQUIRED');
 const units=new Map(rawLines.map(l=>[String(l.product_id),norm(l.unit_code)]));
 const ids=new Set();let lineSum=0n;
 const itemSnapshots=lines.map(l=>{
  if(!integer(l.id)||!integer(l.product_id)||String(l.sale_id)!==String(sale.id)||ids.has(String(l.id)))throw Error('EINV_C4_LINE_IDENTITY_INVALID');
  ids.add(String(l.id));const value=money(l.line_total);if(value<0n)throw Error('EINV_C4_LINE_TOTAL_INVALID');lineSum+=value;
  const unit=units.get(String(l.product_id));
  if(unit===undefined)throw Error('EINV_C4_DRAFT_LINE_MISMATCH');
  return {sale_line_id:String(l.id),product_id:String(l.product_id),product_name:norm(l.product_name),sku:norm(l.sku),quantity:norm(l.quantity),unit_price:norm(l.unit_price),line_total:amt(l.line_total),pos_unit_code:unit,
   einvoice_classification:null,ubl_unit_code:null,ubl_tax_category:null,line_tax_amount:null,discount_allocation:null,voucher_allocation:null};
 });
 const amounts={subtotal:amt(sale.subtotal),sales_tax:amt(sale.sales_tax),service_tax:amt(sale.service_tax),service_charge:amt(sale.service_charge),rounding_adjustment:amt(sale.rounding_adjustment),total:amt(sale.total)};
 const discount=money(adjustment?.discount_amount??'0.00'),voucher=money(adjustment?.voucher_amount??'0.00');
 if(discount<0n||voucher<0n||(discount>0n&&voucher>0n))throw Error('EINV_C4_REDUCTION_INVALID');
 const actual=money(amounts.subtotal)-discount-voucher+money(amounts.sales_tax)+money(amounts.service_tax)+money(amounts.service_charge)+money(amounts.rounding_adjustment);
 if(actual!==money(amounts.total))throw Error('EINV_C4_SALE_TOTAL_MISMATCH');
 const evidence={version:'C4.1',sale_id:String(sale.id),branch_id:String(sale.branch_id),receipt_number:String(sale.receipt_number),payment_method:norm(sale.payment_method),
  amounts:adjustment?{...amounts,discount:adjustment.discount_amount,voucher:adjustment.voucher_amount}:amounts,checkout_line_sum:(lineSum/100n).toString()+'.'+(lineSum%100n).toString().padStart(2,'0'),lines:itemSnapshots,
  authoritative_ubl_mapping_complete:false,
  missing_mapping:['EINVOICE_CLASSIFICATION','UBL_UNIT_CODE','UBL_TAX_CATEGORY','LINE_TAX_ALLOCATION','REDUCTION_ALLOCATION','SERVICE_CHARGE_MAPPING','ROUNDING_UBL_MAPPING','DIGITAL_SIGNATURE']};
 return Object.freeze(evidence);
}
/** Call after all pos_sale_lines INSERTs but BEFORE the parent sale COMMIT. */
export async function captureCheckoutSnapshotR13(conn,{saleId,rawLines,adjustment=null}) {
 // Backwards-compatible rollout: checkout remains operational before migration 047.
 // If migration has not been applied, NO e-Invoice readiness can be inferred.
 const [[installed]]=await conn.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='einvoice_checkout_snapshots'");
 if(Number(installed?.n)!==1)return {captured:false,reason:'MIGRATION_047_NOT_APPLIED'};
 const [[sale]]=await conn.execute('SELECT id,branch_id,receipt_number,payment_method,subtotal,sales_tax,service_tax,service_charge,rounding_adjustment,total FROM pos_sales WHERE id=?',[saleId]);
 const [lines]=await conn.execute('SELECT id,sale_id,product_id,product_name,sku,quantity,unit_price,line_total FROM pos_sale_lines WHERE sale_id=? ORDER BY id',[saleId]);
 const document=makeCheckoutEvidenceR13({sale,lines,rawLines,adjustment});
 const json=JSON.stringify(document);
 const digest=createHash('sha256').update(json,'utf8').digest('hex');
 await conn.execute("INSERT INTO einvoice_checkout_snapshots(sale_id,branch_id,snapshot_version,snapshot_status,snapshot_json,snapshot_sha256) VALUES(?,?,?,'INCOMPLETE',?,?)",[saleId,sale.branch_id,'C4.1',json,digest]);
 return {captured:true,status:'INCOMPLETE'};
}
