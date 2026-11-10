// GET-only; captures R4.1 successful read-only document, applies machine-readable schema profile.
import {getOfflineUblRuleAuditC43R41} from './einvoice-ubl-offline-audit-c43-r41.js';
import {validateUblProfileJsonSchemaC43R42,C43_R42_SCHEMA_SCOPE} from './einvoice-ubl-schema-c43-r42-core.js';
export function evaluateSchemaProfileC43R42(input){
 const ready=input?.status==='OFFLINE_RULE_CHECKS_PASSED_UNSIGNED'&&input?.offlineRuleChecksPassed===true&&input?.sdkDocument;
 const issues=ready?validateUblProfileJsonSchemaC43R42(input.sdkDocument):[{path:'$',code:'R41_OFFLINE_RULES_REQUIRED'}];
 const passed=!!ready&&issues.length===0;
 return {version:'C4.3-R4.2',saleId:input?.saleId??null,status:passed?'OFFLINE_PROFILE_SCHEMA_PASSED_UNSIGNED':'OFFLINE_PROFILE_SCHEMA_GAPS',
  issues,offlineRuleChecksPassed:input?.offlineRuleChecksPassed===true,
  offlineProfileSchemaValidated:passed,offlineJsonSchemaValidated:false,normativeUblSchemaValidated:false,
  officialSchemaValidated:false,signaturePresent:false,submissionReady:false,submissionEnabled:false,
  schemaScope:C43_R42_SCHEMA_SCOPE,sdkDocument:passed?input.sdkDocument:null};
}
export async function getOfflineUblSchemaProfileC43R42(req,res){
 let source;
 const capture={set(){return this;},json(value){source=value;return this;}};
 await getOfflineUblRuleAuditC43R41(req,capture);
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(evaluateSchemaProfileC43R42(source));
}
