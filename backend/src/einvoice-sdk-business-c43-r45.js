// C4.3 R4.5: protected, deterministic offline audit. No MyInvois API calls.
import {getLocalUblXsdValidationC43R44} from './einvoice-ubl-xsd-c43-r44.js';
import {getNormativeCompatibilityC43R43} from './einvoice-ubl-normative-audit-c43-r43.js';
import {auditMyInvoisBusinessRulesC43R45} from './einvoice-sdk-business-c43-r45-core.js';
export async function getMyInvoisOfflineBusinessAuditC43R45(req,res){
 let xsd;const capture={set(){return this;},json(value){xsd=value;return this;}};
 await getLocalUblXsdValidationC43R44(req,capture);
 let canonical;const privateCapture={set(){return this;},json(value){canonical=value;return this;}};
 if(xsd?.status==='LOCAL_XSD_VALID')await getNormativeCompatibilityC43R43(req,privateCapture);
 const matched=canonical?.status==='NORMATIVE_COMPATIBILITY_CHECKS_PASSED_UNSIGNED'&&String(canonical.saleId)===String(xsd?.saleId)&&canonical.sdkDocument?.Invoice?.[0]?.InvoiceLine?.length===xsd?.lineCount&&String(canonical.sdkDocument?.Invoice?.[0]?.LegalMonetaryTotal?.[0]?.PayableAmount?.[0]?._)===String(xsd?.payable);
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(auditMyInvoisBusinessRulesC43R45({...xsd,sdkDocument:matched?canonical.sdkDocument:null}));
}
