// Optional physical opening-float denomination audit, computed exactly in sen.
export const OPENING_DENOMINATIONS = Object.freeze({
 '100':10000n,'50':5000n,'20':2000n,'10':1000n,'5':500n,
 '1':100n,'0.50':50n,'0.20':20n,'0.10':10n,'0.05':5n
});
export function openingDenominationTotal(counts){
 if(counts===undefined||counts===null)return null;
 if(typeof counts!=='object'||Array.isArray(counts))throw new Error('SHIFT_DENOMINATIONS_INVALID');
 let total=0n;
 for(const [key,count] of Object.entries(counts)){
  const denomination=OPENING_DENOMINATIONS[key];
  if(denomination===undefined||!Number.isInteger(count)||count<0||count>100000)throw new Error('SHIFT_DENOMINATIONS_INVALID');
  total+=denomination*BigInt(count);
 }
 if(total>999999999999n)throw new Error('SHIFT_DENOMINATION_TOTAL_LIMIT');
 return total;
}
