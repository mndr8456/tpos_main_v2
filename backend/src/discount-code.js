import {randomBytes} from 'node:crypto';
// Unique, unpredictable identifiers for discount rules; unlike voucher codes,
// these are NOT checkout bearer tokens or individual-use entitlements.
const alphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateDiscountCode(bytes=randomBytes(10)){
 if(!Buffer.isBuffer(bytes)||bytes.length!==10)throw new TypeError('DISCOUNT_RANDOM_BYTES_INVALID');
 let n=BigInt(`0x${bytes.toString('hex')}`),suffix='';
 for(let i=0;i<16;i++){suffix=alphabet[Number(n&31n)]+suffix;n>>=5n;}
 return `DSC-${suffix}`;
}
