import {granularForRoute} from './role-permission-crud-guard.js';
import { z } from 'zod';
import { centralPool, tenantPool } from './database.js';
import { freshToken, hashPassword, tokenHash, verifyPassword } from './passwords.js';
import { settings } from './config.js';

const cookieName='tpos_v2r_session';
const loginSchema=z.object({email:z.email().max(254),password:z.string().min(1).max(128)}).strict();
const cookieOptions = () => `HttpOnly; SameSite=Strict; Path=/api/v2; Max-Age=${settings.sessionHours * 3600}${process.env.NODE_ENV==='production'?'; Secure':''}`;
function cookieValue(header) {
 const found=String(header || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${cookieName}=`));
 return found ? found.slice(cookieName.length + 1) : '';
}
const metadata=async (pool,id) => {
 const [[u]] = await pool.execute(`SELECT u.id,u.full_name,u.username,u.email,u.status,u.must_change_password,u.auth_version,r.code AS role_code
 FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=? LIMIT 1`,[id]);
 if(!u)return null;
 const [permissions]=await pool.execute(`SELECT DISTINCT rp.permission_code AS code FROM user_roles ur JOIN role_permissions rp ON rp.role_id=ur.role_id WHERE ur.user_id=?`,[id]);
 const [branches]=await pool.execute('SELECT branch_id FROM user_branch_access WHERE user_id=? ORDER BY branch_id',[id]);
 return {...u,permissions:permissions.map(x=>x.code),branchIds:branches.map(x=>String(x.branch_id))};
};
const lookupCompany=async tenantId=>{
 const [[tenant]]=await centralPool().execute('SELECT business_name,business_type,status FROM tenants WHERE id=?',[tenantId]);
 return tenant?.status==='ACTIVE' ? tenant : null;
};
export async function login(req,res){
 const {email,password}=loginSchema.parse(req.body); const normalized=email.trim().toLowerCase();
 const [[entry]]=await centralPool().execute(`SELECT d.tenant_id,d.tenant_user_id,t.business_name,t.business_type,t.status AS tenant_status FROM login_directory d
 JOIN tenants t ON t.id=d.tenant_id WHERE d.email=? LIMIT 1`,[normalized]);
 if(!entry || entry.tenant_status!=='ACTIVE') return res.status(401).json({error:'INVALID_CREDENTIALS'});
 const pool=tenantPool(entry.tenant_id);
 const [[user]]=await pool.execute(`SELECT id,email,password_hash,status,failed_login_attempts,(locked_until>UTC_TIMESTAMP(6)) AS locked FROM users WHERE id=? LIMIT 1`,[entry.tenant_user_id]);
 if(!user || user.email!==normalized || user.status!=='ACTIVE') return res.status(401).json({error:'INVALID_CREDENTIALS'});
 if(user.locked) return res.status(423).json({error:'ACCOUNT_LOCKED'});
 const valid=await verifyPassword(password,user.password_hash);
 if(!valid) {
  await pool.execute(`UPDATE users SET failed_login_attempts=failed_login_attempts+1,
   locked_until=CASE WHEN failed_login_attempts+1>=5 THEN TIMESTAMPADD(MINUTE,15,UTC_TIMESTAMP(6)) ELSE NULL END WHERE id=?`,[user.id]);
  return res.status(401).json({error:'INVALID_CREDENTIALS'});
 }
 await pool.execute('UPDATE users SET failed_login_attempts=0,locked_until=NULL,last_login_at=UTC_TIMESTAMP(6) WHERE id=?',[user.id]);
 const profile=await metadata(pool,user.id);
 const token=freshToken();
 const [insert]=await pool.execute('INSERT INTO user_sessions(user_id,token_hash,auth_version,expires_at) VALUES(?,?,?,TIMESTAMPADD(HOUR,?,UTC_TIMESTAMP(6)))',
  [user.id,tokenHash(token),profile.auth_version,settings.sessionHours]);
 await pool.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type) VALUES(?,?,'LOGIN')`,[user.id,user.id]);
 res.setHeader('Set-Cookie',`${cookieName}=${entry.tenant_id}.${insert.insertId}.${token}; ${cookieOptions()}`);
 return res.json({message:'SIGNED_IN',user:{id:String(profile.id),fullName:profile.full_name,username:profile.username,mustChangePassword:Boolean(profile.must_change_password),email:profile.email,role:profile.role_code,permissions:profile.permissions,branchIds:profile.branchIds},business:{name:entry.business_name,type:entry.business_type}});
}
export async function authenticate(req,res,next){
 try{
  const value=cookieValue(req.headers.cookie);
  const match=/^([1-9]\d{0,14})\.([1-9]\d{0,14})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if(!match) return res.status(401).json({error:'UNAUTHENTICATED'});
  const [,tenantId,sessionId,secret]=match;
  const company=await lookupCompany(tenantId);
  if(!company) return res.status(401).json({error:'UNAUTHENTICATED'});
  const pool=tenantPool(tenantId);
  const [[session]]=await pool.execute(`SELECT s.user_id,s.auth_version,u.status,u.auth_version AS user_auth_version
   FROM user_sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(6) LIMIT 1`,[sessionId,tokenHash(secret)]);
  if(!session || session.status!=='ACTIVE' || Number(session.auth_version)!==Number(session.user_auth_version)) return res.status(401).json({error:'UNAUTHENTICATED'});
  const user=await metadata(pool,session.user_id);
  if(!user) return res.status(401).json({error:'UNAUTHENTICATED'});
  req.auth={tenantId,sessionId,user,pool,company};
  if(user.must_change_password && !['/api/v2/auth/me','/api/v2/auth/change-password','/api/v2/auth/logout'].includes(req.path))return res.status(403).json({error:'PASSWORD_CHANGE_REQUIRED'});
  next();
 }catch(error){next(error);}
}
export const permitted=code=>(req,res,next)=>{
 const grants=req.auth?.user?.permissions||[];
 const granular=granularForRoute(code,req.method,req.path);
 // Once 034 is installed, a legacy manage grant cannot bypass a revoked CRUD checkbox.
 if(granular)return grants.includes(granular)?next():res.status(403).json({error:'PERMISSION_DENIED'});
 return grants.includes(code)?next():res.status(403).json({error:'PERMISSION_DENIED'});
};
export async function me(req,res){
 const {user,company}=req.auth;
 return res.json({user:{id:String(user.id),fullName:user.full_name,username:user.username,mustChangePassword:Boolean(user.must_change_password),email:user.email,role:user.role_code,permissions:user.permissions,branchIds:user.branchIds},business:{name:company.business_name,type:company.business_type}});
}
export async function logout(req,res){
 const {pool,sessionId,user}=req.auth;
 await pool.execute('DELETE FROM user_sessions WHERE id=?',[sessionId]);
 await pool.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type) VALUES(?,?,'LOGOUT')`,[user.id,user.id]);
 res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/api/v2; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);
 return res.json({message:'SIGNED_OUT'});
}
export async function changePassword(req,res){
 const values=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(12).max(128)}).strict().parse(req.body);
 const {pool,user}=req.auth;
 const [[stored]]=await pool.execute('SELECT password_hash FROM users WHERE id=?',[user.id]);
 if(!await verifyPassword(values.currentPassword,stored.password_hash))return res.status(400).json({error:'WRONG_PASSWORD'});
 const encoded=await hashPassword(values.newPassword);
 await pool.execute('UPDATE users SET password_hash=?,must_change_password=0,auth_version=auth_version+1 WHERE id=?',[encoded,user.id]);
 await pool.execute('DELETE FROM user_sessions WHERE user_id=?',[user.id]);
 await pool.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type) VALUES(?,?,'PASSWORD_CHANGED')`,[user.id,user.id]);
 res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/api/v2; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);
 return res.json({message:'PASSWORD_CHANGED_LOGIN_AGAIN'});
}
