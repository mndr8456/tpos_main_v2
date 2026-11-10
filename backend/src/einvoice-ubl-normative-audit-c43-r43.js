// Read-only compatibility audit of OASIS UBL 2.1 XML element models against the SDK-shaped JSON profile.
// No XML serialization or XSD engine is executed, so normativeUblSchemaValidated MUST remain false.
import {getOfflineUblSchemaProfileC43R42} from './einvoice-ubl-schema-c43-r42.js';
import {auditNormativeCompatibilityC43R43,canonicalizeUblJsonOrderC43R43,C43_R43_OASIS_REFERENCE} from './einvoice-ubl-normative-audit-c43-r43-core.js';
export function evaluateNormativeCompatibilityC43R43(source){
 const ready=source?.status==='OFFLINE_PROFILE_SCHEMA_PASSED_UNSIGNED'&&source.offlineProfileSchemaValidated===true&&source.sdkDocument;
 const sourceOrderIssues=ready?auditNormativeCompatibilityC43R43(source.sdkDocument).filter(x=>x.code==='UBL_ELEMENT_SEQUENCE'||x.code==='UBL_JSON_ROOT_ORDER'):[];
 const canonical=ready?canonicalizeUblJsonOrderC43R43(source.sdkDocument):null;
 const issues=ready?auditNormativeCompatibilityC43R43(canonical):[{path:'$',code:'R42_PROFILE_SCHEMA_REQUIRED'}];
 const passed=!!ready&&issues.length===0;
 return {version:'C4.3-R4.3',saleId:source?.saleId??null,
  status:passed?'NORMATIVE_COMPATIBILITY_CHECKS_PASSED_UNSIGNED':'NORMATIVE_COMPATIBILITY_GAPS',
  issues,sourceOrderIssues,canonicalOrderingApplied:passed&&sourceOrderIssues.length>0,normativeCompatibilityChecksPassed:passed,
  normativeXsdExecuted:false,normativeUblSchemaValidated:false,offlineJsonSchemaValidated:false,
  officialSchemaValidated:false,signaturePresent:false,submissionReady:false,submissionEnabled:false,
  reference:C43_R43_OASIS_REFERENCE,
  scope:'Bounded comparison of emitted UBL 2.1 JSON field sequence/cardinality with OASIS Invoice XML vocabulary; NOT normative XSD validation. Full OASIS XSD package and XML validator required for normative pass.',
  sdkDocument:passed?canonical:null};
}
export async function getNormativeCompatibilityC43R43(req,res){
 let source;const capture={set(){return this;},json(value){source=value;return this;}};
 await getOfflineUblSchemaProfileC43R42(req,capture);
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(evaluateNormativeCompatibilityC43R43(source));
}
