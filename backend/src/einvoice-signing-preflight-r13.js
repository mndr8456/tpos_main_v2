// EINV-R1.3 Phase C1: offline X.509 identity/key/certificate checks.
// DO NOT pass these values to logs or to the UI. No signing or submission happens here.
import {X509Certificate,createPrivateKey,sign,verify,randomBytes} from 'node:crypto';

const failure=(code)=>Object.freeze({ok:false,code,canSign:false});
function normalizedRegistration(value) {return String(value??'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
export function inspectMyInvoisSigningMaterial({certificatePem,privateKeyPem,passphrase,expectedTin,expectedRegistration,now=new Date()}={}) {
  if(typeof certificatePem!=='string'||!certificatePem.trim()||typeof privateKeyPem!=='string'||!privateKeyPem.trim()||!expectedTin||!expectedRegistration)return failure('EINV_R13_SIGNING_MATERIAL_INCOMPLETE');
  try {
    const cert=new X509Certificate(certificatePem);
    const key=createPrivateKey({key:privateKeyPem,format:'pem',passphrase});
    if(key.asymmetricKeyType!=='rsa'||cert.publicKey.asymmetricKeyType!=='rsa')return failure('EINV_R13_RSA_CERTIFICATE_REQUIRED');
    const at=new Date(now).getTime();
    if(!Number.isFinite(at)||at<Date.parse(cert.validFrom)||at>Date.parse(cert.validTo))return failure('EINV_R13_CERTIFICATE_NOT_VALID_NOW');
    if(cert.ca||!cert.keyUsage?.includes('Digital Signature'))return failure('EINV_R13_CERTIFICATE_DIGITAL_SIGNATURE_REQUIRED');
    const payload=randomBytes(32);
    const signature=sign('RSA-SHA256',payload,key);
    if(!verify('RSA-SHA256',payload,cert.publicKey,signature))return failure('EINV_R13_PRIVATE_KEY_MISMATCH');
    // TIN/BRN must be attested by authoritative certificate profile, not guessed from CN.
    // CA trust and MyInvois representative permission require separate verification.
    return Object.freeze({ok:true,code:'EINV_R13_KEY_PAIR_MATCHES_CERTIFICATE',canSign:false,
      requires:['MALAYSIA_CA_TRUST_VALIDATION','CERTIFICATE_TIN_BIZ_REG_MATCH','REPRESENTATIVE_AUTHORIZATION','XADES_CANONICALIZATION']});
  }catch{return failure('EINV_R13_CERTIFICATE_OR_KEY_INVALID');}
}
export const EINV_R13_SIGNED_SUBMISSION_ENABLED=false;
