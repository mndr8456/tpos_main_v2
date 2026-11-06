// Pure assessment for additive tenant-local Receipt R2.1.5 / migration 036.
export const FEATURE_036='pos_receipt_tax_rates_r215_036';
export const RATE_COLUMNS=['sales_tax_rate_pct','service_tax_rate_pct','service_charge_rate_pct'];
export function assessRateSnapshot036({hasSaleTable,has035,markerRecorded,columns}){
 const missing=[],invalid=[];
 for(const name of RATE_COLUMNS){
  const meta=columns?.[name];
  if(!meta){missing.push(name);continue;}
  if(String(meta.type).toLowerCase()!=='decimal(6,3)'||String(meta.nullable).toUpperCase()!=='YES'||meta.defaultValue!==null)invalid.push({name,...meta});
 }
 const repairable=Boolean(hasSaleTable&&has035&&!invalid.length);
 const current=repairable&&!missing.length&&markerRecorded===true;
 return {current,repairable,markerRecorded:markerRecorded===true,missingColumns:missing,invalidColumns:invalid,blockers:[...(!hasSaleTable?['POS_024_REQUIRED']:[]),...(!has035?['POS_035_REQUIRED']:[]),...(invalid.length?['RATE_COLUMNS_INCOMPATIBLE']:[])]};
}
