// Physical notes and coins: display-only math remains exact in integer sen.
export const SHIFT_DENOMINATIONS=[
 {key:'100',label:'RM100',sen:10000n},{key:'50',label:'RM50',sen:5000n},
 {key:'20',label:'RM20',sen:2000n},{key:'10',label:'RM10',sen:1000n},
 {key:'5',label:'RM5',sen:500n},{key:'1',label:'RM1',sen:100n},
 {key:'0.50',label:'RM0.50',sen:50n},{key:'0.20',label:'RM0.20',sen:20n},
 {key:'0.10',label:'RM0.10',sen:10n},{key:'0.05',label:'RM0.05',sen:5n}
];
export function physicalCountTotal(counts){
 return SHIFT_DENOMINATIONS.reduce((sum,d)=>sum+d.sen*BigInt(counts[d.key]||0),0n);
}
export function centsAsMoney(amount){
 const sign=amount<0n?'-':'';const absolute=amount<0n?-amount:amount;
 return `${sign}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}
