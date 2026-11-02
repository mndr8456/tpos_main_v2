// Inventory monetary arithmetic: six-decimal quantities and eight-decimal costs/values.
// All calculations use BigInt, never binary floating point.
const Q=1000000n,V=100000000n;
const MAX_Q=(10n**12n)*Q-1n; // DECIMAL(18,6)
const MAX_C=(10n**10n)*V-1n; // DECIMAL(18,8)
const MAX_V=(10n**16n)*V-1n; // DECIMAL(24,8)
const decimal=(value,scale,max,allowZero=true)=>{
 const s=String(value);
 if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s))throw Error('INVENTORY_INVALID_DECIMAL');
 const [w,f='']=s.split('.');
 if(f.length>(scale===Q?6:8))throw Error('INVENTORY_INVALID_PRECISION');
 const out=BigInt(w)*scale+BigInt((f+'0'.repeat(scale===Q?6:8)).slice(0,scale===Q?6:8));
 if(out>max||(!allowZero&&out===0n))throw Error('INVENTORY_AMOUNT_OUT_OF_RANGE');
 return out;
};
const stringify=(v,digits)=>{
 const sign=v<0n?'-':'';const n=v<0n?-v:v;const unit=10n**BigInt(digits);
 return `${sign}${n/unit}.${(n%unit).toString().padStart(digits,'0')}`;
};
const halfUp=(n,d)=>{if(n<0n||d<=0n)throw Error('INVENTORY_INVALID_ARITHMETIC');return (n+d/2n)/d;};
export const quantity6=x=>decimal(x,Q,MAX_Q,false);
export const quantity6AllowZero=x=>decimal(x,Q,MAX_Q,true);
export const cost8=x=>decimal(x,V,MAX_C,true);
export const printQuantity=x=>stringify(x,6);
export const printCost=x=>stringify(x,8);
export const printValue=x=>stringify(x,8);
export function inventoryOpening(quantity,unitCost){
 const q=quantity6AllowZero(quantity),c=cost8(unitCost);
 if(q===0n&&c!==0n)throw Error('INVENTORY_ZERO_OPENING_COST');
 const value=halfUp(q*c,Q);
 if(value>MAX_V)throw Error('INVENTORY_VALUE_OVERFLOW');
 return {quantity:printQuantity(q),carryingValue:printValue(value),averageCost:q?printCost(halfUp(value*Q,q)):printCost(0n)};
}
export function inventoryReceive(balance,receivedQty,unitCost){
 const q=quantity6AllowZero(balance.quantity),v=decimal(balance.carryingValue,V,MAX_V),r=quantity6(receivedQty),c=cost8(unitCost);
 const afterQ=q+r,afterV=v+halfUp(r*c,Q);
 if(afterQ>MAX_Q||afterV>MAX_V)throw Error('INVENTORY_BALANCE_OVERFLOW');
 return {quantity:printQuantity(afterQ),carryingValue:printValue(afterV),averageCost:printCost(halfUp(afterV*Q,afterQ))};
}
export function inventoryIssue(balance,issuedQty){
 const q=quantity6AllowZero(balance.quantity),v=decimal(balance.carryingValue,V,MAX_V),r=quantity6(issuedQty);
 if(r>q||q===0n)throw Error('INVENTORY_INSUFFICIENT_STOCK');
 const cost=r===q?v:halfUp(v*r,q);
 const afterQ=q-r,afterV=v-cost;
 return {quantity:printQuantity(afterQ),carryingValue:printValue(afterV),averageCost:afterQ?printCost(halfUp(afterV*Q,afterQ)):printCost(0n),issuedCost:printValue(cost)};
}
