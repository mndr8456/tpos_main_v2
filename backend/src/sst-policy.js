// Tenant-level SST switch policy for POS tax quotation. No checkout posting.
export function applySstPolicy(product,settings){
 const type=String(product.jkdm_tax_type||'NONE');
 if(!['NONE','SALES_TAX','SERVICE_TAX'].includes(type))throw Object.assign(new Error('POS_TAX_TYPE_INVALID'),{status:409});
 const setting=settings.get(type);
 const enabled=type!=='NONE' && setting?.isEnabled && Boolean(setting?.registrationNumber);
 // Product selling prices are before SST. The historical jkdm_tax_inclusive
 // column remains in tenant tables/CSV for compatibility and audit, but MUST
 // NOT change current POS quotations. Tax rates and switches come from the
 // authenticated tenant settings, only for products with a matching SST type.
 return {taxType:enabled?type:'NONE',taxRate:enabled?String(setting.taxRate):'0',taxInclusive:false};
}

// Expose the current *tenant* SST policy to POS without leaking registration numbers.
// A tenant switch does not override each product's approved SST classification.
export function summarizePosSst(settings,lines,productTaxes){
 const result={};
 for(const [key,type] of [['salesTax','SALES_TAX'],['serviceTax','SERVICE_TAX']]){
  const setting=settings.get(type);
  if(!setting)throw Object.assign(new Error('SST_SETTINGS_MIGRATION_REQUIRED'),{status:409});
  const active=setting.isEnabled===true&&Boolean(setting.registrationNumber);
  const matchingLines=lines.filter(line=>productTaxes.get(String(line.product_id))?.jkdm_tax_type===type).length;
  result[key]={enabled:Boolean(setting.isEnabled),registrationConfigured:Boolean(setting.registrationNumber),rate:String(setting.taxRate),matchingLines,appliedLines:active?matchingLines:0};
 }
 return result;
}
