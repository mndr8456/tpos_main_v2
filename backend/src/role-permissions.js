// Role Permission R1. Read-only matrix, one-transaction optimistic save and append-only audit.
// No CSV import/export endpoints. No historical default reset endpoint.
import {z} from 'zod';
import {ROLE_MODULES,PLANNED_MODULES,ROLE_CODES,isVisibleSpecial} from './role-permission-catalog.js';

const roleCodes = new Set(ROLE_CODES);
const truth = value => Number(value) === 1;
const fail = (message,status=403) => {throw Object.assign(new Error(message),{status});};
const isEditor = req => ['OWNER','ADMIN'].includes(req.auth.user.role_code)
 && req.auth.user.permissions.includes('role_permissions.manage');

export function rolePermissionEditor(req,res,next){
 if(!isEditor(req))return res.status(403).json({error:'ROLE_PERMISSION_MANAGE_DENIED'});
 return next();
}
export function rolePermissionReader(req,res,next){
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)||!req.auth.user.permissions.includes('role_permissions.view'))
  return res.status(403).json({error:'ROLE_PERMISSION_VIEW_DENIED'});
 return next();
}

export function catalogFromPermissionCodes(codes){
 const catalog=new Set(codes);
 const modules=ROLE_MODULES.map(m=>({
  key:m.key,name:m.name,planned:false,
  crud:Object.fromEntries(Object.entries(m.crud).map(([key,code])=>[key,code&&catalog.has(code)?code:null])),
  special:codes.filter(code=>code.startsWith(`${m.key}.`)&&isVisibleSpecial(code)&&!Object.values(m.crud).includes(code)&&!(code===`${m.key}.manage`&&Boolean(m.crud.create||m.crud.update||m.crud.delete))
  ).map(code=>({code,name:code.split('.').slice(1).join(' ').replaceAll('_',' ')})),
 }));
 const known=new Set(ROLE_MODULES.map(m=>m.key));
 const extra=[...new Set(codes.filter(isVisibleSpecial).map(code=>code.split('.')[0]))].filter(code=>!known.has(code));
 for(const key of extra){
  const prefix=`${key}.`;
  const crud={create:catalog.has(prefix+'create')?prefix+'create':null,read:catalog.has(prefix+'view')?prefix+'view':catalog.has(prefix+'read')?prefix+'read':null,update:catalog.has(prefix+'update')?prefix+'update':null,delete:catalog.has(prefix+'delete')?prefix+'delete':null};
  modules.push({key,name:key.replaceAll('_',' ').replace(/\b\w/g,s=>s.toUpperCase()),planned:false,crud,
   special:codes.filter(c=>c.startsWith(prefix)&&isVisibleSpecial(c)&&!Object.values(crud).includes(c)&&!c.endsWith('.manage')).map(code=>({code,name:code.slice(prefix.length).replaceAll('.',' ').replaceAll('_',' ')}))});
 }
 return [...modules,...PLANNED_MODULES.filter(m=>!extra.includes(m.key)).map(m=>({...m,special:[]}))];
}
const visibleKeys=modules=>new Set(modules.flatMap(m=>[...Object.values(m.crud).filter(Boolean),...(m.special||[]).map(x=>x.code)]));

export async function getRolePermissions(req,res){
 const pool=req.auth.pool;
 const [[roles],[permissions],[grants],[revisions]]=await Promise.all([
  pool.execute('SELECT id,code,name FROM roles ORDER BY id'),
  pool.execute('SELECT code,description FROM permissions ORDER BY code'),
  pool.execute('SELECT r.code AS role_code,rp.permission_code FROM role_permissions rp JOIN roles r ON r.id=rp.role_id ORDER BY r.id,rp.permission_code'),
  pool.execute('SELECT r.code AS role_code,rv.revision FROM role_permission_revisions rv JOIN roles r ON r.id=rv.role_id ORDER BY r.id')
 ]);
 const catalog=catalogFromPermissionCodes(permissions.map(x=>x.code));
 const publicKeys=visibleKeys(catalog);
 const matrix=Object.fromEntries(roles.filter(r=>roleCodes.has(r.code)).map(r=>[r.code,[]]));
 for(const g of grants)if(matrix[g.role_code]&&publicKeys.has(g.permission_code))matrix[g.role_code].push(g.permission_code);
 const editsAllowed=isEditor(req);
 const owned=req.auth.user.role_code==='OWNER';
 res.set('Cache-Control','no-store').json({
  roles:roles.filter(r=>roleCodes.has(r.code)).map(r=>({code:r.code,name:r.name,locked:r.code==='OWNER'||!editsAllowed||(!owned&&r.code==='ADMIN')})),
  modules:catalog, grants:matrix,
  revisions:Object.fromEntries(revisions.map(x=>[x.role_code,String(x.revision)])),
  actorRole:req.auth.user.role_code,canManage:editsAllowed,permissionCount:permissions.length,
  moduleCount:catalog.filter(x=>!x.planned).length,
 });
}

