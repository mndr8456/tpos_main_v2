// C4.3: read-only, sale-bound document evidence reconciliation for real PAID reductions.
// No mutations, backfill, implied bank settlement, UBL generation, or MyInvois submission.
const fail=code=>Object.assign(new Error(`EINV_C43_${code}`),{status:409});
const id=v=>/^[1-9]\d{0,19}$/.test(String(v??''));
const money=v=>{const m=/^(-?)(0|[1-9]\d{0,13})\.(\d{2})$/.exec(String(v??''));if(!m)throw fail('INVALID_MONEY');return (m[1]==='-'?-1n:1n)*(BigInt(m[2])*100n+BigInt(m[3]));};
const fmt=v=>`${v<0n?'-':''}${(v<0n?-v:v)/100n}.${String((v<0n?-v:v)%100n).padStart(2,'0')}`;
const parse=v=>{try{return typeof v==='string'?JSON.parse(v):v;}catch{throw fail('INVALID_EVIDENCE');}};
const sha=v=>/^[a-f0-9]{64}$/.test(String(v??''));
export const EINV_C43_SUBMISSION_ENABLED=false;
export function reconcileReductionDocumentEvidenceC43({sale,reduction,checkout,tax,mapping,sourceHashes}={}){
 if(!sale||!id(sale.id)||!id(sale.branch_id)||String(sale.status)!=='PAID'||!reduction)throw fail('PAID_REDUCTION_REQUIRED');
 if(String(reduction.sale_id)!==String(sale.id)||String(reduction.branch_id)!==String(sale.branch_id))throw fail('REDUCTION_SALE_MISMATCH');
 const discount=money(reduction.discount_amount),voucher=money(reduction.voucher_amount);
 if(discount<0n||voucher<0n||Boolean(discount)===Boolean(voucher))throw fail('REDUCTION_INVALID');
 if(voucher&&!id(reduction.voucher_reservation_id))throw fail('VOUCHER_RESERVATION_MISSING');
 if(!checkout||!tax||!mapping||!sourceHashes||Object.values(sourceHashes).length!==3||!Object.values(sourceHashes).every(sha))throw fail('EVIDENCE_MISSING');
 if(checkout.version!=='C4.1'||tax.version!=='C4.2A'||mapping.version!=='C4.2B')throw fail('EVIDENCE_VERSION');
 for(const doc of [checkout,tax,mapping])if(String(doc.sale_id)!==String(sale.id)||String(doc.branch_id)!==String(sale.branch_id))throw fail('EVIDENCE_SALE_MISMATCH');
 if(!Array.isArray(checkout.lines)||!checkout.lines.length||!Array.isArray(tax.lines)||!Array.isArray(mapping.lines))throw fail('LINES_MISSING');
 const a=new Map(),b=new Map(),c=new Map();
 for(const [rows,target] of [[checkout.lines,a],[tax.lines,b],[mapping.lines,c]])for(const line of rows){
  const key=String(line.sale_line_id);
  if(!id(key)||target.has(key)||!id(line.product_id))throw fail('LINE_DUPLICATE_OR_INVALID');
  target.set(key,line);
 }
 if(a.size!==b.size||a.size!==c.size)throw fail('LINE_COUNT_MISMATCH');
 const amounts=checkout.amounts||{};
 if(money(amounts.subtotal)!==money(sale.subtotal)||money(amounts.total)!==money(sale.total)||money(amounts.sales_tax)!==money(sale.sales_tax)||money(amounts.service_tax)!==money(sale.service_tax)||money(amounts.service_charge)!==money(sale.service_charge)||money(amounts.rounding_adjustment)!==money(sale.rounding_adjustment))throw fail('CHECKOUT_AMOUNT_MISMATCH');
 if(money(amounts.discount??'0.00')!==discount||money(amounts.voucher??'0.00')!==voucher)throw fail('REDUCTION_CHECKOUT_MISMATCH');
 let gross=0n,allocatedDiscount=0n,allocatedVoucher=0n,salesTax=0n,serviceTax=0n;
 const lines=[];let unverified=0;
 for(const [lineId,raw] of a){
  const t=b.get(lineId),m=c.get(lineId);
  if(!t||!m||String(raw.product_id)!==String(t.product_id)||String(raw.product_id)!==String(m.product_id))throw fail('LINE_IDENTITY_MISMATCH');
  const lineGross=money(raw.line_total),d=money(t.discount_amount),v=money(t.voucher_amount),base=money(t.taxable_base),lineTax=money(t.tax_amount);
  if(lineGross<0n||d<0n||v<0n||base<0n||lineTax<0n||lineGross-d-v!==base||d>0n&&voucher>0n||v>0n&&discount>0n)throw fail('LINE_ALLOCATION_INVALID');
  gross+=lineGross;allocatedDiscount+=d;allocatedVoucher+=v;
  if(t.effective_jkdm_tax_type==='SALES_TAX')salesTax+=lineTax;
  else if(t.effective_jkdm_tax_type==='SERVICE_TAX')serviceTax+=lineTax;
  else if(t.effective_jkdm_tax_type!=='NONE'||lineTax!==0n)throw fail('LINE_TAX_TYPE_INVALID');
  if(m.mapping_confirmed===true){
   const expected={SERVICE_TAX:'02',SALES_TAX:'01',NONE:'06'}[t.effective_jkdm_tax_type];
   if(String(m.source_tax_type)!==String(t.effective_jkdm_tax_type)||String(m.lhdn_tax_type_code)!==expected)throw fail('MAPPING_TAX_CONFLICT');
  }else unverified++;
  lines.push({saleLineId:lineId,productId:String(raw.product_id),gross:fmt(lineGross),discount:fmt(d),voucher:fmt(v),taxableBase:fmt(base),tax:fmt(lineTax),taxType:t.effective_jkdm_tax_type,mappingConfirmed:m.mapping_confirmed===true});
 }
 if(gross!==money(sale.subtotal)||gross!==money(checkout.checkout_line_sum)||allocatedDiscount!==discount||allocatedVoucher!==voucher)throw fail('REDUCTION_ALLOCATION_MISMATCH');
 if(salesTax!==money(sale.sales_tax)||serviceTax!==money(sale.service_tax)||money(tax.totals?.payable)!==money(sale.total))throw fail('TAX_RECONCILIATION_MISMATCH');
 if(gross-discount-voucher+salesTax+serviceTax+money(sale.service_charge)+money(sale.rounding_adjustment)!==money(sale.total))throw fail('PAYABLE_RECONCILIATION_MISMATCH');
 return {version:'C4.3-READONLY',status:'EVIDENCE_RECONCILED',saleId:String(sale.id),receiptNumber:String(sale.receipt_number),paymentMethod:String(sale.payment_method),
  reductions:{discount:fmt(discount),voucher:fmt(voucher),source:discount?'DISCOUNT':'VOUCHER',voucherReservationLinked:!voucher||id(reduction.voucher_reservation_id)},
  totals:{gross:fmt(gross),netBeforeTax:fmt(gross-discount-voucher),salesTax:fmt(salesTax),serviceTax:fmt(serviceTax),serviceCharge:fmt(money(sale.service_charge)),rounding:fmt(money(sale.rounding_adjustment)),payable:fmt(money(sale.total))},
  lineCount:lines.length,unverifiedMappingLines:unverified,lines,sourceEvidenceSha256:sourceHashes,
  // This is only a reconciliation; settlement at the bank and UBL legal treatment are independent.
  bankSettlementIndependentlyVerified:false,ublAllowanceTreatmentApproved:false,ublServiceChargeTreatmentApproved:false,ublRoundingTreatmentApproved:false,
  submissionReady:false,submissionEnabled:false};
}
export async function loadReductionDocumentEvidenceC43(req){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code))throw Object.assign(new Error('EINV_C43_OWNER_ADMIN_REQUIRED'),{status:403});
 const saleId=String(req.params.saleId);
 if(!id(saleId))throw Object.assign(new Error('EINV_C43_INVALID_SALE_ID'),{status:400});
 const conn=await req.auth.pool.getConnection();
 try{
  const names=['einvoice_checkout_snapshots','einvoice_line_tax_evidence_c42','einvoice_line_mapping_evidence_c42b','pos_sale_reductions'];
  const [found]=await conn.execute(`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (${names.map(()=>'?').join(',')})`,names);
  if(new Set(found.map(x=>x.name)).size!==4)throw fail('SCHEMA_MISSING');
  const [[sale]]=await conn.execute('SELECT id,branch_id,status,receipt_number,payment_method,subtotal,sales_tax,service_tax,service_charge,rounding_adjustment,total FROM pos_sales WHERE id=?',[saleId]);
  if(!sale)throw Object.assign(new Error('EINV_C43_SALE_NOT_FOUND'),{status:404});
  const [[reduction]]=await conn.execute('SELECT sale_id,branch_id,discount_id,voucher_id,voucher_reservation_id,discount_amount,voucher_amount FROM pos_sale_reductions WHERE sale_id=?',[saleId]);
  const [[a]]=await conn.execute('SELECT branch_id,snapshot_json AS document,snapshot_sha256 AS hash FROM einvoice_checkout_snapshots WHERE sale_id=?',[saleId]);
  const [[b]]=await conn.execute('SELECT branch_id,evidence_json AS document,evidence_sha256 AS hash FROM einvoice_line_tax_evidence_c42 WHERE sale_id=?',[saleId]);
  const [[c]]=await conn.execute('SELECT branch_id,evidence_json AS document,evidence_sha256 AS hash FROM einvoice_line_mapping_evidence_c42b WHERE sale_id=?',[saleId]);
  if(!a||!b||!c||[a,b,c].some(x=>String(x.branch_id)!==String(sale.branch_id)))throw fail('EVIDENCE_MISSING');
  const result=reconcileReductionDocumentEvidenceC43({sale,reduction,checkout:parse(a.document),tax:parse(b.document),mapping:parse(c.document),sourceHashes:{checkout:a.hash,tax:b.hash,mapping:c.hash}});
  return result;
 }finally{conn.release();}
}

export async function getReductionDocumentEvidenceC43(req,res){
 const result=await loadReductionDocumentEvidenceC43(req);
 return res.set('Cache-Control','no-store').json(result);
}
