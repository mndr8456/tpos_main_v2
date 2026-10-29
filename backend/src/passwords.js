import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const params = {N:16384,r:8,p:1};
export function passwordAllowed(value) {
  return typeof value==='string' && value.length>=12 && value.length<=128 && /[A-Za-z]/.test(value) && /[0-9]/.test(value);
}
export async function hashPassword(value) {
  if (!passwordAllowed(value)) throw Object.assign(new Error('Password must be 12-128 characters and contain a letter and number'),{status:400});
  const salt=randomBytes(16).toString('hex');
  const key=await scrypt(value,Buffer.from(salt,'hex'),64,params);
  return `scrypt$16384$8$1$${salt}$${key.toString('hex')}`;
}
export async function verifyPassword(value, encoded) {
  const [alg,n,r,p,salt,digest]=String(encoded || '').split('$');
  if(alg!=='scrypt'||n!=='16384'||r!=='8'||p!=='1'|| !/^[a-f0-9]{32}$/.test(salt||'') || !/^[a-f0-9]{128}$/.test(digest||'')) return false;
  const key=await scrypt(String(value),Buffer.from(salt,'hex'),64,params);
  return timingSafeEqual(key,Buffer.from(digest,'hex'));
}
export const tokenHash = token => createHash('sha256').update(token).digest('hex');
export const freshToken = () => randomBytes(32).toString('base64url');
