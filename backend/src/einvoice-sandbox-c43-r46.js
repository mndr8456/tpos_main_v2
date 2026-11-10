// C4.3 R4.6: strictly OWNER-confirmed, single-attempt Sandbox submission.
// No automatic retries or scheduled requests. Never touches POS/accounting journals.
import {readFile} from 'node:fs/promises';
import {isAbsolute,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {getMyInvoisOfflineBusinessAuditC43R45} from './einvoice-sdk-business-c43-r45.js';
import {getNormativeCompatibilityC43R43} from './einvoice-ubl-normative-audit-c43-r43.js';
import {decryptCredential,encryptCredential} from './einvoice-crypto.js';
import {assessSandboxDocumentC43R46,signSdkInvoiceJsonC43R46,buildSubmitEnvelopeC43R46,summarizeSubmitReplyC43R46,digestHex} from './einvoice-sandbox-c43-r46-core.js';
const host='https://preprod-api.myinvois.hasil.gov.my';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const verifyPy=resolve(root,'scripts/verify-einvoice-certificate-c43-r46.py');
const py=resolve(root,process.platform==='win32'?'.venv-ubl/Scripts/python.exe':'.venv-ubl/bin/python');
const err=(code,status=409)=>Object.assign(new Error(code),{status});
const scalar=(x)=>Array.isArray(x)&&x.length===1?x[0]?._:null;
const reply=(res,data,status=200)=>res.status(status).set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(data);
const owner=(req)=>req.auth?.user?.role_code==='OWNER';
const sendFlag=()=>process.env.EINVOICE_R46_SANDBOX_SEND_ENABLED==='true';
async function capture(fn,req){let v;await fn(req,{set(){return this;},json(x){v=x;return this;}});return v;}
async function localSource(req){
 const [audit,canonical]=await Promise.all([capture(getMyInvoisOfflineBusinessAuditC43R45,req),capture(getNormativeCompatibilityC43R43,req)]);
 const matched=audit?.localXsdValidated===true&&canonical?.normativeCompatibilityChecksPassed===true&&String(audit.saleId)===String(canonical.saleId)&&canonical.sdkDocument&&audit.lineCount===canonical.sdkDocument.Invoice[0].InvoiceLine.length&&String(audit.payable)===String(scalar(canonical.sdkDocument.Invoice[0].LegalMonetaryTotal?.[0]?.PayableAmount));
 return {audit,canonical:matched?canonical.sdkDocument:null};
}
async function localFile(name){
 const filename=process.env[name];if(!filename||!isAbsolute(filename))throw err('R46_SIGNER_FILES_NOT_CONFIGURED');
 const body=await readFile(filename);if(body.length>100_000)throw err('R46_SIGNER_FILE_TOO_LARGE');
 return body.toString('utf8');
}
async function validateSignerProfile(cert,ca,tin,registration){
 const pin=process.env.EINVOICE_R46_ISSUER_CA_SHA256;
 if(!/^[0-9a-f]{64}$/i.test(pin??''))return {ready:false,code:'R46_ISSUER_CA_PIN_REQUIRED'};
 let output='';let p;
 try{p=spawn(py,['-I',verifyPy],{cwd:root,windowsHide:true,stdio:['pipe','pipe','ignore']});}
 catch{return {ready:false,code:'R46_CERT_POLICY_ENGINE_NOT_AVAILABLE'};}
 return await new Promise(done=>{
  let closed=false;const finish=x=>{if(!closed){closed=true;done(x);}};
  const timeout=setTimeout(()=>{p.kill();finish({ready:false,code:'R46_CERT_POLICY_TIMEOUT'});},10000);
  p.stdout.on('data',b=>{output+=b;if(output.length>2048)p.kill();});
  p.on('error',()=>{clearTimeout(timeout);finish({ready:false,code:'R46_CERT_POLICY_ENGINE_NOT_AVAILABLE'});});
  p.on('close',code=>{clearTimeout(timeout);try{
   const v=JSON.parse(output);finish(code===0&&v?.ready===true?{ready:true,code:v.code}:{ready:false,code:/^R46_[A-Z_]+$/.test(v?.code)?v.code:'R46_CERT_POLICY_FAILED'});
  }catch{finish({ready:false,code:'R46_CERT_POLICY_FAILED'});}});
  p.stdin.on('error',()=>{});p.stdin.end(JSON.stringify({certificate:cert,issuerCA:ca,issuerCaSha256:pin,tin,registration}));
 });
}
async function signerFor(req){
 const [[company]]=await req.auth.pool.execute('SELECT r.tin AS tin,r.ssm_registration_number AS registration FROM company_profiles p JOIN company_registrations r ON r.id=p.id WHERE p.id=1');
 if(!company?.tin||!company?.registration)return {ready:false,code:'R46_SUPPLIER_IDENTITY_REQUIRED'};
 let certificatePem,privateKeyPem,issuerCA;
 try{
  [certificatePem,privateKeyPem,issuerCA]=await Promise.all([localFile('EINVOICE_R46_CERT_PEM_PATH'),localFile('EINVOICE_R46_KEY_PEM_PATH'),localFile('EINVOICE_R46_CA_PEM_PATH')]);
 }catch{return {ready:false,code:'R46_SIGNER_FILES_NOT_CONFIGURED'};}
 const proof=await validateSignerProfile(certificatePem,issuerCA,company.tin,company.registration);
 return {...proof,...(proof.ready?{certificatePem,privateKeyPem,passphrase:process.env.EINVOICE_R46_KEY_PASSPHRASE}:{} )};
}
async function sandboxSettings(req){
 const [[config]]=await req.auth.pool.execute('SELECT enabled,environment FROM einvoice_settings WHERE id=1');
 if(!config?.enabled||config.environment!=='SANDBOX')return {ready:false,code:'R46_SANDBOX_SETTINGS_NOT_ENABLED'};
 const [credentials]=await req.auth.pool.execute("SELECT client_id_cipher,client_secret_cipher FROM einvoice_credentials WHERE environment='SANDBOX' AND verified_at IS NOT NULL");
 if(credentials.length!==1)return {ready:false,code:'R46_SANDBOX_OAUTH_NOT_VERIFIED'};
 return {ready:true,credentials:credentials[0]};
}
async function buyerRequest(req,saleId){
 const [rows]=await req.auth.pool.execute("SELECT id FROM einvoice_customer_requests WHERE sale_id=? AND environment='SANDBOX' AND status='REQUESTED' LIMIT 1",[saleId]);
 return rows[0]??null;
}
async function prerequisites(req){
 if(!owner(req))return {ready:false,code:'R46_OWNER_ONLY'};
 const saleId=String(req.params.saleId||'');if(!/^[1-9]\d{0,16}$/.test(saleId))return {ready:false,code:'R46_SALE_ID_INVALID'};
 const {audit,canonical}=await localSource(req);
 if(!canonical)return {ready:false,code:'R46_LOCAL_XSD_REQUIRED',saleId};
 if(audit.status!=='OFFLINE_BUSINESS_RULES_REVIEW_REQUIRED'||audit.issues?.some(x=>x.disposition==='BLOCK'))return {ready:false,code:'R46_OFFLINE_BUSINESS_REVIEW_BLOCKED',saleId};
 const document=assessSandboxDocumentC43R46(canonical,{xsdValid:true,maxAgeMinutes:72*60});
 if(!document.ready)return {...document,saleId};
 const [request,settings]=await Promise.all([buyerRequest(req,saleId),sandboxSettings(req)]);
 if(!request)return {ready:false,code:'R46_BUYER_REQUEST_REQUIRED',saleId};
 if(!settings.ready)return {...settings,saleId};
 const signer=await signerFor(req);
 if(!signer.ready)return {ready:false,code:signer.code,saleId};
 try{signSdkInvoiceJsonC43R46(canonical,{...signer,now:new Date()});}
 catch{return {ready:false,code:'R46_SIGNER_KEY_OR_PAYLOAD_UNUSABLE',saleId};}
 const [existing]=await req.auth.pool.execute("SELECT id FROM einvoice_documents WHERE sale_id=? AND document_type='INVOICE' AND environment='SANDBOX' LIMIT 1",[saleId]);
 if(existing.length)return {ready:false,code:'R46_SUBMISSION_ALREADY_RESERVED',saleId};
 return {ready:true,code:'R46_SANDBOX_PREFLIGHT_PASSED',saleId,request,document:canonical,signer,credentials:settings.credentials,invoiceCode:document.invoiceCode,unsignedDigest:digestHex(Buffer.from(JSON.stringify(canonical),'utf8'))};
}
function publicPreflight(p){return {version:'C4.3-R4.6',status:p.code,ready:p.ready===true,environment:'SANDBOX',saleId:p.saleId??null,
 unsignedDigest:p.ready?p.unsignedDigest:null,sendEnabled:sendFlag(),ownerConfirmationRequired:true,
 lhdnAccepted:false,submissionAttempted:false,signatureCertifiedByLhdn:false,productionSubmissionEnabled:false};}
export async function sandboxPreflightC43R46(req,res){const p=await prerequisites(req);return reply(res,publicPreflight(p));}
async function oauth(credentials){
 const id=decryptCredential(credentials.client_id_cipher),secret=decryptCredential(credentials.client_secret_cipher);
 const data=new URLSearchParams({client_id:id,client_secret:secret,grant_type:'client_credentials',scope:'InvoicingAPI'});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
 try{
  const r=await fetch(host+'/connect/token',{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:data});
  if(!r.ok)throw err('R46_SANDBOX_OAUTH_REJECTED',502);
  const b=await r.json();if(b.token_type!=='Bearer'||!b.access_token||b.access_token.length>10000)throw err('R46_SANDBOX_OAUTH_INVALID',502);
  return b.access_token;
 }finally{clearTimeout(timer);}
}
async function apiGet(token,path){const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
 try{const r=await fetch(host+path,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'error',signal:ctl.signal});if(!r.ok)throw err('R46_SANDBOX_STATUS_HTTP_ERROR',502);return await r.json();}finally{clearTimeout(timer);}
}
export async function sandboxSubmitC43R46(req,res){
 if(!owner(req))throw err('R46_OWNER_ONLY',403);
 if(!sendFlag())throw err('R46_SANDBOX_SUBMISSION_DISABLED',403);
 if(req.body?.acknowledgement!=='I_CONFIRM_SANDBOX_SUBMISSION'||!/^[a-f0-9]{64}$/.test(req.body?.expectedUnsignedDigest??''))throw err('R46_OWNER_CONFIRMATION_REQUIRED');
 const p=await prerequisites(req);if(!p.ready)throw err(p.code);
 if(p.unsignedDigest!==req.body.expectedUnsignedDigest)throw err('R46_STALE_PREVIEW_DIGEST');
 const signed=signSdkInvoiceJsonC43R46(p.document,p.signer);
 const envelope=buildSubmitEnvelopeC43R46(signed);
 // OAuth before reserving a one-shot attempt; token failure must not consume the sale.
 let bearer;try{bearer=await oauth(p.credentials);}catch{throw err('R46_SANDBOX_OAUTH_REJECTED',502);}
 // One durable attempt per (tenant,sale). Lock, persist encrypted signed content,
 // commit SUBMITTING BEFORE any remote request. Unknown outcome NEVER auto retries.
 const conn=await req.auth.pool.getConnection();let documentId,attemptId;
 try{await conn.beginTransaction();
  const [old]=await conn.execute("SELECT id,status FROM einvoice_documents WHERE sale_id=? AND document_type='INVOICE' AND environment='SANDBOX' FOR UPDATE",[p.saleId]);
  if(old.length)throw err('R46_SUBMISSION_ALREADY_RESERVED');
  const [doc]=await conn.execute("INSERT INTO einvoice_documents(sale_id,request_id,environment,document_type,document_version,status,document_hash,document_cipher) VALUES (?,?,'SANDBOX','INVOICE','1.1','SUBMITTING',?,?)",[p.saleId,p.request.id,signed.documentHash,encryptCredential(signed.json)]);
  documentId=doc.insertId;
  const [attempt]=await conn.execute("INSERT INTO einvoice_submission_attempts(document_id,attempt_number,result) VALUES (?,1,'STARTED')",[documentId]);attemptId=attempt.insertId;
  await conn.execute("INSERT INTO einvoice_document_audit(document_id,actor_user_id,event_code,old_status,new_status,details_code) VALUES (?,?,'R46_SANDBOX_OWNER_CONFIRM',NULL,'SUBMITTING','ONE_SHOT')",[documentId,req.auth.user.id]);
  await conn.commit();
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw err('R46_SUBMISSION_ALREADY_RESERVED');throw e;}finally{conn.release();}
 let result={status:'SUBMISSION_UNKNOWN',code:'R46_REMOTE_OUTCOME_UNKNOWN',submissionUID:null,uuid:null},http=null;
 try{
  const token=bearer;
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),20000);
  try{
   const r=await fetch(host+'/api/v1.0/documentsubmissions/',{method:'POST',redirect:'error',signal:ctl.signal,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(envelope)});
   http=r.status;
   const b=await r.json().catch(()=>null);
   result=summarizeSubmitReplyC43R46(http,b,signed.codeNumber);
  }finally{clearTimeout(timer);}
 }catch{result={status:'SUBMISSION_UNKNOWN',code:'R46_REMOTE_OUTCOME_UNKNOWN',submissionUID:null,uuid:null};}
 const follow=await req.auth.pool.getConnection();try{await follow.beginTransaction();
  await follow.execute('UPDATE einvoice_documents SET status=?,submission_uid=?,lhdn_uuid=?,last_error_code=?,submitted_at=IF(?=\'SUBMITTED\',UTC_TIMESTAMP(6),submitted_at) WHERE id=? AND status=\'SUBMITTING\'',[result.status,result.submissionUID,result.uuid,result.code,result.status,documentId]);
  await follow.execute('UPDATE einvoice_submission_attempts SET result=?,http_status=?,error_code=?,submission_uid=?,finished_at=UTC_TIMESTAMP(6) WHERE id=?',[result.status==='SUBMITTED'?'ACCEPTED':result.status==='REJECTED'?'REJECTED':'UNKNOWN',http,result.code,result.submissionUID,attemptId]);
  await follow.execute('INSERT INTO einvoice_document_audit(document_id,actor_user_id,event_code,old_status,new_status,details_code) VALUES (?,?,\'R46_SANDBOX_SUBMIT_RESULT\',\'SUBMITTING\',?,?)',[documentId,req.auth.user.id,result.status,result.code]);
  await follow.commit();
 }catch(e){await follow.rollback();throw e;}finally{follow.release();}
 return reply(res,{status:result.status,code:result.code,submissionUID:result.submissionUID,uuid:result.uuid,officialDocumentValid:false,environment:'SANDBOX',productionSubmissionEnabled:false},result.status==='SUBMITTED'?202:result.status==='REJECTED'?422:502);
}
export async function sandboxStatusC43R46(req,res){
 if(!owner(req))throw err('R46_OWNER_ONLY',403);
 const [[doc]]=await req.auth.pool.execute("SELECT id,status,submission_uid,lhdn_uuid,lhdn_long_id,last_error_code FROM einvoice_documents WHERE sale_id=? AND environment='SANDBOX' AND document_type='INVOICE'",[req.params.saleId]);
 if(!doc)return reply(res,{status:'NOT_SUBMITTED',submissionUID:null,lhdnAccepted:false});
 if(req.method==='GET')return reply(res,{status:doc.status,submissionUID:doc.submission_uid,uuid:doc.lhdn_uuid,code:doc.last_error_code,lhdnAccepted:doc.status==='VALID',productionSubmissionEnabled:false});
 if(req.body?.acknowledgement!=='I_CONFIRM_SANDBOX_STATUS_REFRESH')throw err('R46_STATUS_CONFIRMATION_REQUIRED');
 if(!['SUBMITTED','PROCESSING'].includes(doc.status)||!/^[A-Za-z0-9]{12,120}$/.test(doc.submission_uid??'')||!doc.lhdn_uuid)throw err('R46_REFRESH_NOT_ALLOWED');
 const conn=await req.auth.pool.getConnection();let refreshAuthorized=false;
 try{await conn.beginTransaction();
  const [[locked]]=await conn.execute('SELECT id,status FROM einvoice_documents WHERE id=? FOR UPDATE',[doc.id]);
  if(!['SUBMITTED','PROCESSING'].includes(locked.status))throw err('R46_STATUS_ALREADY_FINAL');
  const [[previous]]=await conn.execute("SELECT TIMESTAMPDIFF(SECOND,occurred_at,UTC_TIMESTAMP(6)) AS secondsAgo FROM einvoice_document_audit WHERE document_id=? AND event_code='R46_STATUS_POLL' ORDER BY id DESC LIMIT 1",[doc.id]);
  if(previous&&Number(previous.secondsAgo)<5)throw err('R46_STATUS_POLL_TOO_SOON',429);
  await conn.execute("INSERT INTO einvoice_document_audit(document_id,actor_user_id,event_code,old_status,new_status,details_code) VALUES (?,?,'R46_STATUS_POLL',?,?,NULL)",[doc.id,req.auth.user.id,locked.status,locked.status]);await conn.commit();refreshAuthorized=true;
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 if(!refreshAuthorized)throw err('R46_REFRESH_NOT_ALLOWED');
 const credentials=await sandboxSettings(req);if(!credentials.ready)throw err(credentials.code);
 let result;try{result=await apiGet(await oauth(credentials.credentials),`/api/v1.0/documentsubmissions/${encodeURIComponent(doc.submission_uid)}?pageNo=1&pageSize=100`);}catch{throw err('R46_STATUS_FETCH_FAILED',502);}
 const summary=Array.isArray(result?.documentSummary)?result.documentSummary.find(x=>x.uuid===doc.lhdn_uuid):null;
 const docStatus=String(summary?.status??'').toUpperCase();const state=docStatus==='VALID'?'VALID':docStatus==='INVALID'?'INVALID':'PROCESSING';
 if(!summary)return reply(res,{status:'PROCESSING',code:'R46_DOC_NOT_IN_SUBMISSION_PAGE',lhdnAccepted:false});
 await req.auth.pool.execute("UPDATE einvoice_documents SET status=?,lhdn_long_id=IF(?='VALID',?,lhdn_long_id),validated_at=IF(? IN ('VALID','INVALID'),UTC_TIMESTAMP(6),validated_at) WHERE id=? AND status IN ('SUBMITTED','PROCESSING')",[state,state,state==='VALID'?String(summary.longId||''):null,state,doc.id]);
 return reply(res,{status:state,submissionUID:doc.submission_uid,uuid:doc.lhdn_uuid,lhdnAccepted:state==='VALID',productionSubmissionEnabled:false});
}
// Fetch detailed validation errors only AFTER LHDN reports Invalid.
// Never expose full document, taxpayer identity, raw error message or private fields.
export async function sandboxInvalidDetailsC43R46(req,res){
 if(!owner(req))throw err('R46_OWNER_ONLY',403);
 const [[doc]]=await req.auth.pool.execute("SELECT status,lhdn_uuid FROM einvoice_documents WHERE sale_id=? AND environment='SANDBOX' AND document_type='INVOICE'",[req.params.saleId]);
 if(doc?.status!=='INVALID'||!/^[A-Za-z0-9]{12,120}$/.test(doc.lhdn_uuid??''))throw err('R46_INVALID_DOCUMENT_ONLY');
 const settings=await sandboxSettings(req);if(!settings.ready)throw err(settings.code);
 let details;try{details=await apiGet(await oauth(settings.credentials),`/api/v1.0/documents/${encodeURIComponent(doc.lhdn_uuid)}/details`);}catch{throw err('R46_DETAILS_FETCH_FAILED',502);}
 if(details?.uuid!==doc.lhdn_uuid)return reply(res,{status:'DETAILS_MISMATCH',validationSteps:[],lhdnAccepted:false},502);
 const steps=Array.isArray(details?.validationResults?.validationSteps)?details.validationResults.validationSteps:[];
 const safe=steps.slice(0,30).map(x=>({
  rule:/^[\w .-]{1,100}$/.test(x.name??'')?x.name:'VALIDATION_RULE',
  status:['Valid','Invalid','Submitted'].includes(x.status)?x.status:'UNKNOWN',
  code:/^[A-Za-z0-9_.-]{1,80}$/.test(x.error?.code??'')?x.error.code:null
 }));
 return reply(res,{status:'INVALID',uuid:doc.lhdn_uuid,validationSteps:safe,lhdnAccepted:false,productionSubmissionEnabled:false});
}
