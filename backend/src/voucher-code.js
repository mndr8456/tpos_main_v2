import {randomBytes} from 'node:crypto';

// Unpredictable tenant-scoped bearer code. 80 bits of CSPRNG entropy, rendered
// with unambiguous uppercase characters for both Code 128 and QR printing.
const ALPHABET='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function generateVoucherCode(bytes=randomBytes(10)){
 if(!Buffer.isBuffer(bytes)||bytes.length!==10)throw new TypeError('VOUCHER_CODE_RANDOM_BYTES_INVALID');
 let number=BigInt(`0x${bytes.toString('hex')}`),suffix='';
 for(let i=0;i<16;i++){
  suffix=ALPHABET[Number(number&31n)]+suffix;
  number>>=5n;
 }
 return `VCH-${suffix}`;
}
