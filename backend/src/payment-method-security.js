import {createCipheriv,randomBytes} from 'node:crypto';
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
export function encryptPaymentCredential(value,keyHex=process.env.PAYMENT_METHODS_ENCRYPTION_KEY){
 if(!/^[a-fA-F0-9]{64}$/.test(keyHex||''))throw fail('PAYMENT_ENCRYPTION_KEY_NOT_CONFIGURED',503);
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),iv);
 const body=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
 return `v1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${body.toString('base64')}`;
}
export function checkPaymentImage(mime,base64){
 if(!['image/png','image/jpeg','image/webp'].includes(mime))throw fail('IMAGE_TYPE_UNSUPPORTED',400);
 if(typeof base64!=='string'||!base64.length||base64.length>1_400_000||!/^[-A-Za-z0-9+/=]+$/.test(base64))throw fail('IMAGE_TOO_LARGE_OR_INVALID',400);
 const bytes=Buffer.from(base64,'base64');
 if(!bytes.length||bytes.length>1_048_576)throw fail('IMAGE_TOO_LARGE_OR_INVALID',400);
 const png=bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 const webp=bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!(mime==='image/png'&&png||mime==='image/jpeg'&&jpg||mime==='image/webp'&&webp))throw fail('IMAGE_SIGNATURE_MISMATCH',400);
 return bytes;
}
export function publicPaymentState(row){
 return {id:String(row.id),branchId:String(row.branch_id),methodCode:row.method_code,
 isActive:Boolean(row.is_active),providerName:row.provider_name||'',providerApiUrl:row.provider_api_url||'',
 merchantRef:row.provider_merchant_ref||'',terminalRef:row.provider_terminal_ref||'',
 hasApiKey:Boolean(row.api_key_configured),hasImage:Boolean(row.has_image),
 integrationStatus:row.method_code==='SARA_MYKASIH'?'OFFICIAL_PROVIDER_NOT_CONNECTED':'NOT_CONNECTED',
 updatedAt:row.updated_at||null};
}
