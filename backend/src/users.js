import { z } from 'zod';
import { centralPool, quoteIdentifier } from './database.js';
import { settings } from './config.js';
import { verifyPassword } from './passwords.js';
import { hashPassword } from './passwords.js';

const roleCodes=['ADMIN','HR','ACCOUNTANT','MANAGER','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'];
const createSchema=z.object({
 fullName:z.string().trim().min(2).max(160),username:z.string().trim().regex(/^[a-zA-Z0-9._-]{3,60}$/),email:z.email().max(254).transform(v=>v.trim().toLowerCase()),
 phone:z.string().trim().max(40).optional().default(''),role:z.enum(roleCodes),branchId:z.coerce.number().int().positive(),
 password:z.string().min(12).max(128)
}).strict();
const updateSchema=z.object({
 fullName:z.string().trim().min(2).max(160),username:z.string().trim().regex(/^[a-zA-Z0-9._-]{3,60}$/), phone:z.string().trim().max(40).optional().default(''),
 role:z.enum(roleCodes), branchId:z.coerce.number().int().positive(),status:z.enum(['ACTIVE','INACTIVE']),
 email:z.email().max(254).transform(v=>v.trim().toLowerCase()).optional()
}).strict();
export async function userMeta(req,res){
 const [roles]=await req.auth.pool.execute('SELECT code,name FROM roles ORDER BY id');
 const [branches]=await req.auth.pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');
 return res.json({roles:roles.filter(x=>x.code!=='OWNER'),branches:branches.map(b=>({...b,id:String(b.id)}))});
}
export async function listUsers(req,res){
 const [rows]=await req.auth.pool.execute(`SELECT u.id,u.full_name,u.username,u.email,u.phone,u.status,u.failed_login_attempts,u.locked_until,u.last_login_at,u.created_at,u.must_change_password,
 r.code AS role_code,b.id AS branch_id,b.name AS branch_name
 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id
 LEFT JOIN user_branch_access uba ON uba.user_id=u.id LEFT JOIN branches b ON b.id=uba.branch_id
 ORDER BY u.id LIMIT 500`);
 return res.json({users:rows.map(x=>({...x,id:String(x.id),branch_id:x.branch_id===null?null:String(x.branch_id),password_hash:undefined}))});
}
export async function listAudit(req,res){
 const [rows]=await req.auth.pool.execute('SELECT id,actor_user_id,target_user_id,event_type,details,created_at FROM user_activity_logs ORDER BY id DESC LIMIT 150');
 return res.json({logs:rows});
}
async function roleId(conn,code){
 const [[r]]=await conn.execute('SELECT id FROM roles WHERE code=? LIMIT 1',[code]);
 if(!r)throw Object.assign(new Error('UNKNOWN_ROLE'),{status:400});return r.id;
}
async function validBranch(conn,id){
 const [[b]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1 LIMIT 1',[id]);
 if(!b)throw Object.assign(new Error('INVALID_BRANCH'),{status:400});
}
// All schema updates use the SAME MySQL connection and transaction. This ensures
// tenant users and the central login directory cannot diverge on a normal failure.
const centralDirectory = `${quoteIdentifier(settings.central)}.login_directory`;
const centralTenants = `${quoteIdentifier(settings.central)}.tenants`;
const emailSchema=z.object({email:z.email().max(254).transform(v=>v.trim().toLowerCase()),currentPassword:z.string().min(1).optional()}).strict();
const emailAdminRoles=new Set(['OWNER','ADMIN','HR']);

async function changeEmailWithinTransaction(conn,{tenantId,targetId,targetEmail,newEmail,actorId,targetRole}){
 if(targetEmail===newEmail)return false;
 const [[record]]=await conn.execute(`SELECT email FROM ${centralDirectory} WHERE tenant_id=? AND tenant_user_id=? FOR UPDATE`,[tenantId,targetId]);
 if(!record || record.email!==targetEmail)throw Object.assign(new Error('LOGIN_DIRECTORY_OUT_OF_SYNC'),{status:409});
 // Database unique constraints reject an address already in use (even in another tenant).
 const [directoryUpdate]=await conn.execute(`UPDATE ${centralDirectory} SET email=? WHERE tenant_id=? AND tenant_user_id=? AND email=?`,[newEmail,tenantId,targetId,targetEmail]);
 if(directoryUpdate.affectedRows!==1)throw Object.assign(new Error('LOGIN_DIRECTORY_OUT_OF_SYNC'),{status:409});
 await conn.execute('UPDATE users SET email=?,auth_version=auth_version+1 WHERE id=?',[newEmail,targetId]);
 if(targetRole==='OWNER'){
  const [ownerUpdate]=await conn.execute(`UPDATE ${centralTenants} SET owner_email=? WHERE id=? AND owner_email=?`,[newEmail,tenantId,targetEmail]);
  if(ownerUpdate.affectedRows!==1)throw Object.assign(new Error('OWNER_DIRECTORY_OUT_OF_SYNC'),{status:409});
  await conn.execute('UPDATE company_profiles SET email=? WHERE id=1 AND email=?',[newEmail,targetEmail]);
 }
 await conn.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type,details) VALUES(?,?,'USER_EMAIL_CHANGED',JSON_OBJECT('oldEmail',?,'newEmail',?))`,[actorId,targetId,targetEmail,newEmail]);
 return true;
}

// Email-only changes are available to the account owner or OWNER/ADMIN/HR.
// Updating the OWNER account is restricted to the actual OWNER, not HR/ADMIN.
export async function changeUserEmail(req,res){
 const data=emailSchema.parse(req.body),{pool,user,tenantId}=req.auth,id=String(req.params.id);
 if(!/^[1-9]\d*$/.test(id))return res.status(400).json({error:'INVALID_USER_ID'});
 const self=id===String(user.id);
 if(!self && !emailAdminRoles.has(user.role_code))return res.status(403).json({error:'EMAIL_EDIT_NOT_ALLOWED'});
 if(self && !data.currentPassword)return res.status(400).json({error:'CURRENT_PASSWORD_REQUIRED'});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[target]]=await conn.execute(`SELECT u.email,u.password_hash,r.code AS role_code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=? FOR UPDATE`,[id]);
  if(!target)throw Object.assign(new Error('USER_NOT_FOUND'),{status:404});
  if(target.role_code==='OWNER' && !self)throw Object.assign(new Error('OWNER_PROTECTED'),{status:403});
  if(self && !await verifyPassword(data.currentPassword,target.password_hash))throw Object.assign(new Error('WRONG_PASSWORD'),{status:400});
  const changed=await changeEmailWithinTransaction(conn,{tenantId,targetId:id,targetEmail:target.email,newEmail:data.email,actorId:user.id,targetRole:target.role_code});
  await conn.commit();
  return res.json({message:changed?'USER_EMAIL_UPDATED':'EMAIL_UNCHANGED',mustSignInAgain:self&&changed});
 }catch(error){await conn.rollback();if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'EMAIL_ALREADY_REGISTERED'});throw error;}
 finally{conn.release();}
}

export async function createUser(req,res){
 const data=createSchema.parse(req.body),{tenantId,pool,user}=req.auth;
 if(user.role_code!=='OWNER'&&!user.branchIds.includes(String(data.branchId)))return res.status(403).json({error:'BRANCH_ACCESS_DENIED'});
 const conn=await pool.getConnection();let directoryCreated=false;
 try {
  const [[other]]=await centralPool().execute('SELECT email FROM login_directory WHERE email=?',[data.email]);
  if(other) return res.status(409).json({error:'EMAIL_ALREADY_REGISTERED'});
  const encoded=await hashPassword(data.password);
  await conn.beginTransaction();await validBranch(conn,data.branchId);
  const role=await roleId(conn,data.role);
  const [created]=await conn.execute('INSERT INTO users(full_name,username,email,phone,password_hash,must_change_password) VALUES(?,?,?,?,?,1)',
   [data.fullName,data.username,data.email,data.phone||null,encoded]);
  await conn.execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)',[created.insertId,role]);
  await conn.execute('INSERT INTO user_branch_access(user_id,branch_id) VALUES(?,?)',[created.insertId,data.branchId]);
  await conn.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type,details) VALUES(?,?,'USER_CREATED',JSON_OBJECT('role',?,'branchId',?))`,[user.id,created.insertId,data.role,data.branchId]);
  await centralPool().execute('INSERT INTO login_directory(email,tenant_id,tenant_user_id) VALUES(?,?,?)',[data.email,tenantId,created.insertId]);
  directoryCreated=true;
  await conn.commit();
  return res.status(201).json({message:'USER_CREATED',userId:String(created.insertId)});
 }catch(error){
  try{await conn.rollback();}catch{};
  if(directoryCreated) await centralPool().execute('DELETE FROM login_directory WHERE email=? AND tenant_id=?',[data.email,tenantId]).catch(()=>{});
  if(error.code==='ER_DUP_ENTRY')return res.status(409).json({error:'EMAIL_ALREADY_REGISTERED'});
  throw error;
 }finally{conn.release();}
}
export async function updateUser(req,res){
 const data=updateSchema.parse(req.body),{pool,user,tenantId}=req.auth,id=String(req.params.id);
 if(user.role_code!=='OWNER'&&!user.branchIds.includes(String(data.branchId)))return res.status(403).json({error:'BRANCH_ACCESS_DENIED'});
 if(!/^[1-9]\d*$/.test(id))return res.status(400).json({error:'INVALID_USER_ID'});
 if(id===String(user.id))return res.status(409).json({error:'SELF_ROLE_STATUS_CHANGE_BLOCKED'});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[target]]=await conn.execute(`SELECT r.code,u.status,u.email FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=? FOR UPDATE`,[id]);
  if(!target)throw Object.assign(new Error('USER_NOT_FOUND'),{status:404});
  if(target.code==='OWNER')throw Object.assign(new Error('OWNER_PROTECTED'),{status:403});
  await validBranch(conn,data.branchId);
  const role=await roleId(conn,data.role);
  await conn.execute(`UPDATE users SET full_name=?,username=?,phone=?,status=?,auth_version=auth_version+1 WHERE id=?`,[data.fullName,data.username,data.phone||null,data.status,id]);
  await conn.execute('DELETE FROM user_roles WHERE user_id=?',[id]);
  await conn.execute('INSERT INTO user_roles(user_id,role_id) VALUES(?,?)',[id,role]);
  await conn.execute('DELETE FROM user_branch_access WHERE user_id=?',[id]);
  await conn.execute('INSERT INTO user_branch_access(user_id,branch_id) VALUES(?,?)',[id,data.branchId]);
  if(data.email!==undefined && data.email!==target.email){
   if(!['OWNER','ADMIN'].includes(user.role_code))throw Object.assign(new Error('EMAIL_EDIT_NOT_ALLOWED'),{status:403});
   await changeEmailWithinTransaction(conn,{tenantId,targetId:id,targetEmail:target.email,newEmail:data.email,actorId:user.id,targetRole:target.code});
  }
  await conn.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type,details) VALUES(?,?,'USER_UPDATED',JSON_OBJECT('role',?,'status',?,'branchId',?))`,
   [user.id,id,data.role,data.status,data.branchId]);
  await conn.commit();return res.json({message:'USER_UPDATED'});
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'EMAIL_OR_USERNAME_ALREADY_REGISTERED'});throw e;}finally{conn.release();}
}
export async function unlockUser(req,res){
 const {pool,user}=req.auth,id=String(req.params.id);
 if(!/^[1-9]\d*$/.test(id))return res.status(400).json({error:'INVALID_USER_ID'});
 const [[target]]=await pool.execute(`SELECT r.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=?`,[id]);
 if(!target)return res.status(404).json({error:'USER_NOT_FOUND'});
 if(target.code==='OWNER'&&user.role_code!=='OWNER')return res.status(403).json({error:'OWNER_PROTECTED'});
 await pool.execute('UPDATE users SET failed_login_attempts=0,locked_until=NULL WHERE id=?',[id]);
 await pool.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type) VALUES(?,?,'USER_UNLOCKED')`,[user.id,id]);
 return res.json({message:'USER_UNLOCKED'});
}
export async function resetUserPassword(req,res){
 const data=z.object({password:z.string().min(12).max(128)}).strict().parse(req.body);
 const {pool,user}=req.auth,id=String(req.params.id);
 if(!/^[1-9]\d*$/.test(id))return res.status(400).json({error:'INVALID_USER_ID'});
 const [[target]]=await pool.execute(`SELECT r.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=?`,[id]);
 if(!target)return res.status(404).json({error:'USER_NOT_FOUND'});
 if(target.code==='OWNER')return res.status(403).json({error:'OWNER_PROTECTED'});
 const encoded=await hashPassword(data.password);
 await pool.execute('UPDATE users SET password_hash=?,must_change_password=1,failed_login_attempts=0,locked_until=NULL,auth_version=auth_version+1 WHERE id=?',[encoded,id]);
 await pool.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type) VALUES(?,?,'USER_PASSWORD_RESET')`,[user.id,id]);
 return res.json({message:'USER_PASSWORD_RESET'});
}
