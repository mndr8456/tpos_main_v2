// C4.3 R4.5 offline-only MyInvois SDK business rules audit.
// A local check is NOT a substitute for LHDN's online taxpayer, duplicate or signature validators.
const ISSUE_LIMIT=30;
const add=(list,rule,code,disposition='BLOCK',path=null)=>{
 if(list.length<ISSUE_LIMIT)list.push({rule,code,disposition,...(path?{path}:{})});
};
const scalar=(node)=>Array.isArray(node)&&node.length===1&&node[0]&&typeof node[0]._==='string'?node[0]._:null;
const strictDate=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const strictTime=(v)=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(v);
export function auditMyInvoisBusinessRulesC43R45(source,now=new Date()){
 const prerequisites=source?.status==='LOCAL_XSD_VALID'&&source.normativeXsdExecuted===true&&source.normativeUblSchemaValidated===true;
 const i=source?.sdkDocument?.Invoice?.[0]??null;
 const issues=[];
 if(!prerequisites)add(issues,'STRUCTURE','LOCAL_XSD_VALID_REQUIRED');
 // R4.4's public API intentionally hides buyer/supplier information and has no sdkDocument.
 // Therefore rules requiring raw identity must be INDETERMINATE rather than pretending pass.
 const checkable=prerequisites&&i&&typeof i==='object';
 if(checkable){
  const id=scalar(i.ID),date=scalar(i.IssueDate),time=scalar(i.IssueTime);
  const type=scalar(i.InvoiceTypeCode),ver=i.InvoiceTypeCode?.[0]?.listVersionID;
  const curr=scalar(i.DocumentCurrencyCode);
  if(!id||id.length>50)add(issues,'CORE_FIELDS','INVOICE_ID_INVALID','BLOCK','Invoice.ID');
  if(type!=='01'||ver!=='1.1')add(issues,'CORE_FIELDS','DOCUMENT_TYPE_VERSION_UNSUPPORTED','BLOCK','Invoice.InvoiceTypeCode');
  if(!strictDate(date)||!strictTime(time))add(issues,'CORE_FIELDS','ISSUED_AT_INVALID','BLOCK','Invoice.IssueDate');
  else if(date!==now.toISOString().slice(0,10))add(issues,'CORE_FIELDS','ISSUE_DATE_NOT_CURRENT_UTC','BLOCK','Invoice.IssueDate');
  if(curr!=='MYR')add(issues,'CURRENCY','NON_MYR_REQUIRES_EXCHANGE_RATE_REVIEW','REVIEW','Invoice.DocumentCurrencyCode');
  if(!Array.isArray(i.InvoiceLine)||i.InvoiceLine.length<1)add(issues,'CORE_FIELDS','INVOICE_LINES_REQUIRED');
  if(!i.AccountingSupplierParty?.length||!i.AccountingCustomerParty?.length)add(issues,'CORE_FIELDS','SUPPLIER_BUYER_REQUIRED');
 }
 // These cannot be safely asserted locally, even if a fixture has plausible identity values.
 const external=[
  {rule:'SIGNATURE',code:'SIGNED_DOCUMENT_AND_CA_CERTIFICATE_REQUIRED'},
  {rule:'TAXPAYER',code:'LHDN_TAXPAYER_IDENTITY_VALIDATION_REQUIRED'},
  {rule:'CODES',code:'LHDN_CURRENT_CODE_TABLE_VALIDATION_REQUIRED'},
  {rule:'DUPLICATE',code:'LHDN_DUPLICATE_DOCUMENT_CHECK_REQUIRED'},
  {rule:'REFERENCES',code:'LHDN_REFERENCE_VALIDATION_IF_APPLICABLE'},
  {rule:'CURRENCY',code:'LHDN_CURRENCY_VALIDATOR_REQUIRED'}
 ];
 const blocked=issues.some(x=>x.disposition==='BLOCK');
 return {
  version:'C4.3-R4.5',saleId:source?.saleId??null,
  status:!prerequisites?'OFFLINE_BUSINESS_AUDIT_PREREQUISITE_MISSING':blocked?'OFFLINE_BUSINESS_RULES_BLOCKED':'OFFLINE_BUSINESS_RULES_REVIEW_REQUIRED',
  issues,externalValidationRequired:external,
  localXsdValidated:prerequisites,offlineSdkBusinessAuditExecuted:true,
  offlineBusinessRulesPassed:false, // Exhaustive SDK audit impossible without authenticated LHDN check.
  signingConfigured:false,signatureValidated:false,
  sandboxSubmissionReady:false,submissionEnabled:false,submissionAttempted:false,
  officialSchemaValidated:false,lhdnAccepted:false,lhdnDocumentStatus:'NOT_SUBMITTED',
  checkScope:checkable?'Local XSD plus selected SDK core checks':'Local XSD result only: R4.4 endpoint intentionally withholds invoice identity data',
  lineCount:source?.lineCount??null,payable:source?.payable??null
 };
}
