import { z } from 'zod';
import { hashPassword } from './passwords.js';
import { quoteIdentifier } from './database.js';
import { settings } from './config.js';
import { parseUsersCsv,userCsvTemplate } from './users-import-csv.js';
export { userCsvTemplate } from './users-import-csv.js';
const inputSchema = z.object({csv:z.string()}).strict();
const LIMIT_BYTES=256*1024;
const csvError=(message,status=400)=>Object.assign(new Error(message),{status});

async function reviewRows(connection,raw,user){
 const records=parseUsersCsv(raw);
 const [roles]=await connection.execute('SELECT code FROM roles WHERE code <> ?', ['OWNER']);
 const [branches]=await connection.execute('SELECT id,code FROM branches WHERE is_active=1');
 const roleSet=new Set(roles.map(r=>r.code));
 const branchMap=new Map(branches.map(b=>[b.code.toUpperCase(),String(b.id)]));
 const emails=records.filter(r=>r.data).map(r=>r.data.email);
 const usernames=records.filter(r=>r.data).map(r=>r.data.username);
 const placeholders=(arr)=>arr.map(()=>'?').join(',');
 let existingEmails=[],existingNames=[];
 if(emails.length){
  const [found]=await connection.execute(`SELECT email FROM ${quoteIdentifier(settings.central)}.login_directory WHERE email IN (${placeholders(emails)})`,emails);
  existingEmails=found.map(r=>r.email.toLowerCase());
  const [foundNames]=await connection.execute(`SELECT username FROM users WHERE username IN (${placeholders(usernames)})`,usernames);
  existingNames=foundNames.map(r=>r.username.toLowerCase());
 }
 const emailSeen=new Set(),usernameSeen=new Set(),knownEmail=new Set(existingEmails),knownName=new Set(existingNames);
 const evaluated=records.map(record=>{
  if(!record.data)return {...record};
  const {line,data}=record;
  let error=null,branchId=null;
  if(emailSeen.has(data.email)||usernameSeen.has(data.username.toLowerCase()))error='CSV_DUPLICATE_IDENTITY';
  else if(knownEmail.has(data.email))error='EMAIL_ALREADY_REGISTERED';
  else if(knownName.has(data.username.toLowerCase()))error='USERNAME_ALREADY_REGISTERED';
  else if(!roleSet.has(data.role))error='USER_ROLE_INVALID';
  else if(data.branchCode){branchId=branchMap.get(data.branchCode);if(!branchId)error='INVALID_BRANCH';}
  else if(branches.length===1)branchId=String(branches[0].id);
  else error='BRANCH_CODE_REQUIRED';
  if(!error && user.role_code!=='OWNER' && !user.branchIds.includes(String(branchId)))error='BRANCH_ACCESS_DENIED';
  emailSeen.add(data.email);usernameSeen.add(data.username.toLowerCase());
  return {line,data,branchId,error};
 });
 return {records:evaluated,valid:evaluated.every(r=>!r.error)};
}
const safePreview=({records,valid})=>({valid,rows:records.map(r=>({line:r.line,fullName:r.data?.fullName||'',username:r.data?.username||'',email:r.data?.email||'',role:r.data?.role||'',status:r.data?.status||'',branchCode:r.data?.branchCode||'',error:r.error||null}))});
export async function previewUsersImport(req,res){
 const {csv}=inputSchema.parse(req.body);
 if(Buffer.byteLength(csv,'utf8')>LIMIT_BYTES)throw csvError('CSV_TOO_LARGE');
 const connection=await req.auth.pool.getConnection();
 try{return res.json(safePreview(await reviewRows(connection,csv,req.auth.user)));}finally{connection.release();}
}
export async function importUsers(req,res){
 const {csv}=inputSchema.parse(req.body);
 if(Buffer.byteLength(csv,'utf8')>LIMIT_BYTES)throw csvError('CSV_TOO_LARGE');
 const {user,tenantId,pool}=req.auth;
 // Pre-hash only valid, private passwords; never log or return them.
 const prechecked=parseUsersCsv(csv);
 if(prechecked.some(r=>r.error))return res.status(400).json({error:'USER_IMPORT_INVALID',...safePreview({records:prechecked,valid:false})});
 const hashes=[];
 for(const row of prechecked)hashes.push(await hashPassword(row.data.password));
 const connection=await pool.getConnection();
 try{
  await connection.beginTransaction();
  const result=await reviewRows(connection,csv,user);
  if(!result.valid){await connection.rollback();return res.status(409).json({error:'USER_IMPORT_INVALID',...safePreview(result)});}
  for(let i=0;i<result.records.length;i++){
   const {data,branchId}=result.records[i];
   const [created]=await connection.execute(`INSERT INTO users(full_name,username,email,phone,password_hash,status,must_change_password) VALUES(?,?,?,?,?,?,1)`,[data.fullName,data.username,data.email,data.phone||null,hashes[i],data.status]);
   const [[role]]=await connection.execute('SELECT id FROM roles WHERE code=? LIMIT 1',[data.role]);
   if(!role)throw csvError('USER_ROLE_INVALID');
   await connection.execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)',[created.insertId,role.id]);
   await connection.execute('INSERT INTO user_branch_access(user_id,branch_id) VALUES(?,?)',[created.insertId,branchId]);
   await connection.execute(`INSERT INTO ${quoteIdentifier(settings.central)}.login_directory(email,tenant_id,tenant_user_id) VALUES(?,?,?)`,[data.email,tenantId,created.insertId]);
   await connection.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type,details) VALUES(?,?,'USER_IMPORTED',JSON_OBJECT('role',?,'branchId',?))`,[user.id,created.insertId,data.role,branchId]);
  }
  await connection.commit();return res.status(201).json({message:'USERS_IMPORTED',created:result.records.length});
 }catch(error){await connection.rollback().catch(()=>{});if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'DUPLICATE_IDENTITY_REVIEW_IMPORT'});throw error;}
 finally{connection.release();}
}