const updateInput=z.object({
 changes:z.array(z.object({role:z.enum(ROLE_CODES),permission:z.string().regex(/^[a-z][a-z_.]{2,79}$/),allowed:z.boolean()}).strict()).min(1).max(250),
 revisions:z.record(z.string(),z.union([z.string().regex(/^\d{1,16}$/),z.number().int().min(0).safe()])),
 reason:z.string().trim().min(4).max(500),
}).strict();

export async function updateRolePermissions(req,res){
 const body=updateInput.parse(req.body),actor=req.auth.user,owner=actor.role_code==='OWNER';
 const sorted=body.changes.map(x=>`${x.role}|${x.permission}`);
 if(new Set(sorted).size!==sorted.length)fail('DUPLICATE_ROLE_PERMISSION_CHANGE',400);
 for(const change of body.changes){
  if(change.role==='OWNER'||!roleCodes.has(change.role))fail('OWNER_ROLE_LOCKED',403);
  if(!owner&&change.role==='ADMIN')fail('ADMIN_ROLE_PROTECTED',403);
  if(!owner&&change.allowed&&!actor.permissions.includes(change.permission))fail('CANNOT_GRANT_UNOWNED_PERMISSION',403);
 }
 const rolesToUpdate=[...new Set(body.changes.map(c=>c.role))].sort();
 for(const role of rolesToUpdate)if(!Object.hasOwn(body.revisions,role))fail('MISSING_ROLE_REVISION',400);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  // Read tenant catalog within transaction: absent/retired permission keys never become valid.
  const [permissionRows]=await conn.execute('SELECT code FROM permissions ORDER BY code');
  const allowed=visibleKeys(catalogFromPermissionCodes(permissionRows.map(x=>x.code)));
  for(const c of body.changes)if(!allowed.has(c.permission))fail('PERMISSION_NOT_CONFIGURABLE',422);
  const revisionRows=new Map(),roleIds=new Map();
  for(const code of rolesToUpdate){
   const [[r]]=await conn.execute(`SELECT r.id,rv.revision FROM roles r JOIN role_permission_revisions rv ON rv.role_id=r.id WHERE r.code=? FOR UPDATE`,[code]);
   if(!r)fail('ROLE_REVISION_NOT_FOUND',409);
   if(BigInt(r.revision)!==BigInt(body.revisions[code]))fail('ROLE_PERMISSION_STALE_RELOAD_REQUIRED',409);
   revisionRows.set(code,BigInt(r.revision));roleIds.set(code,r.id);
  }
  const changes=[];
  for(const input of body.changes){
   const roleId=roleIds.get(input.role);
   const [[existing]]=await conn.execute('SELECT permission_code FROM role_permissions WHERE role_id=? AND permission_code=? FOR UPDATE',[roleId,input.permission]);
   const was=Boolean(existing);
   if(was===input.allowed)continue;
   if(input.allowed)await conn.execute('INSERT INTO role_permissions(role_id,permission_code) VALUES(?,?)',[roleId,input.permission]);
   else await conn.execute('DELETE FROM role_permissions WHERE role_id=? AND permission_code=?',[roleId,input.permission]);
   changes.push({...input,was});
  }
  const changedRoles=[...new Set(changes.map(x=>x.role))];
  for(const code of changedRoles){
   const revision=(revisionRows.get(code)+1n).toString();
   await conn.execute('UPDATE role_permission_revisions SET revision=?,updated_at=UTC_TIMESTAMP(6) WHERE role_id=?',[revision,roleIds.get(code)]);
  }
  for(const c of changes){
   await conn.execute(`INSERT INTO role_permission_change_audit(actor_user_id,role_id,permission_code,prior_allowed,new_allowed,change_reason,revision)
     VALUES(?,?,?,?,?,?,?)`,[actor.id,roleIds.get(c.role),c.permission,c.was?1:0,c.allowed?1:0,body.reason,(revisionRows.get(c.role)+1n).toString()]);
  }
  if(changes.length)await conn.execute(`INSERT INTO user_activity_logs(actor_user_id,target_user_id,event_type,details) VALUES (?,NULL,'ROLE_PERMISSIONS_UPDATED',?)`,[actor.id,JSON.stringify({changedRoles,changedCount:changes.length,reason:body.reason})]);
  await conn.commit();
  res.set('Cache-Control','no-store').json({message:'ROLE_PERMISSIONS_SAVED',changedCount:changes.length,reloadPermissions:true});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}

export async function getRolePermissionAudit(req,res){
 const limit=z.coerce.number().int().min(1).max(200).default(100).parse(req.query.limit);
 const [rows]=await req.auth.pool.execute(`SELECT a.id,a.permission_code,a.prior_allowed,a.new_allowed,a.change_reason,
 DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,
 r.code AS role_code,u.full_name AS actor_name,a.revision
 FROM role_permission_change_audit a JOIN roles r ON r.id=a.role_id JOIN users u ON u.id=a.actor_user_id
 ORDER BY a.id DESC LIMIT ${limit}`);
 res.set('Cache-Control','no-store').json({logs:rows.map(x=>({...x,id:String(x.id),revision:String(x.revision),prior_allowed:truth(x.prior_allowed),new_allowed:truth(x.new_allowed)}))});
}
