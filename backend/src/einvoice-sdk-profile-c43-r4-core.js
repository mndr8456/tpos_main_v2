// C4.3 R4: SDK JSON profile check, read-only, unsigned and NEVER official schema validation.
// Source: MyInvois SDK v1.1 multi-line JSON example (UBL 2.1 JSON naming).
// It is a *profile mapping*, not a full UBL JSON Schema or MyInvois server validator.
export const EINV_C43_R4_SUBMISSION_ENABLED=false;
export const SDK_PROFILE_REFERENCE='https://sdk.myinvois.hasil.gov.my/files/sdksamples/1.1-Invoice-MultiLineItem-Sample.json';
const NAMESPACES=Object.freeze({_D:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',_A:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',_B:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'});
const moneyRegex=/^-?(?:0|[1-9]\d{0,12})\.\d{2}$/;
function cents(v){if(typeof v==='number'){if(!Number.isFinite(v)||!Number.isSafeInteger(Math.round(v*100))||Math.abs(v*100-Math.round(v*100))>1e-7)return null;v=v.toFixed(2);}if(!moneyRegex.test(String(v??'')))return null;const x=String(v),negative=x.startsWith('-');const [whole,decimal]=x.replace('-','').split('.');return (negative?-1n:1n)*(BigInt(whole)*100n+BigInt(decimal));}
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function convert(node,path='$'){
 if(Array.isArray(node))return node.map((v,i)=>convert(v,`${path}[${i}]`));
 if(node===null||typeof node!=='object')return node;
 const output={};
 for(const [key,val] of Object.entries(node)){
  if(key==='_DRAFT_ONLY')continue;
  if(!/^(cbc_|cac_)/.test(key)&&key.startsWith('_')&&key!=='_')throw new Error('UNEXPECTED_SOURCE_METADATA');
  const dest=key.replace(/^(cbc_|cac_)/,'');
  if(own(output,dest))throw new Error('DUPLICATE_JSON_FIELD');
  // Serialize UBL monetary values as JSON numbers only after validating source format;
  // source strings (authoritative exact-decimal ledger) remain entirely unchanged.
  if(dest==='_'&&typeof val==='string'&&/(?:Amount|PriceAmount)\[\d+\]$/.test(path)&&/^-?\d+(?:\.\d+)?$/.test(val)){
   const num=Number(val);if(!Number.isFinite(num)||Math.abs(num)>1e12)throw new Error('AMOUNT_RANGE');output[dest]=num;
  }else output[dest]=convert(val,`${path}.${dest}`);
 }
 return output;
}
const at=(obj,key)=>Array.isArray(obj?.[key])&&obj[key].length===1?obj[key][0]:null;
const value=(obj,key)=>at(obj,key)?._;
function issue(errors,path,code){errors.push({path,code});}
function validateParty(errors,party,path,{supplier=false}={}){
 if(!party){issue(errors,path,'PARTY_REQUIRED');return;}
 const p=at(party,'Party');if(!p){issue(errors,`${path}.Party`,'PARTY_REQUIRED');return;}
 const ids=Array.isArray(p.PartyIdentification)?p.PartyIdentification:[];
 for(const scheme of ['TIN'])if(!ids.some(i=>i?.ID?.[0]?.schemeID===scheme&&String(i.ID[0]._??'').trim()))issue(errors,`${path}.Party.PartyIdentification`,'IDENTIFIER_REQUIRED');
 if(!ids.some(i=>['BRN','NRIC','PASSPORT','ARMY'].includes(i?.ID?.[0]?.schemeID)&&String(i.ID[0]._??'').trim()))issue(errors,`${path}.Party.PartyIdentification`,'LEGAL_ID_REQUIRED');
 if(!String(value(at(p,'PartyLegalEntity'),'RegistrationName')??'').trim())issue(errors,`${path}.Party.PartyLegalEntity`,'NAME_REQUIRED');
 const adr=at(p,'PostalAddress');const country=at(adr,'Country');const countryId=at(country,'IdentificationCode');
 if(!adr||!String(value(adr,'CityName')??'').trim()||!Array.isArray(adr.AddressLine)||!adr.AddressLine.length)issue(errors,`${path}.Party.PostalAddress`,'ADDRESS_REQUIRED');
 if(!/^[A-Z]{3}$/.test(String(countryId?._??''))||countryId.listID!=='ISO3166-1'||countryId.listAgencyID!=='6')issue(errors,`${path}.Party.PostalAddress.Country`,'COUNTRY_CODE_PROFILE');
 const state=String(value(adr,'CountrySubentityCode')??'');
 if(countryId?._==='MYS'&&!/^(0[1-9]|1[0-6])$/.test(state))issue(errors,`${path}.Party.PostalAddress.CountrySubentityCode`,'MALAYSIA_STATE_CODE');
 else if(countryId?._!=='MYS'&&(!state.trim()||state.length>50))issue(errors,`${path}.Party.PostalAddress.CountrySubentityCode`,'FOREIGN_STATE_REQUIRED');
 if(supplier){const industry=at(p,'IndustryClassificationCode');if(!/^\d{5}$/.test(String(industry?._??''))||!String(industry?.name??'').trim())issue(errors,`${path}.Party.IndustryClassificationCode`,'MSIC_REQUIRED');}
}
export function validateSdkJsonProfileC43R4(source){
 const errors=[];
 if(!source||source.status!=='UNSIGNED_STRUCTURAL_PREVIEW'||!source.structuralChecksPassed||!source.document?._DRAFT_ONLY){
  return {version:'C4.3-R4-SDK-PROFILE',status:'R3_NOT_READY',sdkProfileChecksPassed:false,officialSchemaValidated:false,signaturePresent:false,submissionReady:false,submissionEnabled:false,issues:[{path:'$',code:'R3_RECONCILED_UNSIGNED_DRAFT_REQUIRED'}],sdkDocument:null};
 }
 let doc;
 try{doc={...NAMESPACES,...convert(source.document)};}catch(e){issue(errors,'$',e.message);}
 const invoice=at(doc,'Invoice');
 if(!invoice)issue(errors,'$.Invoice','INVOICE_REQUIRED');
 if(invoice){
  if(typeof value(invoice,'ID')!=='string'||!value(invoice,'ID').trim())issue(errors,'$.Invoice[0].ID','INVOICE_ID');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value(invoice,'IssueDate')??'')))issue(errors,'$.Invoice[0].IssueDate','ISSUE_DATE');
  if(!/^\d{2}:\d{2}:\d{2}Z$/.test(String(value(invoice,'IssueTime')??'')))issue(errors,'$.Invoice[0].IssueTime','ISSUE_TIME_UTC');
  const type=at(invoice,'InvoiceTypeCode');if(type?._!=='01'||type.listVersionID!=='1.1')issue(errors,'$.Invoice[0].InvoiceTypeCode','VERSION');
  if(value(invoice,'DocumentCurrencyCode')!=='MYR')issue(errors,'$.Invoice[0].DocumentCurrencyCode','CURRENCY');
  validateParty(errors,at(invoice,'AccountingSupplierParty'),'$.Invoice[0].AccountingSupplierParty',{supplier:true});
  validateParty(errors,at(invoice,'AccountingCustomerParty'),'$.Invoice[0].AccountingCustomerParty');
  let sumNet=0n,sumTax=0n,sumAllowance=0n;
  const lines=invoice.InvoiceLine;
  if(!Array.isArray(lines)||lines.length<1)issue(errors,'$.Invoice[0].InvoiceLine','LINES_REQUIRED');
  else{
   const seen=new Set();
   for(let i=0;i<lines.length;i++){
    const l=lines[i],path=`$.Invoice[0].InvoiceLine[${i}]`,id=value(l,'ID');
    if(!id||seen.has(String(id)))issue(errors,`${path}.ID`,'DUPLICATE_OR_MISSING_ID');seen.add(String(id));
    if(!String(at(l,'InvoicedQuantity')?.unitCode??'').trim())issue(errors,`${path}.InvoicedQuantity`,'UNIT_CODE');
    if(!String(value(at(l,'Item'),'Description')??'').trim()||!String(value(at(at(l,'Item'),'CommodityClassification'),'ItemClassificationCode')??'').trim())issue(errors,`${path}.Item`,'ITEM_CLASSIFICATION');
    if(!at(at(l,'Price'),'PriceAmount'))issue(errors,`${path}.Price`,'PRICE_REQUIRED');
    const net=cents(value(l,'LineExtensionAmount'));
    if(net===null||net<0n)issue(errors,`${path}.LineExtensionAmount`,'MONEY_INVALID');else sumNet+=net;
    const tx=at(l,'TaxTotal'),tax=cents(value(tx,'TaxAmount'));
    if(tax===null||tax<0n)issue(errors,`${path}.TaxTotal`,'MONEY_INVALID');else sumTax+=tax;
    for(const [j,ch] of (l.AllowanceCharge??[]).entries()){
     const amt=cents(value(ch,'Amount'));
     if(value(ch,'ChargeIndicator')!==false||amt===null||amt<0n)issue(errors,`${path}.AllowanceCharge[${j}]`,'ALLOWANCE_INVALID');else sumAllowance+=amt;
    }
   }
  }
  const taxTotal=at(invoice,'TaxTotal'),tax=cents(value(taxTotal,'TaxAmount'));
  const monetary=at(invoice,'LegalMonetaryTotal');
  const netTotal=cents(value(monetary,'LineExtensionAmount')),
    exclusive=cents(value(monetary,'TaxExclusiveAmount')),
    inclusive=cents(value(monetary,'TaxInclusiveAmount')),
    payable=cents(value(monetary,'PayableAmount')),
    rounding=monetary?.PayableRoundingAmount?cents(value(monetary,'PayableRoundingAmount')):0n;
  if([tax,netTotal,exclusive,inclusive,payable,rounding].some(v=>v===null))issue(errors,'$.Invoice[0].LegalMonetaryTotal','MONEY_INVALID');
  else{
   if(sumNet!==netTotal||netTotal!==exclusive)issue(errors,'$.Invoice[0].LegalMonetaryTotal.LineExtensionAmount','LINE_NET_MISMATCH');
   if(sumTax!==tax||exclusive+tax!==inclusive)issue(errors,'$.Invoice[0].TaxTotal','TAX_MISMATCH');
   if(inclusive+rounding!==payable)issue(errors,'$.Invoice[0].LegalMonetaryTotal.PayableAmount','PAYABLE_MISMATCH');
   if(payable!==cents('14.95')&&source.saleId==='3'&&source.receiptNumber==='20261100320003')issue(errors,'$.Invoice[0].LegalMonetaryTotal.PayableAmount','HISTORIC_SALE_3_MISMATCH');
  }
  if(source.saleId==='3'&&source.receiptNumber==='20261100320003'&&(lines?.length!==4||sumAllowance!==cents('5.00')))issue(errors,'$.Invoice[0].InvoiceLine','HISTORIC_VOUCHER_MISMATCH');
  if(invoice.Signature||invoice.UBLExtensions||invoice.DigitalSignatureAttachment)issue(errors,'$.Invoice[0]','SIGNATURE_PRESENT_UNEXPECTED');
 }
 // Keep raw SDK-shaped document only if all local profile rules pass. It is NEVER submission-ready.
 return {version:'C4.3-R4-SDK-PROFILE',status:errors.length?'SDK_PROFILE_GAPS':'SDK_PROFILE_CHECK_PASSED_UNSIGNED',saleId:String(source.saleId),receiptNumber:source.receiptNumber,
  sdkProfileChecksPassed:errors.length===0,offlineJsonSchemaValidated:false,officialSchemaValidated:false,signaturePresent:false,submissionReady:false,submissionEnabled:false,
  issues:errors,sdkDocument:errors.length?null:doc,sourceEvidenceSha256:source.sourceEvidenceSha256,
  notice:'SDK sample-aligned JSON profile checks ONLY. No official JSON Schema/XSD engine, no LHDN server validation, no signing and no submission.'};
}
