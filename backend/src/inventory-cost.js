// Inventory Foundation: exact two-decimal quantities, unit costs and carrying values.
// All money and quantities use scaled BigInt, never binary floating point.
const SCALE=100n;
const MAX=(10n**16n)*SCALE-1n; // DECIMAL(18,2)
const decimal=(value,allowZero=true)=>{
 const s=String(value);
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(s))throw Error('INVENTORY_INVALID_DECIMAL_OR_PRECISION');
 const [whole,fraction='']=s.split('.');
 const out=BigInt(whole)*SCALE+BigInt(fraction.padEnd(2,'0'));
 if(out>MAX||(!allowZero&&out===0n))throw Error('INVENTORY_AMOUNT_OUT_OF_RANGE');
 return out;
};
const stringify=value=>`${value/SCALE}.${(value%SCALE).toString().padStart(2,'0')}`;
const halfUp=(numerator,denominator)=>{
 if(numerator<0n||denominator<=0n)throw Error('INVENTORY_INVALID_ARITHMETIC');
 return (numerator+denominator/2n)/denominator;
};
const requireInRange=value=>{if(value<0n||value>MAX)throw Error('INVENTORY_BALANCE_OVERFLOW');return value;};
export const quantity2=value=>decimal(value,false);
export const quantity2AllowZero=value=>decimal(value,true);
export const cost2=value=>decimal(value,true);
export const printQuantity=stringify;
export const printCost=stringify;
export const printValue=stringify;
export function inventoryOpening(quantity,unitCost){
 const q=quantity2AllowZero(quantity),unit=cost2(unitCost);
 if(q===0n&&unit!==0n)throw Error('INVENTORY_ZERO_OPENING_COST');
 const value=requireInRange(halfUp(q*unit,SCALE));
 return {quantity:stringify(q),carryingValue:stringify(value),averageCost:q?stringify(halfUp(value*SCALE,q)):stringify(0n)};
}
export function inventoryReceive(balance,receivedQty,unitCost){
 const q=quantity2AllowZero(balance.quantity),v=decimal(balance.carryingValue),r=quantity2(receivedQty),unit=cost2(unitCost);
 const afterQ=requireInRange(q+r),afterV=requireInRange(v+halfUp(r*unit,SCALE));
 return {quantity:stringify(afterQ),carryingValue:stringify(afterV),averageCost:stringify(halfUp(afterV*SCALE,afterQ))};
}
export function inventoryIssue(balance,issuedQty){
 const q=quantity2AllowZero(balance.quantity),v=decimal(balance.carryingValue),r=quantity2(issuedQty);
 if(r>q||q===0n)throw Error('INVENTORY_INSUFFICIENT_STOCK');
 const issued=r===q?v:halfUp(v*r,q);
 const afterQ=q-r,afterV=v-issued;
 return {quantity:stringify(afterQ),carryingValue:stringify(afterV),averageCost:afterQ?stringify(halfUp(afterV*SCALE,afterQ)):stringify(0n),issuedCost:stringify(issued)};
}
