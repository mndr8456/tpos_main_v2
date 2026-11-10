// R4.1: dedicated read-only GET. Calls existing R4 once; no database mutation.
import {getSdkProfilePreviewC43R4} from './einvoice-sdk-profile-c43-r4.js';
import {auditOfflineUblC43R41} from './einvoice-ubl-offline-audit-c43-r41-core.js';
export async function getOfflineUblRuleAuditC43R41(req,res){
 let source;
 const capture={set(){return this;},json(value){source=value;return this;}};
 await getSdkProfilePreviewC43R4(req,capture);
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(auditOfflineUblC43R41(source));
}
