import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reconcileReductionDocumentEvidenceC43,getReductionDocumentEvidenceC43,EINV_C43_SUBMISSION_ENABLED} from '../src/einvoice-reduction-document-c43.js';
const sale={id:3,branch_id:1,status:'PAID',receipt_number:'20261100320003',payment_method:'DUITNOW_QR',subtotal:'19.10',sales_tax:'0.00',service_tax:'0.84',service_charge:'0.00',rounding_adjustment:'0.01',total:'14.95'};
const reduction={sale_id:3,branch_id:1,discount_amount:'0.00',voucher_amount:'5.00',voucher_reservation_id:8};
const values=[['17','3.50','0.92','0.15'],['273','1.60','0.42','0.07'],['473','8.00','2.09','0.35'],['493','6.00','1.57','0.27']];
const checkout={version:'C4.1',sale_id:'3',branch_id:'1',checkout_line_sum:'19.10',amounts:{subtotal:'19.10',discount:'0.00',voucher:'5.00',sales_tax:'0.00',service_tax:'0.84',service_charge:'0.00',rounding_adjustment:'0.01',total:'14.95'},lines:values.map(([product,gross],i)=>({sale_line_id:String(i+30),product_id:product,line_total:gross}))};
// The 4 line allocations must sum to RM5 and line-tax to RM0.84.
const tax={version:'C4.2A',sale_id:'3',branch_id:'1',totals:{payable:'14.95'},lines:values.map(([product,gross,discount,taxAmount],i)=>({sale_line_id:String(i+30),product_id:product,discount_amount:'0.00',voucher_amount:discount,taxable_base:(Number(gross)-Number(discount)).toFixed(2),tax_amount:taxAmount,effective_jkdm_tax_type:'SERVICE_TAX'}))};
// Adjust actual values to exact integers: previous amounts: 0.92+0.42+2.09+1.57=5.00 and 0.15+0.07+0.35+0.27=0.84.
const mapping={version:'C4.2B',sale_id:'3',branch_id:'1',lines:values.map(([product],i)=>({sale_line_id:String(i+30),product_id:product,mapping_confirmed:true,source_tax_type:'SERVICE_TAX',lhdn_tax_type_code:'02'}))};
const sourceHashes={checkout:'a'.repeat(64),tax:'b'.repeat(64),mapping:'c'.repeat(64)};
const input={sale,reduction,checkout,tax,mapping,sourceHashes};
const inspect=v=>reconcileReductionDocumentEvidenceC43(v);
test('C4.3 reconciles real PAID DuitNow QR voucher RM14.95 with 4 distinct lines',()=>{
 const r=inspect(input);assert.equal(r.status,'EVIDENCE_RECONCILED');assert.equal(r.totals.payable,'14.95');assert.equal(r.reductions.voucher,'5.00');assert.equal(r.totals.serviceTax,'0.84');assert.equal(r.lineCount,4);assert.equal(r.unverifiedMappingLines,0);assert.equal(r.submissionReady,false);assert.equal(r.bankSettlementIndependentlyVerified,false);assert.equal(EINV_C43_SUBMISSION_ENABLED,false);
});
test('C4.3 requires real PAID source and immutable voucher linkage',()=>{
 assert.throws(()=>inspect({...input,sale:{...sale,status:'PENDING'}}),/PAID_REDUCTION_REQUIRED/);
 assert.throws(()=>inspect({...input,reduction:{...reduction,voucher_reservation_id:null}}),/VOUCHER_RESERVATION_MISSING/);
 assert.throws(()=>inspect({...input,reduction:{...reduction,discount_amount:'1.00'}}),/REDUCTION_INVALID/);
});
test('C4.3 refuses spoofed sale, branch, duplicates, missing line, inconsistent source',()=>{
 assert.throws(()=>inspect({...input,reduction:{...reduction,branch_id:2}}),/REDUCTION_SALE_MISMATCH/);
 assert.throws(()=>inspect({...input,tax:{...tax,sale_id:'4'}}),/EVIDENCE_SALE_MISMATCH/);
 assert.throws(()=>inspect({...input,tax:{...tax,lines:[tax.lines[0],tax.lines[0],...tax.lines.slice(2)]}}),/LINE_DUPLICATE_OR_INVALID/);
 assert.throws(()=>inspect({...input,mapping:{...mapping,lines:mapping.lines.slice(1)}}),/LINE_COUNT_MISMATCH/);
 assert.throws(()=>inspect({...input,sourceHashes:{...sourceHashes,tax:'bad'}}),/EVIDENCE_MISSING/);
});
test('C4.3 fails closed on missing reductions, mismatched taxes and totals',()=>{
 assert.throws(()=>inspect({...input,reduction:{...reduction,voucher_amount:'4.99'}}),/REDUCTION_CHECKOUT_MISMATCH/);
 assert.throws(()=>inspect({...input,tax:{...tax,lines:tax.lines.map((l,i)=>i===0?{...l,voucher_amount:'0.91'}:l)}}),/LINE_ALLOCATION_INVALID|REDUCTION_ALLOCATION_MISMATCH/);
 assert.throws(()=>inspect({...input,sale:{...sale,service_tax:'0.85'}}),/CHECKOUT_AMOUNT_MISMATCH/);
 assert.throws(()=>inspect({...input,tax:{...tax,totals:{payable:'14.90'}}}),/TAX_RECONCILIATION_MISMATCH/);
});
test('C4.3 blocks contradictory confirmed tax mappings',()=>{
 assert.throws(()=>inspect({...input,mapping:{...mapping,lines:mapping.lines.map((l,i)=>i===0?{...l,lhdn_tax_type_code:'06'}:l)}}),/MAPPING_TAX_CONFLICT/);
});
test('C4.3 distinguishes missing owner mapping from valid monetary reconciliation',()=>{
 const r=inspect({...input,mapping:{...mapping,lines:mapping.lines.map((l,i)=>i===0?{...l,mapping_confirmed:false}:l)}});
 assert.equal(r.unverifiedMappingLines,1);assert.equal(r.submissionReady,false);
});
test('C4.3 endpoint is permissioned, GET-only and has no write/migration/submit',()=>{
 const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.match(source,/app\.get\('\/api\/v2\/einvoice\/reduction-evidence\/:saleId',authenticate,permitted\('einvoice_settings\.view'\),getReductionDocumentEvidenceC43\)/);
 const handler=readFileSync(new URL('../src/einvoice-reduction-document-c43.js',import.meta.url),'utf8');
 assert.doesNotMatch(handler,/conn\.(?:commit|beginTransaction|query)\(|\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s+(?:INTO|TABLE|FROM|pos_|einvoice_)/i);
 assert.doesNotMatch(handler,/myinvois\.gov\.my|fetch\(/i);
});
test('C4.3 GET returns reconciled evidence through tenant pool without altering data',async()=>{
 const queries=[];
 const rows=[[[{name:'einvoice_checkout_snapshots'},{name:'einvoice_line_tax_evidence_c42'},{name:'einvoice_line_mapping_evidence_c42b'},{name:'pos_sale_reductions'}]],[[sale]],[[reduction]],[[{branch_id:1,document:JSON.stringify(checkout),hash:sourceHashes.checkout}]],[[{branch_id:1,document:tax,hash:sourceHashes.tax}]],[[{branch_id:1,document:mapping,hash:sourceHashes.mapping}]]];
 const conn={execute:async(sql,p)=>{queries.push({sql,p});return rows.shift();},release:()=>{queries.push({released:true});}};
 const req={auth:{user:{role_code:'OWNER'},pool:{getConnection:async()=>conn}},params:{saleId:'3'}};
 const res={set(k,v){assert.equal(k,'Cache-Control');assert.equal(v,'no-store');return this;},json(v){assert.equal(v.totals.payable,'14.95');return v;}};
 const out=await getReductionDocumentEvidenceC43(req,res);assert.equal(out.lineCount,4);assert.equal(queries.length,7);assert.equal(queries.at(-1).released,true);
});
