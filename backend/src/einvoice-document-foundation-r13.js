// EINV-R1.3 Phase B: non-mutating readiness checks only. No UBL builder, signing or API calls.
import {buyerRequestSchema} from './einvoice-buyer-r12.js';

const money = (value, field) => {
  const raw = String(value ?? '');
  if (!/^-?(?:0|[1-9]\d{0,15})\.\d{2}$/.test(raw)) throw new Error(`EINV_R13_INVALID_${field}`);
  const negative = raw.startsWith('-');
  const [units, cents] = (negative ? raw.slice(1) : raw).split('.');
  return (negative ? -1n : 1n) * (BigInt(units) * 100n + BigInt(cents));
};
const missing=(code)=>({ready:false,code});
export const R13_DOCUMENT_VERSION='1.1';
export const R13_SUBMISSION_ENABLED=false;

// Exposes only a safe decision, no buyer values, token, secrets or decrypted payloads.
export function assessInvoiceReadiness({sale,lines,buyer,supplier,request,environment}={}) {
  if (environment!=='SANDBOX') return missing('EINV_R13_SANDBOX_ONLY');
  if (!sale || sale.status!=='PAID' || !String(sale.receipt_number||'').trim()) return missing('EINV_R13_PAID_RECEIPT_REQUIRED');
  if (!request || request.status!=='REQUESTED' || request.environment!==environment || String(request.sale_id)!==String(sale.id)) return missing('EINV_R13_BUYER_REQUEST_MISMATCH');
  if (!buyerRequestSchema.safeParse(buyer).success) return missing('EINV_R13_BUYER_INVALID');
  if (!supplier || !String(supplier.tin||'').trim() || !String(supplier.registrationNumber||'').trim() || !String(supplier.name||'').trim()) return missing('EINV_R13_SUPPLIER_INCOMPLETE');
  if (!Array.isArray(lines) || lines.length===0 || lines.some(line=>String(line.sale_id)!==String(sale.id)||!String(line.product_name||'').trim()||Number(line.quantity)<=0)) return missing('EINV_R13_LINES_INVALID');
  try {
    const subtotal=money(sale.subtotal,'SUBTOTAL');
    const tax=money(sale.sales_tax,'SALES_TAX')+money(sale.service_tax,'SERVICE_TAX');
    const charge=money(sale.service_charge,'SERVICE_CHARGE');
    const rounding=money(sale.rounding_adjustment,'ROUNDING');
    const total=money(sale.total,'TOTAL');
    if (subtotal<0n || total<0n || tax<0n || charge<0n || subtotal+tax+charge+rounding!==total) return missing('EINV_R13_TOTAL_RECONCILIATION_REQUIRED');
    for (const line of lines) if(money(line.line_total,'LINE_TOTAL')<0n) return missing('EINV_R13_LINES_INVALID');
  } catch {return missing('EINV_R13_MONETARY_PRECISION_INVALID');}
  // Discounts/vouchers, service charge, tax classifications and XML/JSON signature
  // must be reconciled with canonical persisted sale components before READY.
  return missing('EINV_R13_UBL_SIGNING_NOT_IMPLEMENTED');
}
