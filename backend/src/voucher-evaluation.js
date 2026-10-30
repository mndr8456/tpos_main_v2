// Pure amount/eligibility engine. Money is calculated in integer MYR sen.
const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>1e-7)throw Error('INVALID_MONEY');return Math.round(n*100);};
export const amountMYR=n=>(n/100).toFixed(2);
const cleanDate=v=>String(v||'').replace('T',' ').slice(0,19);
export function evaluateVoucher(voucher,context){
 const reasons=[];
 const lines=Array.isArray(context?.lines)?context.lines:[];
 const now=cleanDate(context?.now);
 const starts=cleanDate(voucher.starts_at),ends=cleanDate(voucher.ends_at);
 if(!now||now<starts||now>ends)reasons.push('OUTSIDE_VALIDITY');
 if(voucher.status!=='ACTIVE'||voucher.is_deleted)reasons.push('VOUCHER_INACTIVE');
 if(voucher.order_scope!=='BOTH'&&voucher.order_scope!==context?.orderScope)reasons.push('ORDER_SCOPE_MISMATCH');
 if(voucher.usage_limit!=null&&Number(context?.usedCount??0)>=Number(voucher.usage_limit))reasons.push('USAGE_LIMIT_REACHED');
 if(voucher.per_customer_limit!=null){
  if(!context.customerRef)reasons.push('CUSTOMER_REQUIRED');
  else if(Number(context.customerUsedCount??0)>=Number(voucher.per_customer_limit))reasons.push('CUSTOMER_USAGE_LIMIT_REACHED');
 }
 const targetType=voucher.eligibility_type;
 const targets=new Set((context?.targetIds||[]).map(String));
 const eligible=lines.filter(line=>{
  if(line.active===false)return false;
  if(targetType==='ALL')return true;
  return targetType==='PRODUCT'?targets.has(String(line.productId)):targets.has(String(line.categoryId));
 });
 const eligibleSen=eligible.reduce((a,b)=>a+cents(b.subtotal),0);
 if(eligibleSen<=0)reasons.push('NO_ELIGIBLE_ITEMS');
 if(eligibleSen<cents(voucher.minimum_spend??0))reasons.push('MINIMUM_SPEND');
 const valueSen=cents(voucher.discount_value);
 let discountSen=voucher.discount_type==='PERCENTAGE'?Math.round(eligibleSen*Number(voucher.discount_value)/100):valueSen;
 if(voucher.maximum_discount!=null)discountSen=Math.min(discountSen,cents(voucher.maximum_discount));
 discountSen=Math.min(eligibleSen,discountSen);
 if(reasons.length)discountSen=0;
 return {eligible:reasons.length===0,reason:reasons[0]||'ELIGIBLE',reasons,eligibleSubtotal:amountMYR(eligibleSen),discountAmount:amountMYR(discountSen)};
}
