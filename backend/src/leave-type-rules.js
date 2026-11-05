// HR Leave Types R1: strict V1-compatible 15-field policy validation and safe CSV parsing.
import {z} from 'zod';
export class LeaveTypeError extends Error{constructor(message,status=400){super(message);this.name='LeaveTypeError';this.status=status;}}
export const attendanceMappings=['Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave'];
export const leaveGenders=['All','Male','Female'];
export const leaveStatuses=['active','inactive'];
export const leaveHeaders=['leave_code','leave_name','description','attendance_status','default_entitlement_days','is_paid','requires_attachment','allow_half_day','allow_carry_forward','max_carry_forward_days','max_days_per_request','minimum_service_months','gender_restriction','sort_order','status'];
export const leaveCsvTemplate=()=> '\uFEFF'+leaveHeaders.join(',')+'\r\n';
const flag=z.union([z.boolean(),z.literal(0),z.literal(1),z.literal('0'),z.literal('1'),z.literal('true'),z.literal('false')]).transform(v=>v===true||v===1||v==='1'||v==='true'?1:0);
const decimal=(max,allowZero=true)=>z.union([z.string(),z.number()]).transform(v=>String(v).trim()).refine(v=>/^\d{1,5}(?:\.\d{1,2})?$/.test(v)&&Number(v)<=max&&(allowZero||Number(v)>0),{message:'Use a non-negative number with up to 2 decimals.'}).transform(v=>Number(v).toFixed(2));
const optionalDays=z.union([z.string(),z.number(),z.null()]).optional().transform(v=>v===null||v===undefined||String(v).trim()===''?null:String(v).trim()).pipe(z.union([z.null(),decimal(3660,false)]));
const trim=(max)=>z.string().trim().max(max);
const bodySchema=z.object({
 leave_code:z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_-]{1,15}$/),
 leave_name:z.string().trim().min(2).max(150),
 description:trim(2000).default(''),
 attendance_status:z.enum(attendanceMappings),
 default_entitlement_days:decimal(3660),
 is_paid:flag,
 requires_attachment:flag,
 allow_half_day:flag,
 allow_carry_forward:flag,
 max_carry_forward_days:decimal(3660),
 max_days_per_request:optionalDays,
 minimum_service_months:z.coerce.number().int().min(0).max(600),
 gender_restriction:z.enum(leaveGenders),
 sort_order:z.coerce.number().int().min(0).max(999999),
 status:z.enum(leaveStatuses)
}).strict().superRefine((v,ctx)=>{
 if(v.leave_code==='EL' && v.attendance_status!=='Emergency Leave')ctx.addIssue({code:'custom',path:['attendance_status'],message:'EL must use Emergency Leave attendance status, not Annual Leave.'});
 if(!v.allow_carry_forward && Number(v.max_carry_forward_days)!==0)ctx.addIssue({code:'custom',path:['max_carry_forward_days'],message:'Max Carry Forward must be 0.00 when Carry Forward is disabled.'});
 if(v.max_days_per_request!==null&&Number(v.max_days_per_request)<(v.allow_half_day?0.5:1))ctx.addIssue({code:'custom',path:['max_days_per_request'],message:'Maximum request days is too small.'});
});
export function normalizeLeaveType(value){return bodySchema.parse(value);}
export function friendlyLeaveError(e){if(e?.issues)return e.issues.map(x=>`${String(x.path?.[0]||'Field').replaceAll('_',' ')}: ${x.message}`).join('; ');return String(e?.message||'Invalid leave type.');}
export function parseLeaveCsv(csv){
 if(typeof csv!=='string'||Buffer.byteLength(csv,'utf8')>1024*1024)throw new LeaveTypeError('CSV must be a text file under 1 MB.');
 const text=csv.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
 const rows=[];let fields=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(ch==='"'){quoted=false;closed=true;}else cell+=ch;continue;}
  if(closed&&ch!==','&&ch!=='\n')throw new LeaveTypeError('Malformed CSV quotation.');
  if(ch==='"'){if(cell||closed)throw new LeaveTypeError('Malformed CSV quotation.');quoted=true;continue;}
  if(ch===','||ch==='\n'){fields.push(cell);cell='';closed=false;if(ch==='\n'){if(fields.some(x=>String(x).trim()))rows.push(fields);fields=[];}continue;}
  cell+=ch;
 }
 if(quoted)throw new LeaveTypeError('Unclosed quotation in CSV.');
 if(cell!==''||fields.length){fields.push(cell);if(fields.some(x=>String(x).trim()))rows.push(fields);}
 if(!rows.length)throw new LeaveTypeError('CSV file is empty.');
 if(rows.length>1001)throw new LeaveTypeError('Maximum 1,000 Leave Types per import.');
 if(rows[0].length!==leaveHeaders.length||rows[0].some((v,i)=>v.trim().toLowerCase()!==leaveHeaders[i]))throw new LeaveTypeError('CSV columns do not match the Leave Types template.');
 const results=[];const seen=new Set();
 for(let index=1;index<rows.length;index++){
  const cells=rows[index],line=index+1;
  if(cells.length!==leaveHeaders.length){results.push({row:line,code:'',errors:['Incorrect number of CSV columns.']});continue;}
  const input=Object.fromEntries(leaveHeaders.map((name,i)=>[name,cells[i].trim()]));
  const errors=[];let policy=null;
  try{policy=normalizeLeaveType(input);}catch(e){errors.push(friendlyLeaveError(e));}
  const code=(policy?.leave_code||input.leave_code||'').toUpperCase();
  if(code){if(seen.has(code))errors.push('Duplicate Leave Code in this file.');else seen.add(code);}
  results.push({row:line,code,errors,...(policy?{policy}:{})});
 }
 return results;
}
