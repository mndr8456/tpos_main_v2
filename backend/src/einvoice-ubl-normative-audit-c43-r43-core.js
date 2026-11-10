// C4.3 R4.3 — OASIS UBL 2.1 XML-schema vocabulary/sequence compatibility audit.
// Compatibility checks are NOT execution of the normative XML XSDs, and not MyInvois validation.
export const C43_R43_OASIS_REFERENCE = 'https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd';
export const C43_R43_COMMON_REFERENCE = 'https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/common/';
export const C43_R43_SUBMISSION_ENABLED = false;

// Explicit sequences restricted to UBL 2.1 vocabulary emitted by the TPOS C4.3 JSON profile.
// This is deliberately a *subset* compatibility audit, not a substitute for an XML/XSD engine.
const ORDERS = Object.freeze({
 Invoice:'UBLExtensions UBLVersionID CustomizationID ProfileID ProfileExecutionID ID CopyIndicator UUID IssueDate IssueTime DueDate InvoiceTypeCode Note TaxPointDate DocumentCurrencyCode TaxCurrencyCode PricingCurrencyCode PaymentCurrencyCode PaymentAlternativeCurrencyCode AccountingCostCode AccountingCost LineCountNumeric BuyerReference InvoicePeriod OrderReference BillingReference DespatchDocumentReference ReceiptDocumentReference StatementDocumentReference OriginatorDocumentReference ContractDocumentReference AdditionalDocumentReference ProjectReference Signature AccountingSupplierParty AccountingCustomerParty PayeeParty BuyerCustomerParty SellerSupplierParty TaxRepresentativeParty Delivery DeliveryTerms PaymentMeans PaymentTerms PrepaidPayment AllowanceCharge TaxExchangeRate PricingExchangeRate PaymentExchangeRate PaymentAlternativeExchangeRate TaxTotal WithholdingTaxTotal LegalMonetaryTotal InvoiceLine',
 InvoiceLine:'ID UUID Note InvoicedQuantity LineExtensionAmount TaxPointDate AccountingCostCode AccountingCost PaymentPurposeCode FreeOfChargeIndicator InvoicePeriod OrderLineReference DespatchLineReference ReceiptLineReference BillingReference DocumentReference PricingReference OriginatorParty Delivery PaymentTerms AllowanceCharge TaxTotal WithholdingTaxTotal Item Price DeliveryTerms SubInvoiceLine ItemPriceExtension',
 AccountingSupplierParty:'CustomerAssignedAccountID AdditionalAccountID DataSendingCapability Party DespatchContact AccountingContact SellerContact',
 AccountingCustomerParty:'CustomerAssignedAccountID SupplierAssignedAccountID AdditionalAccountID Party DeliveryContact AccountingContact BuyerContact',
 Party:'MarkCareIndicator MarkAttentionIndicator WebsiteURI LogoReferenceID EndpointID IndustryClassificationCode PartyIdentification PartyName Language PostalAddress PhysicalLocation PartyTaxScheme PartyLegalEntity Contact Person AgentParty ServiceProviderParty PowerOfAttorney FinancialAccount',
 PartyIdentification:'ID',
 PostalAddress:'ID AddressTypeCode AddressFormatCode Postbox Floor Room StreetName AdditionalStreetName BlockName BuildingName BuildingNumber InhouseMail Department MarkAttention MarkCare PlotIdentification CitySubdivisionName CityName PostalZone CountrySubentity CountrySubentityCode Region District TimezoneOffset AddressLine Country LocationCoordinate',
 AddressLine:'Line',
 Country:'IdentificationCode Name',
 PartyLegalEntity:'RegistrationName CompanyID RegistrationDate CompanyLegalForm SoleProprietorshipIndicator CompanyLiquidationStatus CorporateStockAmount FullyPaidShares RegisteredAddress CorporateRegistrationScheme HeadOfficeParty ShareholderParty',
 TaxTotal:'TaxAmount RoundingAmount TaxEvidenceIndicator TaxIncludedIndicator TaxSubtotal',
 TaxSubtotal:'TaxableAmount TaxAmount CalculationSequenceNumeric TransactionCurrencyTaxAmount Percent BaseUnitMeasure PerUnitAmount TierRange TierRatePercent TaxCategory',
 TaxCategory:'ID Name Percent BaseUnitMeasure PerUnitAmount TaxExemptionReasonCode TaxExemptionReason TierRange TierRatePercent TaxScheme',
 TaxScheme:'ID Name TaxTypeCode CurrencyCode JurisdictionRegionAddress',
 AllowanceCharge:'ID ChargeIndicator AllowanceChargeReasonCode AllowanceChargeReason MultiplierFactorNumeric PrepaidIndicator SequenceNumeric Amount BaseAmount AccountingCostCode AccountingCost PerUnitAmount TaxCategory TaxTotal PaymentMeans',
 Item:'Description PackQuantity PackSizeNumeric CatalogueIndicator Name HazardousRiskIndicator AdditionalInformation Keyword BrandName ModelName BuyersItemIdentification SellersItemIdentification ManufacturersItemIdentification StandardItemIdentification CatalogueItemIdentification AdditionalItemIdentification CatalogueDocumentReference ItemSpecificationDocumentReference OriginCountry CommodityClassification TransactionConditions HazardousItem ClassifiedTaxCategory AdditionalItemProperty ManufacturerParty InformationContentProviderParty OriginAddress ItemInstance Certificate Dimension',
 CommodityClassification:'NatureCode CargoTypeCode CommodityCode ItemClassificationCode',
 Price:'PriceAmount BaseQuantity PriceChangeReason PriceTypeCode PriceType OrderableUnitFactorRate ValidityPeriod PriceList AllowanceCharge PricingExchangeRate',
 LegalMonetaryTotal:'LineExtensionAmount TaxExclusiveAmount TaxInclusiveAmount AllowanceTotalAmount ChargeTotalAmount PrepaidAmount PayableRoundingAmount PayableAmount PayableAlternativeAmount'
});
const INDEX=Object.fromEntries(Object.entries(ORDERS).map(([k,v])=>[k,new Map(v.split(' ').map((s,i)=>[s,i]))]));
const SINGLE=new Set(['ID','IssueDate','IssueTime','InvoiceTypeCode','DocumentCurrencyCode','AccountingSupplierParty','AccountingCustomerParty','LegalMonetaryTotal','LineExtensionAmount','TaxExclusiveAmount','TaxInclusiveAmount','PayableAmount','Price','Item','InvoicedQuantity','ChargeIndicator','PriceAmount']);
const isObj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
function analyzeObject(obj,type,path,issues,depth=0){
 if(issues.length>=80)return;
 if(depth>32||!isObj(obj)){issues.push({path,code:'UBL_OBJECT_INVALID'});return;}
 const order=INDEX[type];if(!order)return;
 let last=-1;
 for(const [name,arr] of Object.entries(obj)){
  if(issues.length>=80)break;
  // UBL-BasicComponent primitive wrapper has only `_` and qualifiers; never inspect as aggregate.
  if(!order.has(name)){issues.push({path:`${path}.${name}`,code:'UBL_ELEMENT_NOT_IN_SEQUENCE',context:type});continue;}
  const position=order.get(name);
  if(position<last)issues.push({path:`${path}.${name}`,code:'UBL_ELEMENT_SEQUENCE',context:type});
  last=Math.max(last,position);
  if(!Array.isArray(arr)||arr.length<1||arr.length>5000){issues.push({path:`${path}.${name}`,code:'UBL_ELEMENT_CARDINALITY'});continue;}
  if(SINGLE.has(name)&&arr.length!==1&&!(type==='InvoiceLine'&&name==='ID'))issues.push({path:`${path}.${name}`,code:'UBL_PROFILE_SINGLE_OCCURRENCE'});
  if(INDEX[name])for(let j=0;j<arr.length;j++)analyzeObject(arr[j],name,`${path}.${name}[${j}]`,issues,depth+1);
 }
}
export function auditNormativeCompatibilityC43R43(document){
 const issues=[];
 if(!isObj(document))return [{path:'$',code:'SDK_JSON_DOCUMENT_REQUIRED'}];
 if(Object.keys(document).join('|')!=='_D|_A|_B|Invoice')issues.push({path:'$',code:'UBL_JSON_ROOT_ORDER'});
 if(!Array.isArray(document.Invoice)||document.Invoice.length!==1){issues.push({path:'$.Invoice',code:'UBL_INVOICE_ROOT_CARDINALITY'});return issues;}
 analyzeObject(document.Invoice[0],'Invoice','$.Invoice[0]',issues);
 const invoice=document.Invoice[0];
 if(!Array.isArray(invoice?.InvoiceLine)||invoice.InvoiceLine.length<1)issues.push({path:'$.Invoice[0].InvoiceLine',code:'UBL_INVOICE_LINE_REQUIRED'});
 for(const name of ['ID','IssueDate','AccountingSupplierParty','AccountingCustomerParty','LegalMonetaryTotal'])if(!Array.isArray(invoice?.[name])||invoice[name].length!==1)issues.push({path:`$.Invoice[0].${name}`,code:'UBL_INVOICE_MANDATORY_CARDINALITY'});
 return issues.slice(0,80);
}

// Canonical JSON key order for XML element sequence compatibility. Never changes scalar/array values.
// Any unfamiliar aggregate field is rejected by audit after canonicalization, not quietly discarded.
export function canonicalizeUblJsonOrderC43R43(document){
 function orderObject(obj,type,depth=0){
  if(depth>32||!isObj(obj)||!INDEX[type])return obj;
  const rank=INDEX[type];const keys=Object.keys(obj).sort((a,b)=>(rank.get(a)??1e6)-(rank.get(b)??1e6));
  const out={};
  for(const key of keys){
   const value=obj[key];
   out[key]=INDEX[key]&&Array.isArray(value)?value.map(x=>orderObject(x,key,depth+1)):value;
  }
  return out;
 }
 if(!isObj(document))return document;
 const obj={};for(const key of ['_D','_A','_B','Invoice'])if(Object.hasOwn(document,key))obj[key]=key==='Invoice'&&Array.isArray(document[key])?document[key].map(x=>orderObject(x,'Invoice')):document[key];
 for(const [key,val] of Object.entries(document))if(!Object.hasOwn(obj,key))obj[key]=val;
 return obj;
}
