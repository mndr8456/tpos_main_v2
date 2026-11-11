// C4.3 R3: offline unsigned Invoice v1.1 candidate, never submission-ready.
// Only authoritative checkout-time lines/mappings and request buyer data are accepted.
import {loadReductionDocumentEvidenceC43} from './einvoice-reduction-document-c43.js';
import {previewUblTreatmentC43R2} from './einvoice-ubl-treatment-c43-r2.js';
import {decryptCredential} from './einvoice-crypto.js';
const F=(code,status=409)=>Object.assign(new Error(`EINV_C43_R3_${code}`),{status});
const t=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=max?s.trim():null;
const d=v=>[{_:String(v)}];
const a=v=>[{_:String(v),currencyID:'MYR'}];
const validState=(s,c)=>c==='MYS'?/^(0[1-9]|1[0-6])$/.test(s):!!t(s,50);
const partyGaps=(p,prefix)=>{
 const gaps=[];
 for(const [key,max] of Object.entries({name:300,tin:14,identificationNumber:20,address1:150,city:50,phone:20}))if(!t(p?.[key],max))gaps.push(`${prefix}.${key}`);
 if(!['BRN','NRIC','PASSPORT','ARMY'].includes(p?.identificationType))gaps.push(`${prefix}.identificationType`);
 if(!/^[A-Z]{3}$/.test(p?.country??''))gaps.push(`${prefix}.country`);
 if(!validState(p?.state,p?.country))gaps.push(`${prefix}.stateCode`);
 if(p?.email&&!t(p.email,320))gaps.push(`${prefix}.email`);
 return gaps;
};
const address=p=>({cbc_CityName:d(p.city),...(p.postcode?{cbc_PostalZone:d(p.postcode)}:{}),cbc_CountrySubentityCode:d(p.state),cac_AddressLine:[p.address1,p.address2,p.address3].filter(Boolean).map(v=>({cbc_Line:d(v)})),cac_Country:[{cbc_IdentificationCode:[{_:p.country,listID:'ISO3166-1',listAgencyID:'6'}]}]});
const party=p=>({cac_PartyIdentification:[{cbc_ID:[{_:p.tin,schemeID:'TIN'}]},{cbc_ID:[{_:p.identificationNumber,schemeID:p.identificationType}]}],cac_PostalAddress:[address(p)],cac_PartyLegalEntity:[{cbc_RegistrationName:d(p.name)}],cac_Contact:[{cbc_Telephone:d(p.phone),...(p.email?{cbc_ElectronicMail:d(p.email)}:{})}]});
const taxScheme=()=>[{cbc_ID:[{_:'OTH',schemeID:'UN/ECE 5153',schemeAgencyID:'6'}]}];
export const EINV_C43_R3_SUBMISSION_ENABLED=false;
export function buildInvoiceCandidateC43R3({evidence,financial,checkout,mapping,supplier,buyer,issueTimestamp}={}){
 if(evidence?.version!=='C4.3-READONLY'||financial?.version!=='C4.3-R2-FINANCIAL-PREVIEW'||financial.status!=='FINANCIAL_TREATMENT_RECONCILED'||String(evidence.saleId)!==String(financial.saleId))throw F('FINANCIAL_RECONCILIATION_REQUIRED');
 if(!checkout||checkout.version!=='C4.1'||!mapping||mapping.version!=='C4.2B'||String(checkout.sale_id)!==String(evidence.saleId)||String(mapping.sale_id)!==String(evidence.saleId))throw F('SNAPSHOTS_REQUIRED');
 const gaps=[...partyGaps(supplier,'supplier'),...partyGaps(buyer,'buyer')];
 if(!/^\d{5}$/.test(supplier?.msicCode??''))gaps.push('supplier.msicCode');
 if(!t(supplier?.businessActivityDescription,300))gaps.push('supplier.businessActivityDescription');
 if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/.test(issueTimestamp??'')||Number.isNaN(Date.parse(issueTimestamp)))gaps.push('issueTimestampUTC');
 if(!t(evidence.receiptNumber,50))gaps.push('invoiceId');
 const sources=new Map(checkout.lines.map(l=>[String(l.sale_line_id),l]));
 const verified=new Map(mapping.lines.map(l=>[String(l.sale_line_id),l]));
 if(sources.size!==checkout.lines.length||verified.size!==mapping.lines.length)throw F('DUPLICATE_SOURCE_LINES');
 const rows=[];
 for(const entry of financial.lineTreatments){
  const l=sources.get(String(entry.saleLineId)),m=verified.get(String(entry.saleLineId));
  if(!l||!m||String(l.product_id)!==String(entry.productId)||String(m.product_id)!==String(entry.productId)||m.mapping_confirmed!==true)throw F('SOURCE_LINE_MISMATCH');
  if(!t(l.product_name,300))gaps.push(`line.${entry.saleLineId}.description`);
  if(!/^(0|[1-9]\d{0,12})\.\d{3}$/.test(String(l.quantity))||Number(l.quantity)<=0)gaps.push(`line.${entry.saleLineId}.quantity`);
  if(!/^(0|[1-9]\d{0,12})\.\d{4}$/.test(String(l.unit_price)))gaps.push(`line.${entry.saleLineId}.price`);
  if(!/^\d{3}$/.test(m.lhdn_classification??''))gaps.push(`line.${entry.saleLineId}.classification`);
  if(!/^[A-Z0-9]{2,3}$/.test(m.ubl_unit_code??''))gaps.push(`line.${entry.saleLineId}.unitCode`);
  if(m.lhdn_tax_type_code!==entry.taxTypeCode)throw F('TAX_CODE_MISMATCH');
  rows.push({entry,l,m});
 }
 if(rows.length!==evidence.lineCount||rows.length!==sources.size||rows.length!==verified.size)throw F('LINE_COUNT_MISMATCH');
 if(gaps.length)return {version:'C4.3-R3-UNSIGNED',status:'SOURCE_DATA_INCOMPLETE',saleId:String(evidence.saleId),missingSources:[...new Set(gaps)],document:null,structuralChecksPassed:false,officialSchemaValidated:false,signaturePresent:false,submissionReady:false,submissionEnabled:false};
 const invoiceLines=rows.map(({entry,l,m})=>{
  const frag=entry.ublFinancialFragment;
  const tax=frag.cac_TaxTotal[0].cbc_TaxAmount[0]._; // numeric value from reconciled R2
  return {cbc_ID:d(entry.saleLineId),cbc_InvoicedQuantity:[{_:l.quantity,unitCode:m.ubl_unit_code}],cbc_LineExtensionAmount:frag.cbc_LineExtensionAmount,
   ...(frag.cac_AllowanceCharge?{cac_AllowanceCharge:frag.cac_AllowanceCharge}:{}),
   cac_TaxTotal:[{cbc_TaxAmount:a(tax),cac_TaxSubtotal:[{cbc_TaxableAmount:a(entry.net),cbc_TaxAmount:a(tax),cac_TaxCategory:[{cbc_ID:d(entry.taxTypeCode),cac_TaxScheme:taxScheme()}]}]}],
   cac_Item:[{cbc_Description:d(l.product_name),cac_CommodityClassification:[{cbc_ItemClassificationCode:[{_:m.lhdn_classification,listID:'CLASS'}]}]}],
   cac_Price:[{cbc_PriceAmount:a(l.unit_price)}]};
 });
 const invo={cbc_ID:d(evidence.receiptNumber),cbc_IssueDate:d(issueTimestamp.slice(0,10)),cbc_IssueTime:d(issueTimestamp.slice(11)),cbc_InvoiceTypeCode:[{_:'01',listVersionID:'1.1'}],cbc_DocumentCurrencyCode:d('MYR'),
  cac_AccountingSupplierParty:[{cac_Party:[{...party(supplier),cbc_IndustryClassificationCode:[{_:supplier.msicCode,name:supplier.businessActivityDescription}]}]}],
  cac_AccountingCustomerParty:[{cac_Party:[party(buyer)]}],
  ...financial.ublFinancialFragment,cac_InvoiceLine:invoiceLines};
 const document={_DRAFT_ONLY:true,Invoice:[invo]};
 const structural=validateInvoiceCandidateC43R3(document);
 if(!structural.ok)throw F('STRUCTURAL_CHECK_FAILED');
 return {version:'C4.3-R3-UNSIGNED',status:'UNSIGNED_STRUCTURAL_PREVIEW',saleId:String(evidence.saleId),receiptNumber:evidence.receiptNumber,document,
  structuralChecksPassed:true,officialSchemaValidated:false,signaturePresent:false,submissionReady:false,submissionEnabled:false,
  sourceEvidenceSha256:financial.sourceEvidenceSha256,warning:'Local structural checks only. No official UBL XSD/MyInvois SDK validation, signing or submission.'};
}
export function validateInvoiceCandidateC43R3(doc){
 const x=doc?.Invoice?.[0];if(!doc?._DRAFT_ONLY||!x||!Array.isArray(x.cac_InvoiceLine)||!x.cac_InvoiceLine.length)return {ok:false,code:'MISSING_INVOICE'};
 const fields=['cbc_ID','cbc_IssueDate','cbc_IssueTime','cbc_InvoiceTypeCode','cbc_DocumentCurrencyCode','cac_AccountingSupplierParty','cac_AccountingCustomerParty','cac_TaxTotal','cac_LegalMonetaryTotal'];
 if(fields.some(k=>!Array.isArray(x[k])||x[k].length!==1)||x.cac_Signature)return {ok:false,code:'REQUIRED_FIELD_OR_SIGNATURE'};
 if(x.cbc_InvoiceTypeCode[0]._!=='01'||x.cbc_InvoiceTypeCode[0].listVersionID!=='1.1')return {ok:false,code:'VERSION'};
 const mt=x.cac_LegalMonetaryTotal[0];if(!['cbc_LineExtensionAmount','cbc_TaxExclusiveAmount','cbc_TaxInclusiveAmount','cbc_PayableAmount'].every(k=>mt[k]?.[0]?.currencyID==='MYR'))return {ok:false,code:'MONEY'};
 if(x.cac_InvoiceLine.some(l=>!l.cbc_ID?.length||!l.cbc_InvoicedQuantity?.[0]?.unitCode||!l.cac_Item?.[0]?.cac_CommodityClassification?.[0]?.cbc_ItemClassificationCode?.[0]?._||!l.cac_TaxTotal?.[0]?.cac_TaxSubtotal?.length||!l.cac_Price?.[0]?.cbc_PriceAmount?.length))return {ok:false,code:'LINE'};
 return {ok:true,code:'LOCAL_STRUCTURE_ONLY'};
}
export async function loadInvoiceCandidateC43R3(req,{issueTimestamp}={}){
 if(!['OWNER','ADMIN'].includes(req.auth?.user?.role_code)||!req.auth?.user?.permissions?.includes('einvoice_settings.view'))throw F('FORBIDDEN',403);
 const evidence=await loadReductionDocumentEvidenceC43(req);
 const financial=previewUblTreatmentC43R2(evidence);
 const conn=await req.auth.pool.getConnection();
 try{
  const [[checkoutRow]]=await conn.execute('SELECT snapshot_json AS doc FROM einvoice_checkout_snapshots WHERE sale_id=?',[evidence.saleId]);
  const [[mappingRow]]=await conn.execute('SELECT evidence_json AS doc FROM einvoice_line_mapping_evidence_c42b WHERE sale_id=?',[evidence.saleId]);
  const [[person]]=await conn.execute(`SELECT p.registered_name AS name,p.phone,p.email,p.address_line1 AS address1,p.address_line2 AS address2,p.address_line3 AS address3,p.postcode,p.city,p.einvoice_state_code AS state,p.country,p.msic_code AS msicCode,p.business_activity_description AS businessActivityDescription,r.tin,r.ssm_registration_number AS identificationNumber FROM company_profiles p JOIN company_registrations r ON r.id=p.id WHERE p.id=1`);
  const [[buyerRow]]=await conn.execute("SELECT buyer_cipher FROM einvoice_customer_requests WHERE sale_id=? AND status='REQUESTED' LIMIT 1",[evidence.saleId]);
  const buyer=buyerRow?.buyer_cipher?JSON.parse(decryptCredential(buyerRow.buyer_cipher)):null;
  const supplier=person?{...person,identificationType:'BRN',country:person.country==='MY'?'MYS':person.country}:null;
  const result=buildInvoiceCandidateC43R3({evidence,financial,checkout:typeof checkoutRow?.doc==='string'?JSON.parse(checkoutRow.doc):checkoutRow?.doc,mapping:typeof mappingRow?.doc==='string'?JSON.parse(mappingRow.doc):mappingRow?.doc,supplier,buyer:buyer?{...buyer,name:buyer.buyerName}:null,issueTimestamp:issueTimestamp||new Date().toISOString().replace(/\.\d{3}Z$/,'Z')});
  return result;
 }finally{conn.release();}
}

export async function getInvoiceCandidateC43R3(req,res){
 const result=await loadInvoiceCandidateC43R3(req);
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(result);
}
