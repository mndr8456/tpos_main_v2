// Pure POS-ready calculation (no postings, usage reservations, or voucher stacking).
// All monetary inputs represent MYR, return rounded to whole sen.
export function evaluateDiscount(discount,{eligibleSubtotal,date,usageCount=0,eligible=true}={}){
 const invalid=reason=>({eligible:false,reason,amount:'0.00'});
 const sub=Number(eligibleSubtotal);
 if(!Number.isFinite(sub)||sub<0||sub>999999999.99)return invalid('INVALID_SUBTOTAL');
 if(!eligible)return invalid('TARGET_NOT_ELIGIBLE');
 if(discount.status!=='ACTIVE'||discount.is_deleted)return invalid('DISCOUNT_INACTIVE');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return invalid('INVALID_DATE');
 const start=discount.start_date?String(discount.start_date).slice(0,10):null;
 const end=discount.end_date?String(discount.end_date).slice(0,10):null;
 if(start&&date<start)return invalid('DISCOUNT_NOT_STARTED');
 if(end&&date>end)return invalid('DISCOUNT_EXPIRED');
 if(discount.usage_limit!=null&&Number(usageCount)>=Number(discount.usage_limit))return invalid('USAGE_LIMIT_REACHED');
 const cents=Math.round(sub*100);
 const min=Math.round(Number(discount.minimum_spend||0)*100);
 if(cents<min)return invalid('MINIMUM_SPEND_NOT_MET');
 const value=Number(discount.discount_value);
 if(!Number.isFinite(value)||value<=0)return invalid('INVALID_DISCOUNT_VALUE');
 let reduction;
 if(discount.discount_type==='PERCENTAGE'){
  if(value>100)return invalid('INVALID_DISCOUNT_VALUE');
  // Discount rate has maximum two fractional digits; round once to nearest sen.
  reduction=Math.round(cents*Math.round(value*100)/10000);
 }else if(discount.discount_type==='FIXED_AMOUNT')reduction=Math.round(value*100);
 else return invalid('INVALID_DISCOUNT_TYPE');
 if(discount.maximum_discount_amount!=null)reduction=Math.min(reduction,Math.round(Number(discount.maximum_discount_amount)*100));
 reduction=Math.max(0,Math.min(cents,reduction));
 return {eligible:true,reason:'ELIGIBLE',amount:(reduction/100).toFixed(2)};
}
