export const currency=value=>`RM ${Number(value??0).toFixed(2)}`;
export const moneyToSen=value=>{
 const text=String(value??'').trim();
 if(!/^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(text))return null;
 const [whole,fraction='']=text.split('.');
 return BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));
};
export const senToMYR=cents=>`${cents<0n?'-':''}RM ${(Number(cents<0n?-cents:cents)/100).toFixed(2)}`;
const auditData=value=>{
 try{const obj=typeof value==='string'?JSON.parse(value):value;return obj&&typeof obj==='object'&&!Array.isArray(obj)?obj:null;}catch{return null;}
};
export const auditDetails=entry=>{
 const value=auditData(entry.details);
 if(!value)return 'Details unavailable';
 const note=value.reason||value.notes;
 const extra=note?` · Reason: ${String(note)}`:'';
 if(entry.action_type==='OPEN')return `Opening float: ${currency(value.openingCash)}${extra}`;
 if(entry.action_type==='CASH_IN'||entry.action_type==='CASH_OUT')return `${entry.action_type==='CASH_IN'?'Cash In':'Cash Out'}: ${currency(value.amount)}${extra} · Manual expected: ${currency(value.manualExpected)}`;
 if(entry.action_type==='CLOSE'){
  const variance=Number(value.variance||0),label=variance>0?'Surplus':variance<0?'Shortage':'Balanced';
  return `Counted: ${currency(value.countedCash)} · Manual expected: ${currency(value.manualExpected)}${value.posCashSales!==undefined?` · POS Cash Sales: ${currency(value.posCashSales)} · Expected Cash: ${currency(value.totalExpected)}`:''} · ${label}: ${currency(value.variance)}${extra}${value.posCashSales===undefined?' · POS not connected':''}`;
 }
 return note?`Reason: ${String(note)}`:'Action recorded';
};
