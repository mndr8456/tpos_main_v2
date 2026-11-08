// EINV-R1.3 Phase C2: deterministic, UNSIGNED, offline-only UBL 2.1 JSON draft.
// Not a complete MyInvois document. Never use for Submit Documents API.
// Requires an authoritative e-Invoice classification snapshot per sale line.
import {preflightInvoiceSnapshot} from './einvoice-document-preflight-r13.js';
export const EINV_R13_C2_SUBMISSION_ENABLED=false;
const fail=code=>Object.freeze({ok:false,code,canSubmit:false});
const text=(v,max=300)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max?v.trim():null;
const cents=(v,decimals=2)=>{
 const s=String(v??'');
 if(!new RegExp(`^(0|[1-9]\\d{0,14})\\.\\d{${decimals}}$`).test(s))throw new Error('EINV_R13_C2_AMOUNT_INVALID');
 return BigInt(s.replace('.',''));
};
const currency=v=>[{_ : v,currencyID:'MYR'}];
const field=v=>[{_:v}];
const address=p=>({
 AddressLine:[p.address1,p.address2,p.address3].filter(v=>typeof v==='string'&&v.trim()).map(v=>({Line:field(v.trim())})),
 CityName:field(p.city),
 ...(p.postcode?{PostalZone:field(p.postcode)}:{}),
 CountrySubentityCode:field(p.state),
 Country:[{IdentificationCode:[{_:p.country,listID:'ISO3166-1',listAgencyID:'6'}]}]
});
const party=(p,identity)=>({
 PartyIdentification:[{ID:[{_:p.tin,schemeID:'TIN'}]},{ID:[{_:p.identificationNumber||p.registrationNumber,schemeID:identity}]},...(p.sstNumber?[{ID:[{_:p.sstNumber,schemeID:'SST'}]}]:[])],
 PostalAddress:[address(p)],
 PartyLegalEntity:[{RegistrationName:field(p.buyerName||p.name)}],
 Contact:[{Telephone:field(p.phone),...(p.email?{ElectronicMail:field(p.email)}:{})}]
});
/**
 * Draft shape is UBL-inspired and intentionally incomplete: digital signature,
 * authoritative tax treatment, allowances, discounts and service fees are not implemented.
 * A valid object here is NEVER a signed or submission-ready Invoice.
 */
export function buildUnsignedInvoiceDraftR13({sale,lines,buyer,supplier,request,environment,lineClassifications,issueDate,issueTime}={}) {
 const preflight=preflightInvoiceSnapshot({sale,lines,buyer,supplier,request,environment});
 if(!preflight.ok)return fail(preflight.code);
 try {
  if(!Array.isArray(lineClassifications)||lineClassifications.length!==lines.length)return fail('EINV_R13_C2_CLASSIFICATIONS_REQUIRED');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(issueDate||'')||!/^\d{2}:\d{2}:\d{2}Z$/.test(issueTime||''))return fail('EINV_R13_C2_ISSUE_TIMESTAMP_REQUIRED');
  if(!Number.isFinite(Date.parse(`${issueDate}T${issueTime}`)))return fail('EINV_R13_C2_ISSUE_TIMESTAMP_INVALID');
  if(!text(sale.receipt_number,100)||!text(supplier.msicCode,5)||!/^\d{5}$/.test(supplier.msicCode))return fail('EINV_R13_C2_SUPPLIER_METADATA_INVALID');
  if(!text(supplier.phone,20)||!text(buyer.phone,20)||!text(supplier.state,50)||!text(buyer.state,50)||!text(supplier.country,3)||!text(buyer.country,3))return fail('EINV_R13_C2_PARTY_INVALID');
  if(!text(supplier.address1,150)||!text(buyer.address1,150)||!text(supplier.city,50)||!text(buyer.city,50))return fail('EINV_R13_C2_PARTY_INVALID');
  if(!['BRN','NRIC','PASSPORT','ARMY'].includes(supplier.identificationType))return fail('EINV_R13_C2_SUPPLIER_ID_INVALID');
  const discount=cents(sale.discount_amount??'0.00');
  const voucher=cents(sale.voucher_amount??'0.00');
  const round=String(sale.rounding_adjustment);
  if(discount!==0n||voucher!==0n)return fail('EINV_R13_C2_ALLOWANCE_ALLOCATION_REQUIRED');
  if(!/^0\.00$/.test(round))return fail('EINV_R13_C2_ROUNDING_MAPPING_REQUIRED');
  const amount=cents(sale.subtotal);
  const total=cents(sale.total);
  if(amount!==total)return fail('EINV_R13_C2_TOTAL_MISMATCH');
  const seen=new Set();
  const invoiceLines=lines.map((line,i)=>{
   const meta=lineClassifications[i];
   if(!meta||String(meta.saleLineId)!==String(line.id)||!text(meta.classificationCode,3)||!/^\d{3}$/.test(meta.classificationCode)||!text(meta.unitCode,3))throw new Error('EINV_R13_C2_CLASSIFICATIONS_INVALID');
   if(seen.has(String(line.id)))throw new Error('EINV_R13_C2_DUPLICATE_LINE');
   seen.add(String(line.id));
   // e-Invoice classification and UOM must come from persisted authoritative snapshots.
   if(meta.source!=='AUTHORITATIVE_SALE_SNAPSHOT')throw new Error('EINV_R13_C2_CLASSIFICATIONS_NOT_AUTHORITATIVE');
   cents(line.line_total);cents(line.quantity,3);cents(line.unit_price,4);
   return {
    ID:field(String(line.id)),InvoicedQuantity:[{_:line.quantity,unitCode:meta.unitCode}],
    LineExtensionAmount:currency(line.line_total),
    Item:[{Description:field(line.product_name),CommodityClassification:[{ItemClassificationCode:[{_:meta.classificationCode,listID:'CLASS'}]}]}],
    Price:[{PriceAmount:currency(line.unit_price)}]
   };
  });
  // Only an unsigned, zero-tax / zero-fee / zero-discount draft is supported.
  const invoice={
   ID:field(sale.receipt_number),IssueDate:field(issueDate),IssueTime:field(issueTime),
   InvoiceTypeCode:[{_:'01',listVersionID:'1.1'}],DocumentCurrencyCode:field('MYR'),TaxCurrencyCode:field('MYR'),
   AccountingSupplierParty:[{Party:[{
    ...party(supplier,supplier.identificationType),
    IndustryClassificationCode:[{_:supplier.msicCode,name:supplier.businessActivityDescription||''}]
   }]}],
   AccountingCustomerParty:[{Party:[party(buyer,buyer.identificationType)]}],
   LegalMonetaryTotal:[{LineExtensionAmount:currency(sale.subtotal),TaxExclusiveAmount:currency(sale.subtotal),TaxInclusiveAmount:currency(sale.total),PayableAmount:currency(sale.total)}],
   InvoiceLine:invoiceLines
  };
  // The draft intentionally has no Signature, TaxTotal or validated tax breakdown.
  return Object.freeze({ok:true,code:'EINV_R13_C2_UNSIGNED_DRAFT_ONLY',version:'1.1',document:{_DRAFT_ONLY:true,Invoice:[invoice]},canSubmit:false});
 }catch(error){return fail(/^EINV_R13_C2_[A-Z_]+$/.test(error.message)?error.message:'EINV_R13_C2_DRAFT_INVALID');}
}
