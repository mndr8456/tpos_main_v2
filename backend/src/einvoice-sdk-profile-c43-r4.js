// R4 separate GET adapter; no mutation, SDK schema validator or signing.
import {getInvoiceCandidateC43R3} from './einvoice-ubl-invoice-c43-r3.js';
import {validateSdkJsonProfileC43R4} from './einvoice-sdk-profile-c43-r4-core.js';
export async function getSdkProfilePreviewC43R4(req,res){
 // Reuse established R3 authenticated, read-only source handler and its fail-closed gates.
 let source;
 const capture={set(){return this;},json(value){source=value;return this;}};
 await getInvoiceCandidateC43R3(req,capture);
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(validateSdkJsonProfileC43R4(source));
}
