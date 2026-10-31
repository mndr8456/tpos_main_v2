// Exact decimal POS draft pricing; no external dependencies.
export function amountSen(value){
 const s=String(value);
 if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(s))throw Error('POS_INVALID_MONEY');
 const [whole,fraction='']=s.split('.');
 const mills=BigInt(whole)*10000n+BigInt((fraction+'0000').slice(0,4));
 return Number((mills+50n)/100n);
}
export const format=sen=>(sen/100).toFixed(2);
export function totalDraftLines(rows){
 let total=0n;
 const lines=rows.map(r=>{
  const quantity=String(r.quantity),unit=String(r.unit_price);
  if(!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(quantity)||Number(quantity)<=0||Number(quantity)>1000)throw Error('POS_INVALID_QUANTITY');
  if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,4})?$/.test(unit))throw Error('POS_INVALID_MONEY');
  const [qw,qf='']=quantity.split('.');const [pw,pf='']=unit.split('.');
  const q=BigInt(qw)*1000n+BigInt((qf+'000').slice(0,3));
  const p=BigInt(pw)*10000n+BigInt((pf+'0000').slice(0,4));
  // MYR to sen, exact half-up at each line: 4-decimal unit price x 3-decimal qty.
  const line=(q*p+50000n)/100000n;
  total+=line;
  if(line>99999999999n||total>99999999999n)throw Error('POS_AMOUNT_OVERFLOW');
  return {...r,quantity,unitPrice:unit,lineTotal:format(Number(line)),lineSen:Number(line)};
 });
 return {lines,subtotal:format(Number(total)),subtotalSen:Number(total)};
}
