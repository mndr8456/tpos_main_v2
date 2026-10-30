// Discount CSV export helpers. A validated signed integer is safe as numeric CSV;
// unlike arbitrary text, a negative sort order must not be prefixed with an apostrophe.
export const DISCOUNT_EXPORT_HEADERS=Object.freeze(['discount_code','discount_name','description','discount_type','discount_scope','discount_value','minimum_spend','maximum_discount_amount','start_date','end_date','usage_limit','sort_order','status','eligibility_type','targets']);
const formatDate=value=>value?String(value).slice(0,10):'';
function csvCell(value,{signedInteger=false}={}){
 const raw=String(value??'');
 // Prevent formula interpretation for text, while keeping numeric sort order round-trippable.
 const safe=signedInteger&&/^-?\d+$/.test(raw)?raw:/^[=+@-]/.test(raw)?`'${raw}`:raw;
 return `"${safe.replaceAll('"','""')}"`;
}
export function exportDiscountCsv(discounts){
 return [DISCOUNT_EXPORT_HEADERS.join(','),...discounts.map(discount=>DISCOUNT_EXPORT_HEADERS.map(field=>{
  const value=field==='targets'?(discount.targets||[]).map(target=>target.code||'').join('|'):
   field==='start_date'||field==='end_date'?formatDate(discount[field]):discount[field];
  return csvCell(value,{signedInteger:field==='sort_order'});
 }).join(','))].join('\r\n');
}
