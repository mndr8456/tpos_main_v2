// HR Leave Balances R1. Ledger arithmetic uses integer hundredths of a day only.
import {z} from 'zod';
export class LeaveBalanceError extends Error{constructor(code,status=400){super(code);this.status=status;this.name='LeaveBalanceError';}}
export const csvHeaders=['staff_no','leave_code','balance_year','entitlement_days','carried_forward_days','adjustment_days','used_days','pending_days','expired_days','adjustment_notes','status'];
export const balanceCsvTemplate=()=> '\uFEFF'+csvHeaders.join(',')+'\r\n';
export function daysToHundredths(value,{negative=false}={}){
 const text=String(value??'').trim();
 if(!/^-?\d{1,5}(?:\.\d{1,2})?$/.test(text))throw new LeaveBalanceError('INVALID_DAY_DECIMAL');
 const minus=text.startsWith('-');if(minus&&!negative)throw new LeaveBalanceError('NEGATIVE_DAYS_NOT_ALLOWED');
 const [whole,decimal='']=text.replace('-','').split('.');
 const total=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(total)||total>366000||(total%50)!==0)throw new LeaveBalanceError('DAYS_MUST_BE_IN_HALF_DAY_STEPS');
 return minus?-total:total;
}
export function hundredthsToDays(v){const sign=v<0?'-':'';const abs=Math.abs(v);return `${sign}${Math.floor(abs/100)}.${String(abs%100).padStart(2,'0')}`;}
export function validateBalance(input){
 const obj=z.object({staff_profile_id:z.coerce.number().int().positive(),leave_type_id:z.coerce.number().int().positive(),balance_year:z.coerce.number().int().min(2000).max(2100),entitlement_days:z.union([z.string(),z.number()]),carried_forward_days:z.union([z.string(),z.number()]),adjustment_days:z.union([z.string(),z.number()]),used_days:z.union([z.string(),z.number()]),pending_days:z.union([z.string(),z.number()]),expired_days:z.union([z.string(),z.number()]),adjustment_notes:z.string().trim().max(1000),status:z.enum(['active','inactive'])}).strict().parse(input);
 const cents={};for(const field of ['entitlement_days','carried_forward_days','adjustment_days','used_days','pending_days','expired_days'])cents[field]=daysToHundredths(obj[field],{negative:field==='adjustment_days'});
 const remaining=cents.entitlement_days+cents.carried_forward_days+cents.adjustment_days-cents.used_days-cents.pending_days-cents.expired_days;
 if(remaining<0)throw new LeaveBalanceError('INSUFFICIENT_LEAVE_BALANCE',422);
 if(!obj.adjustment_notes&&(cents.adjustment_days!==0||cents.used_days!==0||cents.pending_days!==0||cents.expired_days!==0||cents.carried_forward_days!==0))throw new LeaveBalanceError('ADJUSTMENT_REASON_REQUIRED',422);
 return {...obj,...Object.fromEntries(Object.entries(cents).map(([k,v])=>[k,hundredthsToDays(v)])),remaining_days:hundredthsToDays(remaining)};
}
export function parseBalanceCsv(text){
 if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>2*1024*1024)throw new LeaveBalanceError('CSV_TOO_LARGE');
 const source=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');let cell='',row=[],rows=[],quoted=false,afterQuote=false;
 for(let i=0;i<source.length;i++){
  const ch=source[i];if(quoted){if(ch==='"'&&source[i+1]==='"'){cell+='"';i++;}else if(ch==='"'){quoted=false;afterQuote=true;}else cell+=ch;continue;}
  if(afterQuote&&!['\n',','].includes(ch))throw new LeaveBalanceError('CSV_MALFORMED_QUOTES');
  if(ch==='"'){if(cell!=='')throw new LeaveBalanceError('CSV_MALFORMED_QUOTES');quoted=true;continue;}
  if(ch===','||ch==='\n'){row.push(cell);cell='';afterQuote=false;if(ch==='\n'){if(row.some(x=>x.trim()))rows.push(row);row=[];}continue;}
  cell+=ch;
 }
 if(quoted)throw new LeaveBalanceError('CSV_UNCLOSED_QUOTE');
 if(cell!==''||row.length){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);}
 if(!rows.length||rows[0].length!==csvHeaders.length||rows[0].some((v,i)=>v.trim().toLowerCase()!==csvHeaders[i]))throw new LeaveBalanceError('CSV_TEMPLATE_MISMATCH');
 if(rows.length>1001)throw new LeaveBalanceError('CSV_MAX_1000_ROWS');
 const seen=new Set();return rows.slice(1).map((cells,i)=>{
  const errors=[];const record=Object.fromEntries(csvHeaders.map((k,j)=>[k,String(cells[j]??'').trim()]));
  if(cells.length!==csvHeaders.length)errors.push('Incorrect number of columns.');
  const key=`${record.staff_no.toUpperCase()}|${record.leave_code.toUpperCase()}|${record.balance_year}`;
  if(seen.has(key))errors.push('Duplicate Staff / Leave Type / Year in file.');seen.add(key);
  if(!/^[A-Za-z0-9-]{2,50}$/.test(record.staff_no))errors.push('Invalid Staff No.');
  if(!/^[A-Z][A-Z0-9_-]{1,15}$/.test(record.leave_code.toUpperCase()))errors.push('Invalid Leave Code.');
  try{const {staff_no,leave_code,...balanceFields}=record;validateBalance({...balanceFields,staff_profile_id:1,leave_type_id:1});}catch(e){errors.push(e.message==='ADJUSTMENT_REASON_REQUIRED'?'Adjustment Notes are required for nonzero changes.':e.message);}
  return {row:i+2,staffNo:record.staff_no,leaveCode:record.leave_code,year:record.balance_year,errors,record};
 });
}
