import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
const bad=()=>Object.assign(new Error('EINVOICE_ENCRYPTION_KEY_NOT_CONFIGURED'),{status:503});
function key(){const raw=process.env.EINVOICE_ENCRYPTION_KEY;if(!/^[a-f0-9]{64}$/i.test(raw||''))throw bad();return Buffer.from(raw,'hex');}
export function encryptCredential(secret){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const ct=Buffer.concat([c.update(secret,'utf8'),c.final()]);return ['v1',iv.toString('base64'),c.getAuthTag().toString('base64'),ct.toString('base64')].join(':');}
export function decryptCredential(payload){const [version,iv,tag,ct]=String(payload).split(':');if(version!=='v1'||!iv||!tag||!ct)throw Object.assign(new Error('EINVOICE_CREDENTIAL_INVALID'),{status:503});const d=createDecipheriv('aes-256-gcm',key(),Buffer.from(iv,'base64'));d.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([d.update(Buffer.from(ct,'base64')),d.final()]).toString('utf8');}
