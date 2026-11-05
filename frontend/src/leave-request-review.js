// Shared presentation rules for mandatory approval/rejection details and audit history.
// Backend independently enforces the same 4..5000-character requirement.
export function validReviewDetails(value){
 return typeof value==='string' && value.trim().length>=4 && value.trim().length<=5000;
}
function parseDetails(raw){
 if(raw===null||raw===undefined)return {};
 if(typeof raw==='string'){
  try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{text:raw};}
  catch{return {text:raw};}
 }
 return typeof raw==='object'&&!Array.isArray(raw)?raw:{};
}
const content=value=>typeof value==='string'?value.trim():'';
export function formatLeaveAuditDetails(actionType,raw){
 const details=parseDetails(raw),action=String(actionType||'').toUpperCase();
 if(action==='APPROVE'||action==='REJECT'){
  const remarks=content(details.remarks)||content(details.review_remarks);
  const legacy=action==='APPROVE'?'No approval details recorded (earlier version).':'No rejection details recorded (earlier version).';
  const extra=action==='APPROVE'&&details.reviewedScheduleConversion?' · Scheduled Attendance marked as Leave.':'';
  return (remarks||legacy)+extra;
 }
 if(action==='CANCEL')return content(details.reason)||'Cancellation recorded (no reason available).';
 if(action==='SUBMIT'){
  const days=Number(details.days),year=Number(details.year);
  if(Number.isFinite(days)&&days>0&&Number.isInteger(year)&&year>2000&&year<3000)
   return `Submitted ${days.toFixed(2)} day${days===1?'':'s'} for ${year}.`;
  return 'Leave request submitted.';
 }
 if(action==='EDIT'){
  const before=Number(details.before?.days),after=Number(details.after?.days);
  if(Number.isFinite(before)&&Number.isFinite(after))return `Updated requested days: ${before.toFixed(2)} → ${after.toFixed(2)}.`;
  return 'Leave request updated.';
 }
 return content(details.remarks)||content(details.reason)||content(details.text)||'Activity recorded.';
}
