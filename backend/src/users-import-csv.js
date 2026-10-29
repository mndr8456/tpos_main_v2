import { passwordAllowed } from './passwords.js';

// Based on V1's seven CSV columns; branch_code is optional for a single active branch.
export const userCsvColumns = Object.freeze(['full_name','username','email','phone_no','role','status','temporary_password','branch_code']);
const mandatoryColumns = userCsvColumns.slice(0,7);
const LIMIT_BYTES = 256 * 1024;
const MAX_ROWS = 50;
const validEmail = value => value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validName = value => value.length>=2 && value.length<=160;
const validUsername = value => /^[a-zA-Z0-9._-]{3,60}$/.test(value);
const validPhone = value => value.length<=40;
const supportedRoles = ['ADMIN','HR','ACCOUNTANT','MANAGER','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'];
const csvError = (message,status=400)=>Object.assign(new Error(message),{status});

function readCsv(text){
  const output=[];let row=[],field='',quoted=false,closed=false;
  const input=text.replace(/^\uFEFF/,'');
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(quoted){
      if(ch==='"'&&input[i+1]==='"'){field+='"';i++;}
      else if(ch==='"'){quoted=false;closed=true;}
      else field+=ch;
    }else if(ch==='"'&&!field&&!closed){quoted=true;}
    else if(ch===','||ch==='\r'||ch==='\n'){
      row.push(field);field='';closed=false;
      if(ch!==','){
        if(ch==='\r'&&input[i+1]==='\n')i++;
        if(row.some(v=>v.trim()))output.push(row);
        row=[];
      }
    }else{
      if(ch==='"'||closed)throw csvError('CSV_MALFORMED');
      field+=ch;
    }
  }
  if(quoted)throw csvError('CSV_MALFORMED');
  if(row.length||field.length){row.push(field);if(row.some(v=>v.trim()))output.push(row);}
  return output;
}
export function parseUsersCsv(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>LIMIT_BYTES)throw csvError('CSV_TOO_LARGE');
 const lines=readCsv(raw);
 if(lines.length<2)throw csvError('CSV_EMPTY');
 const headers=lines.shift().map(x=>x.trim().toLowerCase());
 const expected=headers.length===7?mandatoryColumns:userCsvColumns;
 if(headers.length!==expected.length||headers.some((h,i)=>h!==expected[i]))throw csvError('CSV_INVALID_HEADERS');
 if(lines.length>MAX_ROWS)throw csvError('CSV_ROW_LIMIT');
 return lines.map((values,i)=>{
  const line=i+2;
  if(values.length!==headers.length)return {line,error:'CSV_COLUMN_COUNT'};
  const [fullName,username,email,phone,role,status,password,branchCode='']=values.map((v,i)=>i===6?v:v.trim());
  const active=(status||'ACTIVE').toUpperCase();
  const code=role.toUpperCase();
  if(!validName(fullName)||!validUsername(username)||!validEmail(email)||!validPhone(phone)||!passwordAllowed(password))return {line,error:'USER_VALIDATION_ERROR'};
  if(code==='OWNER')return {line,error:'OWNER_PROTECTED'};
  if(!supportedRoles.includes(code))return {line,error:'USER_ROLE_INVALID'};
  if(!['ACTIVE','INACTIVE'].includes(active))return {line,error:'USER_STATUS_INVALID'};
  if(branchCode&&(!/^[A-Za-z0-9_-]{1,40}$/.test(branchCode)))return {line,error:'BRANCH_CODE_INVALID'};
  const data={fullName,username,email:email.toLowerCase(),phone,role:code,status:active,password,branchCode:branchCode.toUpperCase()};
  return {line,data};
 });
}
export function userCsvTemplate(){return '\uFEFF'+userCsvColumns.join(',')+'\r\n';}

