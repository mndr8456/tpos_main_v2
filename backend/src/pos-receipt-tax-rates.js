// Persist the precise effective tenant tax/fee rates used for each posted sale.
// NULL denotes not applicable (or historical rate unavailable), never 0% by guess.
const validRate=value=>{
 const text=String(value??'');
 if(!/^(?:0|[1-9]\d?|100)(?:\.\d{1,3})?$/.test(text)||Number(text)>100)throw Error('POS_RECEIPT_TAX_RATE_INVALID');
 return Number(text).toFixed(3);
};
export function saleTaxRateSnapshot(quote){
 if(!quote?.bill||!quote.sst?.salesTax||!quote.sst?.serviceTax||!quote.serviceCharge)throw Error('POS_RECEIPT_TAX_SETTINGS_UNAVAILABLE');
 const tax=(setting,amount)=>{
  const active=setting.enabled===true&&setting.registrationConfigured===true;
  if(!active){if(Number(amount)!==0)throw Error('POS_RECEIPT_DISABLED_TAX_NONZERO');return null;}
  return validRate(setting.rate);
 };
 const charge=quote.serviceCharge.applicable===true?validRate(quote.serviceCharge.rate):null;
 if(!charge&&Number(quote.bill.serviceCharge)!==0)throw Error('POS_RECEIPT_DISABLED_SERVICE_CHARGE_NONZERO');
 return {
  salesTaxRate:tax(quote.sst.salesTax,quote.bill.salesTax),
  serviceTaxRate:tax(quote.sst.serviceTax,quote.bill.serviceTax),
  serviceChargeRate:charge
 };
}
