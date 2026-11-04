// Pure leave calculation engine; no database or external modules.
export class LeaveRequestError extends Error{constructor(message,status=400){super(message);this.name='LeaveRequestError';this.status=status;}}
export const fail=(code,status=400)=>{throw new LeaveRequestError(code,status);};
export function leavePeriod(start,end,duration,half){
 const pattern=/^\d{4}-\d{2}-\d{2}$/;
 if(!pattern.test(start)||!pattern.test(end))fail('INVALID_LEAVE_DATE');
 const a=new Date(`${start}T00:00:00Z`),b=new Date(`${end}T00:00:00Z`);
 if(!Number.isFinite(a.getTime())||!Number.isFinite(b.getTime())||a.toISOString().slice(0,10)!==start||b.toISOString().slice(0,10)!==end)fail('INVALID_LEAVE_DATE');
 if(start.slice(0,4)!==end.slice(0,4))fail('CROSS_YEAR_REQUEST_MUST_BE_SPLIT',422);
 const diff=Math.round((b-a)/86400000)+1;
 if(diff<1||diff>366)fail('INVALID_LEAVE_DATE_RANGE',422);
 if(duration==='Half Day'){if(diff!==1||!['First Half','Second Half'].includes(half))fail('INVALID_HALF_DAY_PERIOD',422);return {days:'0.50',year:Number(start.slice(0,4)),dates:[start]};}
 if(duration!=='Full Day'||half)fail('HALF_DAY_PERIOD_NOT_APPLICABLE',422);
 const dates=Array.from({length:diff},(_,i)=>new Date(a.getTime()+i*86400000).toISOString().slice(0,10));
 return {days:`${diff}.00`,year:Number(start.slice(0,4)),dates};
}
export function dayCents(v){const s=String(v);if(!/^-?\d{1,5}(?:\.\d{1,2})?$/.test(s))fail('INVALID_BALANCE_AMOUNT');const neg=s[0]==='-';const [w,d='']=s.replace('-','').split('.');return (neg?-1:1)*(Number(w)*100+Number(d.padEnd(2,'0')));}
export function centsDays(n){if(!Number.isSafeInteger(n))fail('INVALID_BALANCE_AMOUNT');return `${n<0?'-':''}${Math.floor(Math.abs(n)/100)}.${String(Math.abs(n)%100).padStart(2,'0')}`;}
// Integer hundredths-of-day balance engine: imported opening + append-only postings.
export function calculateBalanceDelta(before,{used=0,pending=0}={}){
 const existingUsed=dayCents(before.used_days),existingPending=dayCents(before.pending_days);
 const allowed=dayCents(before.entitlement_days)+dayCents(before.carried_forward_days)+dayCents(before.adjustment_days)-dayCents(before.expired_days);
 const updatedUsed=existingUsed+used,updatedPending=existingPending+pending;
 if(!Number.isSafeInteger(used)||!Number.isSafeInteger(pending)||updatedUsed<0||updatedPending<0||updatedUsed+updatedPending>allowed)fail('INSUFFICIENT_LEAVE_BALANCE',422);
 return {used:centsDays(updatedUsed),pending:centsDays(updatedPending),remaining:centsDays(allowed-updatedUsed-updatedPending)};
}
export function reconcileBalance(opening,posting,balance){
 const expectedUsed=dayCents(opening.opening_used_days)+dayCents(posting.used_delta);
 const expectedPending=dayCents(opening.opening_pending_days)+dayCents(posting.pending_delta);
 if(expectedUsed!==dayCents(balance.used_days)||expectedPending!==dayCents(balance.pending_days))fail('BALANCE_RECONCILIATION_MISMATCH',409);
 return {used:centsDays(expectedUsed),pending:centsDays(expectedPending)};
}
