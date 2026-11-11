// EINV Sandbox Invoice v1.0. Explicitly sandbox-only. Never auto-submit.
// The existing C4.3-R3 unsigned v1.1 draft remains unchanged and read-only.
import {createHash} from 'node:crypto';
import {decryptCredential,encryptCredential} from './einvoice-crypto.js';
import {loadInvoiceCandidateC43R3} from './einvoice-ubl-invoice-c43-r3.js';

const HOST='https://preprod-api.myinvois.hasil.gov.my';
const fail=(code,status=409)=>Object.assign(new Error(`EINV_SANDBOX_V10_${code}`),{status});
const saleId=v=>/^[1-9][0-9]{0,18}$/.test(String(v??''));
const uid=v=>/^[A-Za-z0-9]{1,120}$/.test(String(v??''));
const sanitizeStatus=v=>({Submitted:'SUBMITTED',Valid:'VALID',Invalid:'INVALID',Cancelled:'INVALID'}[v]||null);
const sha=b=>createHash('sha256').update(b).digest('hex');
const responseBody=async r=>r.json().catch(()=>null);
const safeHttp=r=>r.status===429?'RATE_LIMITED':r.status>=500?'UPSTREAM_UNAVAILABLE':`UPSTREAM_HTTP_${r.status}`;
const timeoutFetch=async(url,options,timeout=12000)=>{
 const c=new AbortController(),t=setTimeout(()=>c.abort(),timeout);
 try{return await fetch(url,{...options,redirect:'error',signal:c.signal});}finally{clearTimeout(t);}
};
function authorize(req,action){
 if(!['OWNER','ADMIN'].includes(req.auth?.user?.role_code)||!req.auth?.user?.permissions?.includes(`einvoice_documents.${action}`))throw fail('FORBIDDEN',403);
 if(!saleId(req.params.saleId))throw fail('INVALID_SALE_ID',400);
}
const configured=async pool=>{
 const [[setting]]=await pool.execute('SELECT enabled,environment FROM einvoice_settings WHERE id=1');
 if(!setting||!Number(setting.enabled)||setting.environment!=='SANDBOX')throw fail('SANDBOX_SETTINGS_REQUIRED');
 const [[credential]]=await pool.execute("SELECT client_id_cipher,client_secret_cipher,verified_at FROM einvoice_credentials WHERE environment='SANDBOX'");
 if(!credential?.verified_at)throw fail('SANDBOX_VERIFIED_CREDENTIALS_REQUIRED');
 return credential;
};
async function token(credential){
 const form=new URLSearchParams({client_id:decryptCredential(credential.client_id_cipher),client_secret:decryptCredential(credential.client_secret_cipher),grant_type:'client_credentials',scope:'InvoicingAPI'});
 let response;
 try{response=await timeoutFetch(`${HOST}/connect/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form});}
 catch{throw fail('OAUTH_NETWORK_UNKNOWN',503);}
 if(!response.ok)throw fail(`OAUTH_${safeHttp(response)}`,502);
 const json=await responseBody(response);
 if(!json?.access_token||json?.token_type!=='Bearer'||Number(json?.expires_in)<=0)throw fail('OAUTH_TOKEN_INVALID',502);
 return json.access_token;
}
/** Convert internally prefixed fields to the MyInvois UBL JSON representation. */
export function makeSandboxInvoiceV10(candidate){
 if(candidate?.status!=='UNSIGNED_STRUCTURAL_PREVIEW'||candidate.structuralChecksPassed!==true||!candidate.document?._DRAFT_ONLY||candidate.signaturePresent!==false)throw fail('RECONCILED_DRAFT_REQUIRED');
 const original=candidate.document.Invoice?.[0];
 if(original?.cbc_InvoiceTypeCode?.[0]?.listVersionID!=='1.1')throw fail('SOURCE_VERSION_MISMATCH');
 const normalize=node=>Array.isArray(node)?node.map(normalize):node&&typeof node==='object'?Object.fromEntries(Object.entries(node).map(([key,value])=>[key.replace(/^(cbc_|cac_)/,''),normalize(value)])):node;
 const invoice=normalize(original);
 invoice.InvoiceTypeCode=[{...invoice.InvoiceTypeCode[0],listVersionID:'1.0'}];
 const document={_D:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',_A:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',_B:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',Invoice:[invoice]};
 if(document.Invoice[0].Signature||document.Invoice[0].UBLExtensions)throw fail('UNSIGNED_ONLY');
 const codeNumber=String(candidate.receiptNumber||'');
 if(!codeNumber||codeNumber.length>50||invoice.ID?.[0]?._!==codeNumber)throw fail('INVOICE_CODE_MISMATCH');
 const raw=Buffer.from(JSON.stringify(document),'utf8');
 if(raw.length>300*1024)throw fail('DOCUMENT_OVER_300KB',422);
 return {version:'1.0',codeNumber,document,documentHash:sha(raw),bytes:raw.length,submission:{documents:[{format:'JSON',document:raw.toString('base64'),documentHash:sha(raw),codeNumber}]}};
}
async function build(req,submittedAt){
 const time=new Date(submittedAt);
 if(Number.isNaN(time.getTime())||time.getTime()>Date.now()+60000||Date.now()-time.getTime()>70*60*60*1000)throw fail('BUYER_REQUEST_TIMESTAMP_OUTSIDE_TEST_WINDOW');
 const candidate=await loadInvoiceCandidateC43R3(req,{issueTimestamp:time.toISOString().replace(/\.\d{3}Z$/,'Z')});
 if(candidate.status!=='UNSIGNED_STRUCTURAL_PREVIEW')return {ready:false,code:'SOURCE_DATA_INCOMPLETE',missingSources:candidate.missingSources||[]};
 const prepared=makeSandboxInvoiceV10(candidate);
 return {ready:true,candidate,prepared};
}
async function requestRow(conn,id){
 const [[row]]=await conn.execute('SELECT id,status,environment,submitted_at FROM einvoice_customer_requests WHERE sale_id=?',[id]);
 if(!row||row.status!=='REQUESTED'||row.environment!=='SANDBOX')throw fail('BUYER_REQUEST_REQUIRED');
 return row;
}
function safeRow(row){return row?{saleId:String(row.sale_id),status:row.status,version:row.document_version,documentHash:row.document_hash,submissionUID:row.submission_uid,uuid:row.lhdn_uuid,longId:row.lhdn_long_id,errorCode:row.last_error_code,submittedAt:row.submitted_at,validatedAt:row.validated_at}:null;}
const statusSql='SELECT sale_id,status,document_version,document_hash,submission_uid,lhdn_uuid,lhdn_long_id,last_error_code,submitted_at,validated_at FROM einvoice_documents WHERE sale_id=? AND environment=\'SANDBOX\' AND document_type=\'INVOICE\'';
export async function previewSandboxInvoiceV10(req,res){
 authorize(req,'prepare');await configured(req.auth.pool);
 const [existing]=await req.auth.pool.execute(statusSql,[req.params.saleId]);
 if(existing.length)return res.set('Cache-Control','no-store').json({ready:false,code:'DOCUMENT_ALREADY_REGISTERED',existing:safeRow(existing[0])});
 const request=await requestRow(req.auth.pool,req.params.saleId);
 const result=await build(req,request.submitted_at);
 return res.set('Cache-Control','no-store').json(result.ready?{ready:true,version:'1.0',codeNumber:result.prepared.codeNumber,hash:result.prepared.documentHash,bytes:result.prepared.bytes,officialSchemaValidated:false,warning:'Local preflight only; LHDN validation occurs after submission.'}:result);
}
export async function getSandboxInvoiceV10(req,res){
 authorize(req,'view');
 const [rows]=await req.auth.pool.execute(statusSql,[req.params.saleId]);
 return res.set('Cache-Control','no-store').json({document:rows.length?safeRow(rows[0]):null});
}
export async function submitSandboxInvoiceV10(req,res){
 authorize(req,'submit');
 if(req.body?.confirm!==true||!(/^[a-f0-9]{64}$/).test(req.body?.expectedHash||'')||Object.keys(req.body||{}).some(x=>!['confirm','expectedHash'].includes(x)))throw fail('EXPLICIT_CONFIRM_REQUIRED',400);
 const credential=await configured(req.auth.pool);
 const requestSnapshot=await requestRow(req.auth.pool,req.params.saleId);
 const {ready,prepared}=await build(req,requestSnapshot.submitted_at);
 if(!ready)throw fail('SOURCE_DATA_INCOMPLETE');
 if(req.body.expectedHash!==prepared.documentHash)throw fail('PREVIEW_CHANGED_RECHECK_REQUIRED');
 // Authenticate BEFORE recording submission, so an OAuth error cannot create an unknown LHDN state.
 const accessToken=await token(credential);
 const conn=await req.auth.pool.getConnection();let documentId;
 try{
  await conn.beginTransaction();
  const request=await requestRow(conn,req.params.saleId);
  const [existing]=await conn.execute(`${statusSql} FOR UPDATE`,[req.params.saleId]);
  if(existing.length)throw fail('DUPLICATE_SUBMISSION_BLOCKED');
  const [result]=await conn.execute("INSERT INTO einvoice_documents(sale_id,request_id,environment,document_type,document_version,status,document_hash,document_cipher) VALUES (?,?,'SANDBOX','INVOICE','1.0','SUBMITTING',?,?)",[req.params.saleId,request.id,prepared.documentHash,encryptCredential(JSON.stringify(prepared.document))]);
  documentId=result.insertId;
  await conn.execute("INSERT INTO einvoice_submission_attempts(document_id,attempt_number,result) VALUES (?,1,'STARTED')",[documentId]);
  await conn.execute("INSERT INTO einvoice_document_audit(document_id,actor_user_id,event_code,new_status,details_code) VALUES (?,?,'SUBMISSION_STARTED','SUBMITTING','SANDBOX_V10')",[documentId,req.auth.user.id]);
  await conn.commit();
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 let status='SUBMISSION_UNKNOWN',errorCode='NETWORK_OUTCOME_UNKNOWN',httpStatus=null,uidValue=null,uuid=null;
 try{
  const response=await timeoutFetch(`${HOST}/api/v1.0/documentsubmissions/`,{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(prepared.submission)},20000);
  httpStatus=response.status;
  const json=await responseBody(response);
  if(response.status===202){
   const accepted=Array.isArray(json?.acceptedDocuments)?json.acceptedDocuments:[];
   const rejected=Array.isArray(json?.rejectedDocuments)?json.rejectedDocuments:[];
   if(accepted.length===1&&accepted[0]?.invoiceCodeNumber===prepared.codeNumber&&uid(json?.submissionUID)&&uid(accepted[0]?.uuid)&&rejected.length===0){status='SUBMITTED';errorCode=null;uidValue=json.submissionUID;uuid=accepted[0].uuid;}
   else if(rejected.length===1&&rejected[0]?.invoiceCodeNumber===prepared.codeNumber&&accepted.length===0){status='REJECTED';errorCode='MYINVOIS_SYNC_REJECTED';}
   else errorCode='MYINVOIS_AMBIGUOUS_RESPONSE';
  }else if([400,401,403,422].includes(response.status)){
   // 422 duplicate may indicate earlier ambiguous acceptance; never auto-resubmit.
   status=response.status===422?'SUBMISSION_UNKNOWN':'REJECTED';errorCode=safeHttp(response);
  }else errorCode=safeHttp(response);
 }catch{errorCode='NETWORK_OUTCOME_UNKNOWN';}
 const finish=await req.auth.pool.getConnection();
 try{await finish.beginTransaction();
  await finish.execute('UPDATE einvoice_documents SET status=?,submission_uid=?,lhdn_uuid=?,last_error_code=?,submitted_at=IF(?=\'SUBMITTED\',UTC_TIMESTAMP(6),submitted_at) WHERE id=?',[status,uidValue,uuid,errorCode,status,documentId]);
  await finish.execute("UPDATE einvoice_submission_attempts SET result=?,http_status=?,error_code=?,submission_uid=?,finished_at=UTC_TIMESTAMP(6) WHERE document_id=? AND attempt_number=1",[status==='SUBMITTED'?'ACCEPTED':status==='REJECTED'?'REJECTED':'UNKNOWN',httpStatus,errorCode,uidValue,documentId]);
  await finish.execute('INSERT INTO einvoice_document_audit(document_id,actor_user_id,event_code,old_status,new_status,details_code) VALUES (?,?,\'SUBMISSION_RESPONSE\',\'SUBMITTING\',?,?)',[documentId,req.auth.user.id,status,errorCode]);
  await finish.commit();
 }catch(e){await finish.rollback();throw e;}finally{finish.release();}
 return res.set('Cache-Control','no-store').status(status==='SUBMITTED'?202:409).json({status,submissionUID:uidValue,uuid,errorCode,validationComplete:false});
}
export async function refreshSandboxInvoiceV10(req,res){
 authorize(req,'view');const credential=await configured(req.auth.pool);
 const [rows]=await req.auth.pool.execute(`${statusSql} AND lhdn_uuid IS NOT NULL`,[req.params.saleId]);
 const current=rows[0];if(!current)throw fail('SUBMITTED_DOCUMENT_REQUIRED');
 if(!['SUBMITTED','PROCESSING','VALID','INVALID'].includes(current.status))throw fail('DOCUMENT_STATUS_NOT_REFRESHABLE');
 if(current.status==='VALID'||current.status==='INVALID')return res.set('Cache-Control','no-store').json({document:safeRow(current)});
 const accessToken=await token(credential);
 let response;
 try{response=await timeoutFetch(`${HOST}/api/v1.0/documentsubmissions/${encodeURIComponent(current.submission_uid)}?pageNo=1&pageSize=1`,{headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'}});}catch{throw fail('STATUS_NETWORK_UNAVAILABLE',503);}
 if(!response.ok)throw fail(`STATUS_${safeHttp(response)}`,502);
 const data=await responseBody(response);
 const summary=Array.isArray(data?.documentSummary)?data.documentSummary.find(d=>d?.uuid===current.lhdn_uuid):null;
 if(data?.submissionUid!==current.submission_uid||!summary)throw fail('STATUS_RESPONSE_INVALID',502);
 const next=sanitizeStatus(summary.status);
 if(!next)throw fail('STATUS_RESPONSE_INVALID',502);
 const errorCode=next==='INVALID'?'MYINVOIS_VALIDATION_INVALID':null;
 await req.auth.pool.execute("UPDATE einvoice_documents SET status=?,last_error_code=?,lhdn_long_id=?,validated_at=IF(?='VALID',UTC_TIMESTAMP(6),validated_at) WHERE sale_id=? AND environment='SANDBOX' AND document_type='INVOICE' AND status IN ('SUBMITTED','PROCESSING')",[next,errorCode,next==='VALID'&&typeof summary.longId==='string'&&summary.longId.length<=200?summary.longId:null,next,req.params.saleId]);
 await req.auth.pool.execute("INSERT INTO einvoice_document_audit(document_id,actor_user_id,event_code,old_status,new_status,details_code) SELECT id,?,'STATUS_REFRESH',?, ?,? FROM einvoice_documents WHERE sale_id=? AND environment='SANDBOX' AND document_type='INVOICE'",[req.auth.user.id,current.status,next,errorCode,req.params.saleId]);
 const [updated]=await req.auth.pool.execute(statusSql,[req.params.saleId]);
 return res.set('Cache-Control','no-store').json({document:safeRow(updated[0]),validationComplete:next!=='SUBMITTED'});
}
