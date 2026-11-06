// Encrypt transaction evidence at rest (AES-256-GCM). A missing key fails closed;
// no sensitive receipt image may silently be stored as plaintext.
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const fail=()=>Object.assign(new Error('POS_PAYMENT_EVIDENCE_KEY_NOT_CONFIGURED'),{status:503});
function key(){
 const hex=process.env.PAYMENT_EVIDENCE_ENCRYPTION_KEY;
 if(!/^[0-9a-fA-F]{64}$/.test(hex||''))throw fail();
 return Buffer.from(hex,'hex');
}
export function encryptPaymentEvidence(data){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);
 const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
 return Buffer.concat([Buffer.from('TP2E'),iv,cipher.getAuthTag(),encrypted]);
}
export function decryptPaymentEvidence(data){
 const bytes=Buffer.from(data);
 if(bytes.length<33||bytes.toString('ascii',0,4)!=='TP2E')throw Object.assign(new Error('POS_PAYMENT_EVIDENCE_INVALID'),{status:409});
 const decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(4,16));
 decipher.setAuthTag(bytes.subarray(16,32));
 return Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()]);
}
