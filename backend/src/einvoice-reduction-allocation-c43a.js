// C4.3A staged, pure POS reduction evidence calculator.
// NO database writes, checkout hooks, tax remapping, UBL submission, or backfill.
// This mirrors the largest-remainder deduction distribution in pos-bill.js.
// Only one of Discount or Voucher may be active: POS stacking is not approved.
import {createHash} from 'node:crypto';
const fail=code=>{throw Error(`EINV_C43A_${code}`);};
const cents=x=>{
 const m=/^(0|[1-9]\d{0,11})\.(\d{2})$/.exec(String(x??''));
 if(!m)fail('INVALID_MONEY');
 return BigInt(m[1])*100n+BigInt(m[2]);
};
const fmt=x=>`${x/100n}.${String(x%100n).padStart(2,'0')}`;
const id=x=>/^[1-9]\d*$/.test(String(x??''));
const asJSON=obj=>JSON.stringify(obj);
export const EINV_C43A_SUBMISSION_ENABLED=false;
export const EINV_C43A_CHECKOUT_INTEGRATED=false;
export function makeReductionAllocationPreviewC43A({lines,bill,saleId=null}={}){
 if(!Array.isArray(lines)||!lines.length||!bill)fail('INPUT_MISSING');
 if(saleId!==null&&!id(saleId))fail('INVALID_SALE_ID');
 const discount=cents(bill.discount),voucher=cents(bill.voucher),gross=cents(bill.subtotal);
 if(discount&&voucher)fail('STACKING_NOT_APPROVED');
 if(discount+voucher>gross)fail('REDUCTION_EXCEEDS_GROSS');
 const items=[],seen=new Set();let total=0n;
 for(const row of lines){
  if(!id(row.saleLineId)||!id(row.productId)||seen.has(String(row.saleLineId)))fail('INVALID_OR_DUPLICATE_LINE');
  seen.add(String(row.saleLineId));
  const value=cents(row.lineTotal);total+=value;
  items.push({saleLineId:String(row.saleLineId),productId:String(row.productId),gross:value});
 }
 if(total!==gross)fail('GROSS_RECONCILIATION_FAILED');
 const amount=discount+voucher;
 const portions=items.map((item,i)=>({i,base:amount?item.gross*amount/gross:0n,remainder:amount?item.gross*amount%gross:0n}));
 let assigned=portions.reduce((n,p)=>n+p.base,0n);
 const rank=[...portions].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1);
 for(let i=0n;i<amount-assigned;i++)rank[Number(i)].base++;
 const reductions=items.map((item,i)=>{
  const reduced=portions[i].base;
  if(reduced>item.gross)fail('LINE_OVER_ALLOCATED');
  return {sale_line_id:item.saleLineId,product_id:item.productId,gross_amount:fmt(item.gross),
   discount_amount:fmt(discount?reduced:0n),voucher_amount:fmt(voucher?reduced:0n),
   post_reduction_base:fmt(item.gross-reduced)};
 });
 assigned=portions.reduce((n,p)=>n+p.base,0n);
 if(assigned!==amount)fail('ALLOCATION_RECONCILIATION_FAILED');
 // The preview is not authoritative checkout evidence. A future integration must
 // bind its digest to immutable sale lines AND tax/discount/voucher event history.
 const result={version:'C4.3A-PREVIEW',sale_id:saleId===null?null:String(saleId),status:'CHECKOUT_INTEGRATION_REQUIRED',
  method:'POS_LARGEST_REMAINDER_SEQUENTIAL_ORDER',reduction_type:discount?'DISCOUNT':voucher?'VOUCHER':'NONE',
  lines:reductions,totals:{gross:fmt(gross),discount:fmt(discount),voucher:fmt(voucher),post_reduction:fmt(gross-amount)},
  missing_evidence:['POSTED_REDUCTION_SOURCE','CHECKOUT_TAX_RECONCILIATION','IMMUTABLE_C43A_CAPTURE'],
  submission_ready:false,submission_enabled:false};
 return {...result,preview_sha256:createHash('sha256').update(asJSON(result)).digest('hex')};
}
