// Provider transactions and SARA are deliberately NOT equivalent to manual confirmation.
// A provider URL, API key, uploaded QR image or active switch alone cannot prove payment.
export const MANUAL_BANK_METHODS=Object.freeze(['DUITNOW_QR','EWALLET','BANK_TRANSFER']);
export const MANUAL_TERMINAL_METHODS=Object.freeze(['DEBIT_CARD','CREDIT_CARD']);
export const PROVIDER_ONLY_METHODS=Object.freeze(['SARA_MYKASIH']);
export const ALL_NONCASH_METHODS=Object.freeze([...MANUAL_BANK_METHODS,...MANUAL_TERMINAL_METHODS,...PROVIDER_ONLY_METHODS]);
export const isManualMethod=m=>MANUAL_BANK_METHODS.includes(m)||MANUAL_TERMINAL_METHODS.includes(m);
export function paymentManualMode(method,settings){
 if(!settings||Number(settings.is_active)!==1)return null;
 if(MANUAL_BANK_METHODS.includes(method)){
  if(['DUITNOW_QR','EWALLET'].includes(method)&&!settings.has_image)return null;
  return 'MANUAL_BANK';
 }
 if(MANUAL_TERMINAL_METHODS.includes(method))return settings.provider_terminal_ref?'MANUAL_TERMINAL':null;
 return null;
}
export function safePaymentReference(value){
 const input=String(value||'').trim().toUpperCase().replace(/\s+/g,'');
 if(!/^(?=.*[0-9])[A-Z0-9][A-Z0-9\-_/]{5,79}$/.test(input))throw Object.assign(new Error('POS_PAYMENT_REFERENCE_INVALID'),{status:400});
 return input;
}
export function requireManualAttestation(data){
 if(data.verifiedInMerchantAccount!==true)throw Object.assign(new Error('POS_PAYMENT_MERCHANT_VERIFICATION_REQUIRED'),{status:409});
 if(data.verifiedAmount!==data.expectedTotal)throw Object.assign(new Error('POS_PAYMENT_VERIFIED_AMOUNT_MISMATCH'),{status:409});
 return safePaymentReference(data.paymentReference);
}
