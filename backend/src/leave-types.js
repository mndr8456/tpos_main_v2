import {z} from 'zod';
import {LeaveTypeError,attendanceMappings,leaveStatuses,leaveGenders,leaveHeaders,leaveCsvTemplate,normalizeLeaveType,parseLeaveCsv} from './leave-type-rules.js';
const adminRoles=new Set(['OWNER','ADMIN','HR']);
const roles=new Set([...adminRoles,'MANAGER']);
const forbid=(message,status=403)=>{throw new LeaveTypeError(message,status);};
const authorize=(req,action='view')=>{
 const role=String(req.auth?.user?.role_code||'').toUpperCase();
 if(action==='view'? !roles.has(role):!adminRoles.has(role))forbid('LEAVE_TYPES_ACCESS_DENIED');
};
const idSchema=z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const display=`lt.id,lt.leave_code,lt.leave_name,lt.description,lt.attendance_status,lt.default_entitlement_days,lt.is_paid,lt.requires_attachment,lt.allow_half_day,lt.allow_carry_forward,lt.max_carry_forward_days,lt.max_days_per_request,lt.minimum_service_months,lt.gender_restriction,lt.sort_order,lt.status,DATE_FORMAT(lt.created_at,'%Y-%m-%d %H:%i') AS created_at,DATE_FORMAT(lt.updated_at,'%Y-%m-%d %H:%i') AS updated_at`;
const asPublic=row=>({...row,id:String(row.id),is_paid:Number(row.is_paid),requires_attachment:Number(row.requires_attachment),allow_half_day:Number(row.allow_half_day),allow_carry_forward:Number(row.allow_carry_forward)});
const fields=[...leaveHeaders];
const inputValues=p=>fields.map(key=>p[key]??null);
async function transaction(pool,fn){const c=await pool.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')forbid('LEAVE_CODE_ALREADY_EXISTS',409);throw e;}finally{c.release();}}
async function audit(conn,req,id,action,fieldsChanged=[]){await conn.execute('INSERT INTO hr_leave_type_audit_logs(leave_type_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[id,req.auth.user.id,action,JSON.stringify({fields:fieldsChanged})]);}
async function find(conn,id,lock=false){const [[row]]=await conn.execute(`SELECT ${display} FROM hr_leave_types lt WHERE lt.id=? AND lt.is_deleted=0 ${lock?'FOR UPDATE':''}`,[id]);if(!row)forbid('LEAVE_TYPE_NOT_FOUND',404);return row;}
const filters=z.object({search:z.string().trim().max(150).optional().default(''),attendanceStatus:z.enum(attendanceMappings).optional(),isPaid:z.enum(['0','1']).optional(),requiresAttachment:z.enum(['0','1']).optional(),status:z.enum(leaveStatuses).optional(),limit:z.coerce.number().int().min(1).max(1000).default(100)}).strict();
export async function leaveTypeMeta(req,res){authorize(req);res.set('Cache-Control','no-store').json({attendanceStatuses:attendanceMappings,payTypes:['0','1'],genderRestrictions:leaveGenders,statuses:leaveStatuses,limits:[25,50,100,200,500,1000],canManage:adminRoles.has(req.auth.user.role_code)});}
export async function leaveTypeList(req,res){authorize(req);const f=filters.parse(req.query);
 const predicates=['lt.is_deleted=0'],args=[];
 if(f.search){const q=`%${f.search}%`;predicates.push('(lt.leave_code LIKE ? OR lt.leave_name LIKE ? OR lt.description LIKE ?)');args.push(q,q,q);}
 if(f.attendanceStatus){predicates.push('lt.attendance_status=?');args.push(f.attendanceStatus);}
 if(f.isPaid!==undefined){predicates.push('lt.is_paid=?');args.push(Number(f.isPaid));}
 if(f.requiresAttachment!==undefined){predicates.push('lt.requires_attachment=?');args.push(Number(f.requiresAttachment));}
 if(f.status){predicates.push('lt.status=?');args.push(f.status);}
 const where=predicates.join(' AND ');
 const [[counts],[items]]=await Promise.all([
  req.auth.pool.execute(`SELECT COUNT(*) AS total,COALESCE(SUM(lt.status='active'),0) AS active,COALESCE(SUM(lt.is_paid=1),0) AS paid,COALESCE(SUM(lt.requires_attachment=1),0) AS attachment FROM hr_leave_types lt WHERE ${where}`,args),
  req.auth.pool.execute(`SELECT ${display} FROM hr_leave_types lt WHERE ${where} ORDER BY lt.sort_order ASC,lt.leave_code ASC,lt.id ASC LIMIT ${f.limit}`,args)
 ]);
 const count=counts[0]||{};
 res.set('Cache-Control','no-store').json({items:items.map(asPublic),summary:{totalRecords:Number(count.total||0),active:Number(count.active||0),paid:Number(count.paid||0),attachmentRequired:Number(count.attachment||0)}});
}
export async function leaveTypeDetail(req,res){authorize(req);const row=await find(req.auth.pool,idSchema.parse(req.params.id));res.set('Cache-Control','no-store').json({item:asPublic(row)});}
export async function leaveTypeCreate(req,res){authorize(req,'manage');const policy=normalizeLeaveType(req.body);
 const inserted=await transaction(req.auth.pool,async conn=>{
  const [result]=await conn.execute(`INSERT INTO hr_leave_types (${fields.join(',')},created_by_user_id,updated_by_user_id) VALUES (${fields.map(()=>'?').join(',')},?,?)`,[...inputValues(policy),req.auth.user.id,req.auth.user.id]);
  await audit(conn,req,result.insertId,'CREATE',fields);return result.insertId;
 });res.status(201).json({message:'LEAVE_TYPE_CREATED',id:String(inserted)});
}
export async function leaveTypeUpdate(req,res){authorize(req,'manage');const id=idSchema.parse(req.params.id),policy=normalizeLeaveType(req.body);
 await transaction(req.auth.pool,async conn=>{
  const previous=await find(conn,id,true);
  if(previous.leave_code!==policy.leave_code)forbid('LEAVE_CODE_CANNOT_CHANGE',409);
  const changed=fields.filter(k=>String(previous[k]??'')!==String(policy[k]??''));
  if(!changed.length)return;
  const keys=fields.filter(k=>k!=='leave_code');
  await conn.execute(`UPDATE hr_leave_types SET ${keys.map(k=>`${k}=?`).join(',')},updated_by_user_id=? WHERE id=?`,[...keys.map(k=>policy[k]),req.auth.user.id,id]);
  await audit(conn,req,id,'UPDATE',changed);
 });res.json({message:'LEAVE_TYPE_UPDATED'});
}
export async function leaveTypeStatus(req,res){authorize(req,'manage');const id=idSchema.parse(req.params.id),body=z.object({status:z.enum(leaveStatuses)}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{
  const previous=await find(conn,id,true);if(previous.status===body.status)return;
  await conn.execute('UPDATE hr_leave_types SET status=?,updated_by_user_id=? WHERE id=?',[body.status,req.auth.user.id,id]);
  await audit(conn,req,id,body.status==='active'?'REACTIVATE':'DEACTIVATE',['status']);
 });res.json({message:'LEAVE_TYPE_STATUS_UPDATED'});
}
export async function leaveTypeAudit(req,res){authorize(req,'manage');const id=idSchema.parse(req.params.id);await find(req.auth.pool,id);
 const [rows]=await req.auth.pool.execute(`SELECT l.id,l.action_type,l.details,DATE_FORMAT(l.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,COALESCE(u.full_name,'System') AS actor_name FROM hr_leave_type_audit_logs l LEFT JOIN users u ON u.id=l.actor_user_id WHERE l.leave_type_id=? ORDER BY l.id DESC LIMIT 100`,[id]);res.set('Cache-Control','no-store').json({logs:rows.map(r=>({...r,id:String(r.id)}))});}
export function leaveTypeTemplate(req,res){authorize(req,'manage');res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('leave-types-template.csv').send(leaveCsvTemplate());}
const importBody=z.object({csv:z.string().max(1024*1024)}).strict();
async function importReview(pool,csv){
 const rows=parseLeaveCsv(csv);
 const candidates=[...new Set(rows.map(r=>r.code).filter(Boolean))];
 let existing=new Set();
 if(candidates.length){const [found]=await pool.execute(`SELECT leave_code FROM hr_leave_types WHERE leave_code IN (${candidates.map(()=>'?').join(',')})`,candidates);existing=new Set(found.map(r=>String(r.leave_code).toUpperCase()));}
 const review=rows.map(row=>({row:row.row,code:row.code,errors:[...row.errors,...(existing.has(row.code)?['Leave Code already exists in this tenant.']:[])],...(row.policy?{policy:row.policy}:{})}));
 return {rows:review,total:review.length,valid:review.filter(r=>r.errors.length===0).length,invalid:review.filter(r=>r.errors.length>0).length,canConfirm:review.length>0&&review.every(r=>r.errors.length===0)};
}
export async function leaveTypeImportPreview(req,res){authorize(req,'manage');const {csv}=importBody.parse(req.body);const result=await importReview(req.auth.pool,csv);res.set('Cache-Control','no-store').json(result);}
export async function leaveTypeImportConfirm(req,res){authorize(req,'manage');const {csv}=importBody.parse(req.body);const preliminary=parseLeaveCsv(csv);
 if(!preliminary.length||preliminary.some(r=>r.errors.length))forbid('IMPORT_PREVIEW_HAS_ERRORS',422);
 const count=await transaction(req.auth.pool,async conn=>{
  // Re-check against current tenant codes inside the transaction; unique constraint guards races.
  const review=await importReview(conn,csv);if(!review.canConfirm)forbid('IMPORT_PREVIEW_HAS_ERRORS',422);
  for(const item of review.rows){const [created]=await conn.execute(`INSERT INTO hr_leave_types (${fields.join(',')},created_by_user_id,updated_by_user_id) VALUES (${fields.map(()=>'?').join(',')},?,?)`,[...inputValues(item.policy),req.auth.user.id,req.auth.user.id]);await audit(conn,req,created.insertId,'IMPORT_CREATE',fields);}
  return review.rows.length;
 });res.status(201).json({message:'LEAVE_TYPES_IMPORTED',count});
}
