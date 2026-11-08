import {z} from 'zod';
import {encryptCredential,decryptCredential} from './einvoice-crypto.js';
const BASE_URLS=Object.freeze({SANDBOX:'https://preprod-api.myinvois.hasil.gov.my',PRODUCTION:'https://api.myinvois.hasil.gov.my'});
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const writeAllowed=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('einvoice_settings.manage');
const envSchema=z.enum(['SANDBOX','PRODUCTION']);
const updateSchema=z.object({environment:envSchema,enabled:z.boolean(),clientId:z.string().max(250).optional(),clientSecret:z.string().max(500).optional()}).strict();
const errorLabel=(e)=>e?.name==='AbortError'?'EINVOICE_CONNECTION_TIMEOUT':'EINVOICE_CONNECTION_FAILED';
// Map only SDK-documented OAuth error identifiers; never expose upstream free-text
// error_description, tokens, credentials, or untrusted response bodies to users/audit.
const OAUTH_ERRORS=Object.freeze({
 invalid_client:'EINVOICE_OAUTH_INVALID_CLIENT',
 invalid_request:'EINVOICE_OAUTH_INVALID_REQUEST',
 invalid_grant:'EINVOICE_OAUTH_INVALID_GRANT',
 unauthorised_client:'EINVOICE_OAUTH_UNAUTHORISED_CLIENT',
 unauthorized_client:'EINVOICE_OAUTH_UNAUTHORISED_CLIENT',
 unsupported_grant_type:'EINVOICE_OAUTH_UNSUPPORTED_GRANT_TYPE',
 invalid_scope:'EINVOICE_OAUTH_INVALID_SCOPE'
});
export function classifyMyInvoisOAuthFailure(status,payload){
 const oauthError=payload&&typeof payload==='object'&&typeof payload.error==='string'?payload.error:'';
 if(status===400||status===401||status===403){
  if(Object.hasOwn(OAUTH_ERRORS,oauthError))return OAUTH_ERRORS[oauthError];
  return status===403?'EINVOICE_OAUTH_ACCESS_FORBIDDEN':'EINVOICE_CREDENTIAL_REJECTED';
 }
 if(status===429)return 'EINVOICE_OAUTH_RATE_LIMITED';
 if(status>=500)return 'EINVOICE_OAUTH_SERVICE_UNAVAILABLE';
 return `EINVOICE_HTTP_${Number.isInteger(status)?status:'UNKNOWN'}`;
}
function ensureManage(req){if(!writeAllowed(req))throw fail('EINVOICE_MANAGE_REQUIRED',403);}
async function audit(conn,user,action,environment,details){await conn.execute('INSERT INTO einvoice_settings_audit_logs(actor_user_id,action_type,environment,details) VALUES(?,?,?,?)',[user,action,environment,details]);}
async function supplier(pool){const [[row]]=await pool.execute('SELECT p.registered_name AS businessName,r.tin AS tin,r.ssm_registration_number AS registrationNumber FROM company_profiles p JOIN company_registrations r ON r.id=p.id WHERE p.id=1');return row||{};}
export async function getEinvoiceSettings(req,res){
 const [[current]]=await req.auth.pool.execute('SELECT enabled,environment FROM einvoice_settings WHERE id=1');
 if(!current)throw fail('EINVOICE_SETTINGS_NOT_INITIALIZED',409);
 const [credentials]=await req.auth.pool.execute('SELECT environment,verified_at AS verifiedAt FROM einvoice_credentials');
 const company=await supplier(req.auth.pool);
 return res.set('Cache-Control','no-store').json({enabled:Boolean(current.enabled),environment:current.environment,apiBaseUrl:BASE_URLS[current.environment],company,hasCredentials:Object.fromEntries(['SANDBOX','PRODUCTION'].map(env=>[env,credentials.some(r=>r.environment===env)])),verified:Object.fromEntries(['SANDBOX','PRODUCTION'].map(env=>[env,credentials.some(r=>r.environment===env&&r.verifiedAt)])),canManage:writeAllowed(req),phase:'SETTINGS_ONLY_NO_QR_OR_SUBMISSION'});
}
export async function saveEinvoiceSettings(req,res){
 ensureManage(req);const body=updateSchema.parse(req.body);
 const hasId=typeof body.clientId==='string'&&body.clientId.trim().length>0,hasSecret=typeof body.clientSecret==='string'&&body.clientSecret.length>0;
 if(hasId!==hasSecret)throw fail('EINVOICE_CREDENTIAL_PAIR_REQUIRED');
 if((body.clientId!==undefined&&!hasId)||(body.clientSecret!==undefined&&!hasSecret))throw fail('EINVOICE_EMPTY_CREDENTIAL_NOT_ALLOWED');
 const company=await supplier(req.auth.pool);
 if(body.enabled&&!String(company.tin||'').trim())throw fail('EINVOICE_SUPPLIER_TIN_REQUIRED',409);
 const idEncrypted=hasId?encryptCredential(body.clientId.trim()):null,secretEncrypted=hasSecret?encryptCredential(body.clientSecret):null;
 const conn=await req.auth.pool.getConnection();try{
  await conn.beginTransaction();
  const [[old]]=await conn.execute('SELECT enabled,environment FROM einvoice_settings WHERE id=1 FOR UPDATE');if(!old)throw fail('EINVOICE_SETTINGS_NOT_INITIALIZED',409);
  const [saved]=await conn.execute('SELECT environment,verified_at AS verifiedAt FROM einvoice_credentials WHERE environment=? FOR UPDATE',[body.environment]);
  if(body.enabled&&(!saved.length||!saved[0].verifiedAt||hasId))throw fail('EINVOICE_TEST_CONNECTION_REQUIRED',409);
  if(hasId){await conn.execute('INSERT INTO einvoice_credentials(environment,client_id_cipher,client_secret_cipher,verified_at,updated_by) VALUES(?,?,?,NULL,?) ON DUPLICATE KEY UPDATE client_id_cipher=VALUES(client_id_cipher),client_secret_cipher=VALUES(client_secret_cipher),verified_at=NULL,updated_by=VALUES(updated_by),updated_at=UTC_TIMESTAMP(6)',[body.environment,idEncrypted,secretEncrypted,req.auth.user.id]);await audit(conn,req.auth.user.id,'CREDENTIALS_UPDATE',body.environment,'Credentials replaced; verification reset');}
  if(Boolean(old.enabled)!==body.enabled||old.environment!==body.environment){await conn.execute('UPDATE einvoice_settings SET enabled=?,environment=?,updated_by=?,updated_at=UTC_TIMESTAMP(6) WHERE id=1',[body.enabled?1:0,body.environment,req.auth.user.id]);await audit(conn,req.auth.user.id,'SETTINGS_UPDATE',body.environment,`Environment ${old.environment} to ${body.environment}; enabled ${Boolean(old.enabled)} to ${body.enabled}`);}
  await conn.commit();return res.set('Cache-Control','no-store').json({saved:true});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function testEinvoiceConnection(req,res){
 ensureManage(req);const environment=envSchema.parse(req.body?.environment);
 // Fixed, SDK-published host only. No user-provided URL or redirects/SSRF.
 const [rows]=await req.auth.pool.execute('SELECT client_id_cipher,client_secret_cipher FROM einvoice_credentials WHERE environment=?',[environment]);
 if(!rows.length)throw fail('EINVOICE_CREDENTIALS_REQUIRED',409);
 const clientId=decryptCredential(rows[0].client_id_cipher),clientSecret=decryptCredential(rows[0].client_secret_cipher);
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10000);
 let success=false,reason='EINVOICE_CONNECTION_FAILED';
 try{
  const form=new URLSearchParams({client_id:clientId,client_secret:clientSecret,grant_type:'client_credentials',scope:'InvoicingAPI'});
  const response=await fetch(`${BASE_URLS[environment]}/connect/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body:form,redirect:'error',signal:controller.signal});
  if(response.ok){const result=await response.json();success=!!result.access_token&&result.token_type==='Bearer'&&Number(result.expires_in)>0;if(!success)reason='EINVOICE_TOKEN_RESPONSE_INVALID';}
  else {const payload=await response.json().catch(()=>null);reason=classifyMyInvoisOAuthFailure(response.status,payload);}
 }catch(e){reason=errorLabel(e);}finally{clearTimeout(timeout);}
 const conn=await req.auth.pool.getConnection();try{await conn.beginTransaction();
  // Reject a stale response if credentials were replaced while the network request was running.
  const sql=success?'UPDATE einvoice_credentials SET verified_at=UTC_TIMESTAMP(6) WHERE environment=? AND client_id_cipher=? AND client_secret_cipher=?':'UPDATE einvoice_credentials SET verified_at=NULL WHERE environment=? AND client_id_cipher=? AND client_secret_cipher=?';
  const [version]=await conn.execute(sql,[environment,rows[0].client_id_cipher,rows[0].client_secret_cipher]);
  if(version.affectedRows!==1)throw fail('EINVOICE_CREDENTIAL_CHANGED_RETEST_REQUIRED',409);
  if(!success)await conn.execute('UPDATE einvoice_settings SET enabled=0 WHERE id=1 AND enabled=1 AND environment=?',[environment]);
  await audit(conn,req.auth.user.id,success?'CONNECTION_SUCCESS':'CONNECTION_FAILED',environment,success?'OAuth login successful':reason);await conn.commit();
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
 return res.set('Cache-Control','no-store').status(success?200:422).json({connected:success,code:success?'EINVOICE_CONNECTION_VERIFIED':reason,...(!success?{error:reason}:{})});
}
export async function getEinvoiceSettingsAudit(req,res){if(!['OWNER','ADMIN'].includes(req.auth.user.role_code))throw fail('EINVOICE_AUDIT_FORBIDDEN',403);
 const [rows]=await req.auth.pool.execute("SELECT a.id,u.full_name AS actorName,a.action_type AS actionType,a.environment,a.details,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recordedAt FROM einvoice_settings_audit_logs a JOIN users u ON u.id=a.actor_user_id ORDER BY a.id DESC LIMIT 100");
 return res.set('Cache-Control','no-store').json({logs:rows.map(r=>({...r,id:String(r.id)}))});}
