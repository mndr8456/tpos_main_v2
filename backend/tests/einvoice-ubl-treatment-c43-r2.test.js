import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {previewUblTreatmentC43R2,EINV_C43_R2_SUBMISSION_ENABLED,getUblTreatmentPreviewC43R2} from '../src/einvoice-ubl-treatment-c43-r2.js';
const values=[['17','3.50','0.92','0.15'],['273','1.60','0.42','0.07'],['473','8.00','2.09','0.35'],['493','6.00','1.57','0.27']];
const evidence={version:'C4.3-READONLY',status:'EVIDENCE_RECONCILED',saleId:'3',receiptNumber:'20261100320003',unverifiedMappingLines:0,
 totals:{gross:'19.10',netBeforeTax:'14.10',salesTax:'0.00',serviceTax:'0.84',serviceCharge:'0.00',rounding:'0.01',payable:'14.95'},reductions:{discount:'0.00',voucher:'5.00'},
 sourceEvidenceSha256:{checkout:'a'.repeat(64),tax:'b'.repeat(64),mapping:'c'.repeat(64)},
 lines:values.map(([p,g,v,t],i)=>({saleLineId:String(7+i),productId:p,gross:g,discount:'0.00',voucher:v,taxableBase:(Number(g)-Number(v)).toFixed(2),tax:t,taxType:'SERVICE_TAX',mappingConfirmed:true}))};
const testPreview=x=>previewUblTreatmentC43R2(x);
test('R2 historical DuitNow QR voucher 14.95 has exact line allowances 5.00 and no double-discount',()=>{
 const r=testPreview(evidence);assert.equal(r.status,'FINANCIAL_TREATMENT_RECONCILED');assert.equal(r.reconciliation.payable,'14.95');assert.equal(r.reconciliation.lineAllowances,'5.00');assert.equal(r.reductionLocation,'LINE_LEVEL_ONLY');
 const m=r.ublFinancialFragment.cac_LegalMonetaryTotal[0];assert.equal(m.cbc_LineExtensionAmount[0]._, '14.10');assert.equal(m.cbc_TaxInclusiveAmount[0]._, '14.94');assert.equal(m.cbc_PayableRoundingAmount[0]._, '0.01');assert.equal(m.cbc_PayableAmount[0]._, '14.95');assert.equal(m.cbc_AllowanceTotalAmount,undefined);
 assert.deepEqual(r.lineTreatments.map(x=>x.ublFinancialFragment.cac_AllowanceCharge[0].cbc_Amount[0]._),['0.92','0.42','2.09','1.57']);assert.equal(r.ublFinancialFragment.cac_TaxTotal[0].cac_TaxSubtotal[0].cac_TaxCategory[0].cbc_ID[0]._, '02');
 assert.equal(r.ublComplete,false);assert.equal(r.submissionEnabled,false);assert.equal(r.submissionReady,false);assert.equal(EINV_C43_R2_SUBMISSION_ENABLED,false);
});
test('R2 missing verified product mapping and corrupt hashes fail closed',()=>{
 assert.throws(()=>testPreview({...evidence,unverifiedMappingLines:1}),/OWNER_MAPPING_REQUIRED/);
 assert.throws(()=>testPreview({...evidence,sourceEvidenceSha256:{...evidence.sourceEvidenceSha256,tax:'x'}}),/SOURCE_HASH_REQUIRED/);
});
test('R2 service charge not guessed as Service Tax or incorrect UBL fee',()=>{
 assert.throws(()=>testPreview({...evidence,totals:{...evidence.totals,serviceCharge:'0.50',payable:'15.45'}}),/SERVICE_CHARGE_TREATMENT_UNRESOLVED/);
});
test('R2 stale totals, duplicate line IDs, negative values are refused',()=>{
 assert.throws(()=>testPreview({...evidence,totals:{...evidence.totals,payable:'14.90'}}),/PAYABLE_MISMATCH/);
 assert.throws(()=>testPreview({...evidence,lines:[evidence.lines[0],evidence.lines[0],...evidence.lines.slice(2)]}),/LINE_IDENTITY/);
 assert.throws(()=>testPreview({...evidence,lines:evidence.lines.map((x,i)=>i?x:{...x,voucher:'1.00'})}),/LINE_AMOUNT_OR_TAX/);
 assert.throws(()=>testPreview({...evidence,lines:evidence.lines.map((x,i)=>i?x:{...x,tax:'-0.15'})}),/LINE_AMOUNT_OR_TAX/);
});
test('R2 discount is line-level allowance and not invoice-level, positive tax',()=>{
 const r=testPreview({...evidence,reductions:{discount:'5.00',voucher:'0.00'},lines:evidence.lines.map(x=>({...x,discount:x.voucher,voucher:'0.00'}))});
 assert.equal(r.lineTreatments[0].ublFinancialFragment.cac_AllowanceCharge[0].cbc_AllowanceChargeReason[0]._,'POS Discount');
 assert.equal(r.reconciliation.payable,'14.95');
});
test('R2 route read-only with permission, never signing or submitting',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');assert.match(app,/app\.get\('\/api\/v2\/einvoice\/ubl-treatment-preview\/:saleId',authenticate,permitted\('einvoice_settings\.view'\),getUblTreatmentPreviewC43R2\)/);
 const source=readFileSync(new URL('../src/einvoice-ubl-treatment-c43-r2.js',import.meta.url),'utf8');assert.doesNotMatch(source,/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s+(?:INTO|TABLE|FROM)/i);assert.doesNotMatch(source,/fetch\(|https?:\/\//i);
 assert.equal(typeof getUblTreatmentPreviewC43R2,'function');
});
