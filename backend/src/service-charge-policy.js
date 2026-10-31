// Charge eligibility is order-level and independent of products' jkdm_tax_type.
export function serviceChargeForOrder(settings,{businessType,orderScope}){
 const business=String(businessType||'').toUpperCase();
 const fnb=['RESTAURANT','CAFE','FOOD_TRUCK','STREET_FOOD'].includes(business);
 const eligibleScope=orderScope==='DINE_IN'?settings.applyDineIn===true:orderScope==='TAKE_AWAY'&&settings.applyTakeAway===true;
 const applicable=fnb&&settings.isEnabled===true&&eligibleScope;
 return {applicable,rate:applicable?String(settings.chargeRate):'0',configuredRate:String(settings.chargeRate),enabled:settings.isEnabled===true,applyDineIn:settings.applyDineIn,applyTakeAway:settings.applyTakeAway};
}
