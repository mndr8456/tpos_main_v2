// C4.3 R4.1: independent, bounded, read-only SDK-shaped UBL JSON offline rule audit.
// NOT a normative JSON Schema/XSD validator and NOT a MyInvois server validation.
// No signatures, payload signing, submission or database write operations.
export const C43_R41_SUBMISSION_ENABLED = false;
export const C43_R41_SDK_REFERENCES = Object.freeze([
  'https://sdk.myinvois.hasil.gov.my/types/',
  'https://sdk.myinvois.hasil.gov.my/document-validation-rules/',
  'https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/',
  'https://sdk.myinvois.hasil.gov.my/signature/'
]);
const NS={_D:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',_A:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',_B:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o??{},k);
const has=(o,k)=>Array.isArray(o?.[k])&&o[k].length===1&&o[k][0]!==null&&typeof o[k][0]==='object'&&!Array.isArray(o[k][0]);
const one=(o,k)=>has(o,k)?o[k][0]:null;
const val=(o,k)=>one(o,k)?._;
const reMoney=/^-?(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
function money(v){
 if(typeof v==='number'){
  if(!Number.isFinite(v)||Math.abs(v)>1e12||Math.abs(v*100-Math.round(v*100))>1e-7)return null;
  v=v.toFixed(2);
 }
 if(typeof v!=='string'||!reMoney.test(v))return null;
 const [left,frac='']=v.replace(/^-/,'').split('.');
 return (v.startsWith('-')?-1n:1n)*(BigInt(left)*100n+BigInt(frac.padEnd(2,'0')));
}
function audit(sdkProfile){
 const issues=[];
 const add=(path,code)=>{if(issues.length<100)issues.push({path,code});};
 const result=(status,document=null)=>({version:'C4.3-R4.1-OFFLINE-RULE-AUDIT',status,saleId:sdkProfile?.saleId??null,
  sdkProfileChecksPassed:sdkProfile?.sdkProfileChecksPassed===true,
  offlineRuleChecksPassed:status==='OFFLINE_RULE_CHECKS_PASSED_UNSIGNED',
  offlineJsonSchemaValidated:false,officialSchemaValidated:false,signaturePresent:false,
  submissionReady:false,submissionEnabled:false,issues,
  // Never expose a document when these offline checks have failed.
  sdkDocument:document,
  validatorScope:'Bounded SDK-guided offline structural and monetary checks; NO complete normative UBL JSON Schema/XSD validation, signing or MyInvois server validation.'});
 if(sdkProfile?.status!=='SDK_PROFILE_CHECK_PASSED_UNSIGNED'||sdkProfile?.sdkProfileChecksPassed!==true||!sdkProfile?.sdkDocument){
  add('$','R4_PROFILE_REQUIRED');return result('R4_PROFILE_NOT_READY');
 }
 const doc=sdkProfile.sdkDocument;
 for(const [k,v] of Object.entries(NS))if(doc[k]!==v)add(`$.${k}`,'UBL_NAMESPACE');
 if(!Array.isArray(doc.Invoice)||doc.Invoice.length!==1){add('$.Invoice','INVOICE_CARDINALITY');return result('OFFLINE_RULE_GAPS');}
 const i=doc.Invoice[0],base='$.Invoice[0]';
 if(!i||typeof i!=='object'||Array.isArray(i)){add(base,'INVOICE_OBJECT');return result('OFFLINE_RULE_GAPS');}
 for(const k of ['Signature','UBLExtensions','DigitalSignatureAttachment'])if(own(i,k))add(`${base}.${k}`,'SIGNATURE_UNEXPECTED');
 for(const k of ['ID','IssueDate','IssueTime','InvoiceTypeCode','DocumentCurrencyCode','AccountingSupplierParty','AccountingCustomerParty','TaxTotal','LegalMonetaryTotal'])if(!has(i,k))add(`${base}.${k}`,'REQUIRED_CARDINALITY');
 if(typeof val(i,'ID')!=='string'||!val(i,'ID')?.trim()||val(i,'ID').length>50)add(`${base}.ID`,'INVOICE_ID_FORMAT');
 const dt=val(i,'IssueDate'),tm=val(i,'IssueTime');
 if(typeof dt!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dt)||Number.isNaN(Date.parse(`${dt}T00:00:00Z`))||new Date(`${dt}T00:00:00Z`).toISOString().slice(0,10)!==dt)add(`${base}.IssueDate`,'ISSUE_DATE_INVALID');
 if(typeof tm!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(tm))add(`${base}.IssueTime`,'ISSUE_TIME_INVALID');
 const type=one(i,'InvoiceTypeCode');if(type?._!=='01'||type?.listVersionID!=='1.1')add(`${base}.InvoiceTypeCode`,'INVOICE_VERSION');
 if(val(i,'DocumentCurrencyCode')!=='MYR')add(`${base}.DocumentCurrencyCode`,'MYR_ONLY');
 function moneyField(obj,k,path,{allowNegative=false,optional=false}={}){
  if(optional&&!own(obj,k))return 0n;
  if(!has(obj,k)){add(`${path}.${k}`,'MONEY_CARDINALITY');return null;}
  const item=one(obj,k);const n=money(item?._);
  if(item?.currencyID!=='MYR'||n===null||(!allowNegative&&n<0n))add(`${path}.${k}`,'MONEY_OR_CURRENCY_INVALID');
  return n;
 }
 function party(k,supplier){
  const partyRoot=one(i,k),p=one(partyRoot,'Party'),path=`${base}.${k}[0].Party[0]`;
  if(!p){add(path,'PARTY_REQUIRED');return;}
  const ids=Array.isArray(p.PartyIdentification)?p.PartyIdentification:[];
  for(const scheme of ['TIN'])if(!ids.some(x=>one(x,'ID')?.schemeID===scheme&&String(val(x,'ID')??'').trim()))add(`${path}.PartyIdentification`,'TIN_REQUIRED');
  if(!ids.some(x=>['BRN','NRIC','PASSPORT','ARMY'].includes(one(x,'ID')?.schemeID)&&String(val(x,'ID')??'').trim()))add(`${path}.PartyIdentification`,'LEGAL_IDENTIFIER_REQUIRED');
  if(!String(val(one(p,'PartyLegalEntity'),'RegistrationName')??'').trim())add(`${path}.PartyLegalEntity`,'REGISTERED_NAME_REQUIRED');
  const addr=one(p,'PostalAddress'),country=one(one(addr,'Country'),'IdentificationCode');
  if(!addr||!String(val(addr,'CityName')??'').trim()||!Array.isArray(addr.AddressLine)||addr.AddressLine.length<1||!addr.AddressLine.every(l=>String(val(l,'Line')??'').trim()))add(`${path}.PostalAddress`,'ADDRESS_REQUIRED');
  if(country?.listID!=='ISO3166-1'||country?.listAgencyID!=='6'||!/^[A-Z]{3}$/.test(String(country?._??'')))add(`${path}.PostalAddress.Country`,'COUNTRY_CODE_INVALID');
  if(country?._==='MYS'&&!/^(0[1-9]|1[0-6])$/.test(String(val(addr,'CountrySubentityCode')??'')))add(`${path}.PostalAddress.CountrySubentityCode`,'MALAYSIA_STATE_INVALID');
  if(supplier){const msic=one(p,'IndustryClassificationCode');if(!/^\d{5}$/.test(String(msic?._??''))||!String(msic?.name??'').trim())add(`${path}.IndustryClassificationCode`,'MSIC_REQUIRED');}
 }
 party('AccountingSupplierParty',true);party('AccountingCustomerParty',false);
 const lines=i.InvoiceLine;
 if(!Array.isArray(lines)||lines.length<1||lines.length>5000){add(`${base}.InvoiceLine`,'INVOICE_LINES_CARDINALITY');return result('OFFLINE_RULE_GAPS');}
 let sumLine=0n,sumTax=0n,sumAllow=0n;const ids=new Set();
 for(let j=0;j<lines.length;j++){
  const l=lines[j],path=`${base}.InvoiceLine[${j}]`;
  if(!l||typeof l!=='object'||Array.isArray(l)){add(path,'LINE_OBJECT');continue;}
  const id=String(val(l,'ID')??'');if(!id.trim()||ids.has(id)){add(`${path}.ID`,'LINE_ID_INVALID_OR_DUPLICATE');}ids.add(id);
  const qty=one(l,'InvoicedQuantity');if(!qty||!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(String(qty._??''))||!Number.isFinite(Number(qty._))||Number(qty._)<=0||!/^[A-Z0-9]{2,3}$/.test(String(qty.unitCode??'')))add(`${path}.InvoicedQuantity`,'QUANTITY_OR_UNIT_INVALID');
  const item=one(l,'Item');if(!String(val(item,'Description')??'').trim()||!/^\d{3}$/.test(String(one(one(item,'CommodityClassification'),'ItemClassificationCode')?._??'')))add(`${path}.Item`,'ITEM_CLASSIFICATION_INVALID');
  moneyField(one(l,'Price'),'PriceAmount',`${path}.Price`);
  const net=moneyField(l,'LineExtensionAmount',path);if(net!==null)sumLine+=net;
  let lineAllowance=0n;
  if(own(l,'AllowanceCharge')){
   if(!Array.isArray(l.AllowanceCharge)||l.AllowanceCharge.length>100){add(`${path}.AllowanceCharge`,'ALLOWANCE_CARDINALITY');}
   else for(let h=0;h<l.AllowanceCharge.length;h++){
    const ch=l.AllowanceCharge[h],cp=`${path}.AllowanceCharge[${h}]`;
    if(val(ch,'ChargeIndicator')!==false)add(`${cp}.ChargeIndicator`,'CHARGE_NOT_SUPPORTED');
    const a=moneyField(ch,'Amount',cp);if(a!==null){lineAllowance+=a;sumAllow+=a;}
   }
  }
  const lt=one(l,'TaxTotal'),tx=moneyField(lt,'TaxAmount',`${path}.TaxTotal`);if(tx!==null)sumTax+=tx;
  const subtotal=one(lt,'TaxSubtotal');
  if(!subtotal)add(`${path}.TaxTotal.TaxSubtotal`,'TAX_SUBTOTAL_REQUIRED');
  else{
   const baseAmount=moneyField(subtotal,'TaxableAmount',`${path}.TaxTotal.TaxSubtotal`);
   const taxAmount=moneyField(subtotal,'TaxAmount',`${path}.TaxTotal.TaxSubtotal`);
   if(baseAmount!==null&&net!==null&&baseAmount!==net)add(`${path}.TaxTotal.TaxSubtotal.TaxableAmount`,'TAX_BASE_MISMATCH');
   if(taxAmount!==null&&tx!==null&&taxAmount!==tx)add(`${path}.TaxTotal.TaxSubtotal.TaxAmount`,'TAX_SUBTOTAL_MISMATCH');
   const cat=one(subtotal,'TaxCategory'),scheme=one(cat,'TaxScheme'),schemeId=one(scheme,'ID');
   if(!/^\d{2}$/.test(String(val(cat,'ID')??''))||schemeId?._!=='OTH'||schemeId?.schemeID!=='UN/ECE 5153'||schemeId?.schemeAgencyID!=='6')add(`${path}.TaxTotal.TaxSubtotal.TaxCategory`,'TAX_CATEGORY_STRUCTURE');
  }
  if(net!==null&&lineAllowance>0n&&net===0n)add(`${path}.AllowanceCharge`,'ALLOWANCE_EXCEEDS_NET_REVIEW');
 }
 const totalTax=moneyField(one(i,'TaxTotal'),'TaxAmount',`${base}.TaxTotal`);
 const mt=one(i,'LegalMonetaryTotal'),mp=`${base}.LegalMonetaryTotal`;
 const ex=moneyField(mt,'TaxExclusiveAmount',mp),incl=moneyField(mt,'TaxInclusiveAmount',mp),ln=moneyField(mt,'LineExtensionAmount',mp),pay=moneyField(mt,'PayableAmount',mp),round=moneyField(mt,'PayableRoundingAmount',mp,{allowNegative:true,optional:true});
 if(ln!==null&&sumLine!==ln)add(`${mp}.LineExtensionAmount`,'LINE_SUM_MISMATCH');
 if(ln!==null&&ex!==null&&ln!==ex)add(`${mp}.TaxExclusiveAmount`,'EXCLUSIVE_MISMATCH');
 if(totalTax!==null&&sumTax!==totalTax)add(`${base}.TaxTotal.TaxAmount`,'LINE_TAX_SUM_MISMATCH');
 if(totalTax!==null&&ex!==null&&incl!==null&&ex+totalTax!==incl)add(`${mp}.TaxInclusiveAmount`,'TAX_INCLUSIVE_MISMATCH');
 if(incl!==null&&round!==null&&pay!==null&&incl+round!==pay)add(`${mp}.PayableAmount`,'PAYABLE_MISMATCH');
 if(String(sdkProfile.saleId)==='3'&&sdkProfile.receiptNumber==='20261100320003'&&(lines.length!==4||sumAllow!==500n||pay!==1495n))add(`${base}.InvoiceLine`,'HISTORIC_SALE_3_RECONCILIATION');
 return result(issues.length?'OFFLINE_RULE_GAPS':'OFFLINE_RULE_CHECKS_PASSED_UNSIGNED',issues.length?null:doc);
}
export const auditOfflineUblC43R41=audit;
