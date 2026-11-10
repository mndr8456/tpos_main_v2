// C4.3 R2: deterministic, read-only UBL financial treatment preview.
// This is NOT a complete Invoice document, SDK validation, signing or submission.
import {loadReductionDocumentEvidenceC43} from './einvoice-reduction-document-c43.js';
const error=(code,status=409)=>Object.assign(new Error(`EINV_C43_R2_${code}`),{status});
const cents=value=>{const match=/^(-?)(0|[1-9]\d{0,13})\.(\d{2})$/.exec(String(value??''));if(!match)throw error('INVALID_MONEY');return (match[1]==='-'?-1n:1n)*(BigInt(match[2])*100n+BigInt(match[3]));};
const format=v=>`${v<0n?'-':''}${(v<0n?-v:v)/100n}.${String((v<0n?-v:v)%100n).padStart(2,'0')}`;
const amount=value=>[{_ :format(value),currencyID:'MYR'}];
const taxCodes={SALES_TAX:'01',SERVICE_TAX:'02',NONE:'06'};
export const EINV_C43_R2_SUBMISSION_ENABLED=false;
export function previewUblTreatmentC43R2(evidence){
 if(evidence?.version!=='C4.3-READONLY'||evidence.status!=='EVIDENCE_RECONCILED'||!Array.isArray(evidence.lines)||!evidence.lines.length)throw error('RECONCILED_EVIDENCE_REQUIRED');
 if(!evidence.sourceEvidenceSha256||!['checkout','tax','mapping'].every(k=>/^[a-f0-9]{64}$/.test(String(evidence.sourceEvidenceSha256[k]??''))))throw error('SOURCE_HASH_REQUIRED');
 if(evidence.unverifiedMappingLines!==0||evidence.lines.some(l=>l.mappingConfirmed!==true))throw error('OWNER_MAPPING_REQUIRED');
 const totals=evidence.totals, reductions=evidence.reductions;
 const gross=cents(totals.gross),discount=cents(reductions.discount),voucher=cents(reductions.voucher);
 const net=cents(totals.netBeforeTax),salesTax=cents(totals.salesTax),serviceTax=cents(totals.serviceTax),serviceCharge=cents(totals.serviceCharge),rounding=cents(totals.rounding),payable=cents(totals.payable);
 if([gross,discount,voucher,net,salesTax,serviceTax,serviceCharge,payable].some(x=>x<0n)||discount>0n&&voucher>0n||gross-discount-voucher!==net)throw error('TOTALS_INVALID');
 // A non-zero POS Service Charge may have different pre/post-tax treatment. Do not guess.
 if(serviceCharge!==0n)throw error('SERVICE_CHARGE_TREATMENT_UNRESOLVED');
 const seen=new Set(),subtotals=new Map();let sumGross=0n,sumNet=0n,sumDiscount=0n,sumVoucher=0n,sumSales=0n,sumService=0n;
 const lineTreatments=evidence.lines.map(line=>{
  const lineId=String(line.saleLineId??'');
  if(!/^[1-9]\d*$/.test(lineId)||seen.has(lineId))throw error('LINE_IDENTITY');
  seen.add(lineId);
  const g=cents(line.gross),d=cents(line.discount),v=cents(line.voucher),base=cents(line.taxableBase),tax=cents(line.tax);
  const taxType=String(line.taxType??'');
  if(!Object.hasOwn(taxCodes,taxType)||[g,d,v,base,tax].some(x=>x<0n)||g-d-v!==base||d>0n&&v>0n||taxType==='NONE'&&tax!==0n)throw error('LINE_AMOUNT_OR_TAX');
  const code=taxCodes[taxType];
  sumGross+=g;sumDiscount+=d;sumVoucher+=v;sumNet+=base;
  if(taxType==='SALES_TAX')sumSales+=tax;
  if(taxType==='SERVICE_TAX')sumService+=tax;
  const group=subtotals.get(code)||{base:0n,tax:0n};group.base+=base;group.tax+=tax;subtotals.set(code,group);
  const allowances=[];
  if(d>0n)allowances.push({cbc_ChargeIndicator:[{_ :false}],cbc_AllowanceChargeReason:[{_:'POS Discount'}],cbc_Amount:amount(d)});
  if(v>0n)allowances.push({cbc_ChargeIndicator:[{_ :false}],cbc_AllowanceChargeReason:[{_:'POS Voucher'}],cbc_Amount:amount(v)});
  return {saleLineId:lineId,productId:String(line.productId),gross:format(g),net:format(base),taxTypeCode:code,
   // Financial UBL fragment only; quantity, price, classification and buyer data are not invented.
   ublFinancialFragment:{cbc_LineExtensionAmount:amount(base),...(allowances.length?{cac_AllowanceCharge:allowances}:{}),cac_TaxTotal:[{cbc_TaxAmount:amount(tax)}]}};
 });
 if(sumGross!==gross||sumDiscount!==discount||sumVoucher!==voucher||sumNet!==net||sumSales!==salesTax||sumService!==serviceTax)throw error('LINE_SUM_MISMATCH');
 if(net+salesTax+serviceTax+rounding!==payable)throw error('PAYABLE_MISMATCH');
 const taxSubtotals=[...subtotals.entries()].filter(([code,g])=>g.tax>0n||g.base>0n&&code!=='06').map(([code,g])=>({cbc_TaxableAmount:amount(g.base),cbc_TaxAmount:amount(g.tax),cac_TaxCategory:[{cbc_ID:[{_ :code}],cac_TaxScheme:[{cbc_ID:[{_:'OTH',schemeID:'UN/ECE 5153',schemeAgencyID:'6'}]}]}]}));
 const taxTotal=salesTax+serviceTax;
 return {version:'C4.3-R2-FINANCIAL-PREVIEW',status:'FINANCIAL_TREATMENT_RECONCILED',saleId:evidence.saleId,receiptNumber:evidence.receiptNumber,
  currency:'MYR',reductionLocation:'LINE_LEVEL_ONLY',lineCount:lineTreatments.length,lineTreatments,
  ublFinancialFragment:{cac_TaxTotal:[{cbc_TaxAmount:amount(taxTotal),cac_TaxSubtotal:taxSubtotals}],cac_LegalMonetaryTotal:[{
   cbc_LineExtensionAmount:amount(net),cbc_TaxExclusiveAmount:amount(net),cbc_TaxInclusiveAmount:amount(net+taxTotal),
   ...(rounding!==0n?{cbc_PayableRoundingAmount:amount(rounding)}:{}),cbc_PayableAmount:amount(payable)}]},
  reconciliation:{gross:format(gross),lineAllowances:format(discount+voucher),lineNet:format(net),salesTax:format(salesTax),serviceTax:format(serviceTax),rounding:format(rounding),payable:format(payable),serviceCharge:format(serviceCharge)},
  sourceEvidenceSha256:{...evidence.sourceEvidenceSha256},
  note:'Financial fragments only; not a complete, SDK-validated or legally approved UBL Invoice.',
  ublComplete:false,ublSchemaValidated:false,serviceChargeTreatmentApproved:false,submissionReady:false,submissionEnabled:false};
}
export async function getUblTreatmentPreviewC43R2(req,res){
 if(!['OWNER','ADMIN'].includes(req.auth?.user?.role_code))throw error('OWNER_ADMIN_REQUIRED',403);
 const evidence=await loadReductionDocumentEvidenceC43(req);
 return res.set('Cache-Control','no-store').json(previewUblTreatmentC43R2(evidence));
}
