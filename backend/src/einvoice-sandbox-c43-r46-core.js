// R4.6 MyInvois JSON 1.1 signing and submit-API envelope. Pure functions: no I/O.
import {X509Certificate,createPrivateKey,createHash,sign,verify,constants} from 'node:crypto';
const dig=(data)=>createHash('sha256').update(data).digest('base64');
export const digestHex=(data)=>createHash('sha256').update(data).digest('hex');
const wrap=s=>[{_:s}];
const ALG='http://www.w3.org/2001/04/xmlenc#sha256';
const RSA='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const URI='urn:oasis:names:specification:ubl:dsig:enveloped:xades';
const SIG_ID='urn:oasis:names:specification:ubl:signature:Invoice';
const issue=(s)=>Object.assign(new Error(s),{status:409});
const clean=(s)=>String(s??'').replace(/[^0-9A-Za-z]/g,'').toUpperCase();
const value=(a)=>Array.isArray(a)&&a.length===1?a[0]?._:null;
export function assessSandboxDocumentC43R46(doc,{now=new Date(),xsdValid=false,environment='SANDBOX',maxAgeMinutes=0}={}) {
 const i=doc?.Invoice?.[0];if(!xsdValid)return {ready:false,code:'R46_NORMATIVE_XSD_REQUIRED'};
 if(environment!=='SANDBOX')return {ready:false,code:'R46_SANDBOX_ONLY'};
 if(!i||doc.Invoice.length!==1||i.UBLExtensions||i.Signature)return {ready:false,code:'R46_UNSIGNED_CANONICAL_DOCUMENT_REQUIRED'};
 if(value(i.InvoiceTypeCode)!=='01'||i.InvoiceTypeCode?.[0]?.listVersionID!=='1.1')return {ready:false,code:'R46_INVOICE_11_REQUIRED'};
 const id=value(i.ID),date=value(i.IssueDate),time=value(i.IssueTime);
 if(!id||String(id).length>50||!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!/^\d{2}:\d{2}:\d{2}Z$/.test(time||''))return {ready:false,code:'R46_INVOICE_ID_OR_UTC_REQUIRED'};
 const issued=Date.parse(`${date}T${time}`),nowMs=now.getTime();
 if(!Number.isFinite(issued)||!Number.isFinite(nowMs)||issued>nowMs+60_000||nowMs-issued>maxAgeMinutes*60_000)return {ready:false,code:'R46_ISSUE_TIME_OUTSIDE_ALLOWED_WINDOW'};
 if(!Array.isArray(i.InvoiceLine)||!i.InvoiceLine.length)return {ready:false,code:'R46_LINES_REQUIRED'};
 return {ready:true,code:'R46_DOCUMENT_PRECHECK_PASSED',invoiceCode:id};
}
export function verifySignerIdentityC43R46(certPem,{tin,registration,now=new Date()}={}){
 try{
  const c=new X509Certificate(certPem);if(c.ca||c.publicKey.asymmetricKeyType!=='rsa')return {ready:false,code:'R46_RSA_END_ENTITY_CERT_REQUIRED'};
  if(now.getTime()<Date.parse(c.validFrom)||now.getTime()>Date.parse(c.validTo))return {ready:false,code:'R46_CERT_EXPIRED_OR_NOT_YET_VALID'};
  // Verify exact subject attributes from the CA-issued certificate. Never infer TIN/BRN from CN.
  const subject=c.subject.split(/\n/).map(x=>x.trim());
  const attr=name=>subject.find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
  const crtTin=attr('2.5.4.97')||attr('OID.2.5.4.97')||attr('organizationIdentifier');
  const crtBrn=attr('serialNumber')||attr('2.5.4.5');
  if(!crtTin||!crtBrn||clean(crtTin)!==clean(tin)||clean(crtBrn)!==clean(registration))return {ready:false,code:'R46_CERT_SUPPLIER_IDENTITY_UNVERIFIED'};
  return {ready:true,code:'R46_CERT_IDENTITY_MATCH',certificateFingerprint:c.fingerprint256.replaceAll(':','').toLowerCase()};
 }catch{return {ready:false,code:'R46_CERTIFICATE_INVALID'};}
}
// Implements SDK JSON XAdES envelope. Cryptographic proof is independently verified, but
// Malaysian CA trust, non-repudiation/EKU and taxpayer authorization must be proven separately.
export function signSdkInvoiceJsonC43R46(doc,{certificatePem,privateKeyPem,passphrase,now=new Date()}={}){
 if(!doc?.Invoice?.[0]||doc.Invoice[0].UBLExtensions||doc.Invoice[0].Signature)throw issue('R46_UNSIGNED_DOCUMENT_REQUIRED');
 let cert,key;try{cert=new X509Certificate(certificatePem);key=createPrivateKey({key:privateKeyPem,passphrase});}catch{throw issue('R46_KEY_OR_CERT_INVALID');}
 if(cert.publicKey.asymmetricKeyType!=='rsa'||key.asymmetricKeyType!=='rsa')throw issue('R46_RSA_REQUIRED');
 const nonce=Buffer.from('R46_SIGNER_KEY_MATCH');
 if(!verify('RSA-SHA256',nonce,cert.publicKey,sign('RSA-SHA256',nonce,key)))throw issue('R46_CERT_KEY_MISMATCH');
 const body=JSON.stringify(doc);const docDigest=dig(body);const certDigest=dig(cert.raw);
 const signingTime=now.toISOString().replace(/\.\d{3}Z$/,'Z');
 const issuer=cert.issuer.split('\n').map(x=>x.trim()).join(', ');
 const serial=BigInt('0x'+cert.serialNumber).toString(10);
 const props={Target:'signature',SignedProperties:[{Id:'id-xades-signed-props',SignedSignatureProperties:[{
  SigningTime:wrap(signingTime),SigningCertificate:[{Cert:[{CertDigest:[{DigestMethod:[{_:'',Algorithm:ALG}],DigestValue:wrap(certDigest)}],IssuerSerial:[{X509IssuerName:wrap(issuer),X509SerialNumber:wrap(serial)}]}]}]
 }]}]};
 const propsDigest=dig(JSON.stringify(props));
 const signature=sign('RSA-SHA256',Buffer.from(body,'utf8'),key).toString('base64');
 if(!verify('RSA-SHA256',Buffer.from(body,'utf8'),cert.publicKey,Buffer.from(signature,'base64')))throw issue('R46_SIGN_VERIFY_FAILED');
 const reference=(type,uri,digestValue)=>({Type:type,URI:uri,DigestMethod:[{_:'',Algorithm:ALG}],DigestValue:wrap(digestValue)});
 const signedInfo={SignatureMethod:[{_:'',Algorithm:RSA}],Reference:[reference('http://uri.etsi.org/01903/v1.3.2#SignedProperties','#id-xades-signed-props',propsDigest),reference('','',docDigest)]};
 const s={Id:'signature',Object:[{QualifyingProperties:[props]}],KeyInfo:[{X509Data:[{X509Certificate:wrap(cert.raw.toString('base64')),X509SubjectName:wrap(cert.subject.split('\n').map(x=>x.trim()).join(', ')),X509IssuerSerial:[{X509IssuerName:wrap(issuer),X509SerialNumber:wrap(serial)}]}]}],SignatureValue:wrap(signature),SignedInfo:[signedInfo]};
 const ext={UBLExtension:[{ExtensionURI:wrap(URI),ExtensionContent:[{UBLDocumentSignatures:[{SignatureInformation:[{ID:wrap('urn:oasis:names:specification:ubl:signature:1'),ReferencedSignatureID:wrap(SIG_ID),Signature:[s]}]}]}]}]};
 const signed=structuredClone(doc);signed.Invoice[0]={UBLExtensions:[ext],...signed.Invoice[0],Signature:[{ID:wrap(SIG_ID),SignatureMethod:wrap(URI)}]};
 const json=JSON.stringify(signed);
 if(Buffer.byteLength(json)>300_000)throw issue('R46_DOCUMENT_SIZE_EXCEEDED');
 return {json,documentHash:digestHex(Buffer.from(json)),codeNumber:String(value(doc.Invoice[0].ID)),signatureCryptographicallyVerified:true,certificateFingerprint:cert.fingerprint256.replaceAll(':','').toLowerCase()};
}
export function buildSubmitEnvelopeC43R46(signed){
 if(!signed?.signatureCryptographicallyVerified||!/^[a-f0-9]{64}$/.test(signed.documentHash)||!signed.codeNumber)throw issue('R46_SIGNED_DOCUMENT_REQUIRED');
 return {documents:[{format:'JSON',document:Buffer.from(signed.json,'utf8').toString('base64'),documentHash:signed.documentHash,codeNumber:signed.codeNumber}]};
}
export function summarizeSubmitReplyC43R46(http,data,codeNumber){
 if(http!==202)return http>=400&&http<500?{status:'REJECTED',code:http===422?'LHDN_SUBMISSION_REJECTED_422':`LHDN_HTTP_${http}`,submissionUID:null,uuid:null}:{status:'SUBMISSION_UNKNOWN',code:'LHDN_REMOTE_RESPONSE_UNCERTAIN',submissionUID:null,uuid:null};
 const accepted=Array.isArray(data?.acceptedDocuments)?data.acceptedDocuments:[];
 const rejected=Array.isArray(data?.rejectedDocuments)?data.rejectedDocuments:[];
 const item=accepted.find(x=>x.invoiceCodeNumber===codeNumber);
 if(typeof data?.submissionUID==='string'&&/^[A-Za-z0-9]{12,120}$/.test(data.submissionUID)&&/^[A-Za-z0-9]{12,120}$/.test(item?.uuid??'')&&accepted.length===1&&rejected.length===0)return {status:'SUBMITTED',code:'LHDN_SUBMITTED_PENDING_VALIDATION',submissionUID:data.submissionUID,uuid:item.uuid};
 if(rejected.find(x=>x.invoiceCodeNumber===codeNumber))return {status:'REJECTED',code:'LHDN_DOCUMENT_REJECTED',submissionUID:data?.submissionUID??null,uuid:null};
 return {status:'SUBMISSION_UNKNOWN',code:'LHDN_SUBMISSION_RESPONSE_AMBIGUOUS',submissionUID:data?.submissionUID??null,uuid:null};
}
