// All monetary calculations use integer sen (never floating-point arithmetic).
const re=/^(0|[1-9][0-9]{0,9})(?:\.([0-9]{1,2}))?$/;
export function parseSen(value){
 if(typeof value!=='string'||!re.test(value))throw Object.assign(new Error('INVALID_MONEY_AMOUNT'),{status:400});
 const [,whole,fraction='']=value.match(re);
 return BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
}
export function fmtSen(sen){
 const amount=BigInt(sen),sign=amount<0n?'-':'';
 const positive=amount<0n?-amount:amount;
 return `${sign}${positive/100n}.${(positive%100n).toString().padStart(2,'0')}`;
}
export function expectedSen(opening,movements){
 return movements.reduce((sum,m)=>sum+(m.direction==='CASH_IN'?1n:-1n)*parseSen(String(m.amount)),parseSen(String(opening)));
}
