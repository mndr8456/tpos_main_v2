// HR Leave Balances R1. Tenant-isolated annual ledger; Leave Requests reconciliation deliberately locked.
import {z} from 'zod';
import {LeaveBalanceError,validateBalance,parseBalanceCsv,balanceCsvTemplate} from './leave-balance-rules.js';
const managers=new Set(['OWNER','ADMIN','HR']);
const readers=new Set([...managers,'MANAGER']);
function requireRole(req,mode='view'){
 const role=String(req.auth?.user?.role_code||'').toUpperCase();
 if(!(mode==='view'?readers:managers).has(role))throw new LeaveBalanceError('LEAVE_BALANCES_ACCESS_DENIED',403);
}
const id=z.coerce.number().int().positive();
const year=z.coerce.number().int().min(2000).max(2100);
const statusSchema=z.object({status:z.enum(['active','inactive']),reason:z.string().trim().min(4).max(1000)}).strict();
const fields=['staff_profile_id','leave_type_id','balance_year','entitlement_days','carried_forward_days','adjustment_days','used_days','pending_days','expired_days','adjustment_notes','status'];
const moneyFields=['entitlement_days','carried_forward_days','adjustment_days','used_days','pending_days','expired_days'];
const select=`b.id,b.staff_profile_id,b.leave_type_id,b.balance_year,b.entitlement_days,b.carried_forward_days,b.adjustment_days,b.used_days,b.pending_days,b.expired_days,b.remaining_days,b.adjustment_notes,b.status,DATE_FORMAT(b.last_recalculated_at,'%Y-%m-%d %H:%i:%s') AS last_recalculated_at,DATE_FORMAT(b.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,DATE_FORMAT(b.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at,sp.staff_no,sp.department,sp.job_title,u.full_name,lt.leave_code,lt.leave_name,lt.sort_order`;
const joins=`FROM hr_leave_balances b JOIN staff_profiles sp ON sp.id=b.staff_profile_id JOIN users u ON u.id=sp.user_id JOIN hr_leave_types lt ON lt.id=b.leave_type_id`;
const publicRow=r=>({...r,id:String(r.id),staff_profile_id:String(r.staff_profile_id),leave_type_id:String(r.leave_type_id)});
function fail(message,status=400){throw new LeaveBalanceError(message,status);}
async function transaction(pool,fn){const c=await pool.getConnection();try{await c.beginTransaction();const v=await fn(c);await c.commit();return v;}catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')fail('LEAVE_BALANCE_ALREADY_EXISTS',409);throw e;}finally{c.release();}}
async function audit(c,req,balanceId,action,reason,before=null,after=null){await c.execute('INSERT INTO hr_leave_balance_audit_logs(balance_id,actor_user_id,action_type,reason,previous_data,next_data) VALUES(?,?,?,?,?,?)',[balanceId,req.auth.user.id,action,reason,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);}
async function getBalance(c,balanceId,lock=false){const [[row]]=await c.execute(`SELECT ${select} ${joins} WHERE b.id=? ${lock?'FOR UPDATE':''}`,[balanceId]);if(!row)fail('LEAVE_BALANCE_NOT_FOUND',404);return row;}
async function checkReferences(c,record,{requireActive=false}={}){
 const [[staff]]=await c.execute(`SELECT sp.id,sp.status,sp.employment_status,u.status AS user_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.id=?`,[record.staff_profile_id]);
 if(!staff)fail('STAFF_PROFILE_NOT_FOUND',404);
 const [[type]]=await c.execute('SELECT id,status,default_entitlement_days,sort_order,allow_half_day,allow_carry_forward,max_carry_forward_days FROM hr_leave_types WHERE id=? AND is_deleted=0',[record.leave_type_id]);
 if(!type)fail('LEAVE_TYPE_NOT_FOUND',404);
 if(requireActive&&(staff.status!=='active'||staff.user_status!=='ACTIVE'||!['Active','Probation'].includes(staff.employment_status)||type.status!=='active'))fail('STAFF_OR_LEAVE_TYPE_INACTIVE',422);
 if(Number(record.carried_forward_days)>0&&!Number(type.allow_carry_forward))fail('CARRY_FORWARD_NOT_ALLOWED',422);
 if(Number(record.carried_forward_days)>Number(type.max_carry_forward_days))fail('CARRY_FORWARD_EXCEEDS_POLICY',422);
 if(!Number(type.allow_half_day)&&moneyFields.some(key=>Math.abs(Math.round(Number(record[key])*100))%100!==0))fail('HALF_DAY_NOT_ALLOWED_FOR_LEAVE_TYPE',422);
}
async function queryLookups(pool){const [[staff],[types]]=await Promise.all([
 pool.execute("SELECT sp.id,sp.staff_no,sp.department,sp.job_title,u.full_name,sp.status,sp.employment_status,u.status AS user_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id ORDER BY SUBSTRING_INDEX(sp.staff_no,'-',1),CAST(SUBSTRING_INDEX(sp.staff_no,'-',-1) AS UNSIGNED),sp.id LIMIT 1500"),
 pool.execute('SELECT id,leave_code,leave_name,default_entitlement_days,sort_order,status FROM hr_leave_types WHERE is_deleted=0 ORDER BY sort_order ASC,leave_code ASC')
]);return {staff:staff.map(s=>({...s,id:String(s.id)})),leaveTypes:types.map(t=>({...t,id:String(t.id)}))};}
export async function balanceMeta(req,res){requireRole(req);const lookups=await queryLookups(req.auth.pool);res.set('Cache-Control','no-store').json({...lookups,canManage:managers.has(req.auth.user.role_code),recalculateAvailable:false,limits:[25,50,100,200,500,1000]});}
const filterSchema=z.object({search:z.string().trim().max(150).default(''),staffId:id.optional(),leaveTypeId:id.optional(),year:year.optional(),department:z.string().trim().max(150).optional(),status:z.enum(['active','inactive']).optional(),limit:z.coerce.number().int().min(1).max(1000).default(100)}).strict();
export async function balanceList(req,res){requireRole(req);const f=filterSchema.parse(req.query);const where=['1=1'],args=[];
 if(f.search){where.push('(sp.staff_no LIKE ? OR u.full_name LIKE ? OR sp.department LIKE ? OR lt.leave_name LIKE ? OR lt.leave_code LIKE ?)');const q=`%${f.search}%`;args.push(q,q,q,q,q);}
 if(f.staffId){where.push('b.staff_profile_id=?');args.push(f.staffId);}
 if(f.leaveTypeId){where.push('b.leave_type_id=?');args.push(f.leaveTypeId);}
 if(f.year){where.push('b.balance_year=?');args.push(f.year);}
 if(f.department){where.push('sp.department=?');args.push(f.department);}
 if(f.status){where.push('b.status=?');args.push(f.status);}
 const clause=where.join(' AND '),order="ORDER BY b.balance_year DESC,SUBSTRING_INDEX(sp.staff_no,'-',1) ASC,CAST(SUBSTRING_INDEX(sp.staff_no,'-',-1) AS UNSIGNED) ASC,sp.staff_no ASC,lt.sort_order ASC,lt.leave_code ASC,b.id ASC";
 const [[stats],[rows]]=await Promise.all([
 req.auth.pool.execute(`SELECT COUNT(*) AS total,COALESCE(SUM(b.entitlement_days),0) AS entitlement,COALESCE(SUM(b.carried_forward_days),0) AS carry,COALESCE(SUM(b.used_days),0) AS used,COALESCE(SUM(b.pending_days),0) AS pending,COALESCE(SUM(b.remaining_days),0) AS remaining ${joins} WHERE ${clause}`,args),
 req.auth.pool.execute(`SELECT ${select} ${joins} WHERE ${clause} ${order} LIMIT ${f.limit}`,args)
 ]);
 const summary=stats[0]||{};res.set('Cache-Control','no-store').json({items:rows.map(publicRow),summary:{totalRecords:Number(summary.total||0),entitlement:String(summary.entitlement||'0.00'),carry:String(summary.carry||'0.00'),used:String(summary.used||'0.00'),pending:String(summary.pending||'0.00'),remaining:String(summary.remaining||'0.00')}});
}
export async function balanceDetail(req,res){requireRole(req);const row=await getBalance(req.auth.pool,id.parse(req.params.id));res.set('Cache-Control','no-store').json({item:publicRow(row)});}
export async function balanceCreate(req,res){requireRole(req,'manage');const record=validateBalance(req.body);
 const newId=await transaction(req.auth.pool,async c=>{await checkReferences(c,record,{requireActive:true});
  const [result]=await c.execute(`INSERT INTO hr_leave_balances (${fields.join(',')},created_by_user_id,updated_by_user_id) VALUES (${fields.map(()=>'?').join(',')},?,?)`,[...fields.map(k=>record[k]),req.auth.user.id,req.auth.user.id]);
  await audit(c,req,result.insertId,'CREATE',record.adjustment_notes||'Initial leave entitlement',null,record);return result.insertId;
 });res.status(201).json({message:'LEAVE_BALANCE_CREATED',id:String(newId)});}
export async function balanceUpdate(req,res){requireRole(req,'manage');const input=validateBalance(req.body),balanceId=id.parse(req.params.id);
 await transaction(req.auth.pool,async c=>{const before=await getBalance(c,balanceId,true);
  if(Number(before.staff_profile_id)!==input.staff_profile_id||Number(before.leave_type_id)!==input.leave_type_id||Number(before.balance_year)!==input.balance_year)fail('BALANCE_IDENTITY_IMMUTABLE',409);
  await checkReferences(c,input);
  const changed=moneyFields.some(k=>String(before[k])!==input[k])||before.status!==input.status||String(before.adjustment_notes||'')!==input.adjustment_notes;
  if(!changed)return;
  if(!input.adjustment_notes||input.adjustment_notes.length<4)fail('ADJUSTMENT_REASON_REQUIRED',422);
  await c.execute(`UPDATE hr_leave_balances SET ${fields.slice(3).map(k=>`${k}=?`).join(',')},updated_by_user_id=? WHERE id=?`,[...fields.slice(3).map(k=>input[k]),req.auth.user.id,balanceId]);
  await audit(c,req,balanceId,'UPDATE',input.adjustment_notes,before,input);
 });res.json({message:'LEAVE_BALANCE_UPDATED'});}
export async function balanceStatus(req,res){requireRole(req,'manage');const balanceId=id.parse(req.params.id),body=statusSchema.parse(req.body);
 await transaction(req.auth.pool,async c=>{const before=await getBalance(c,balanceId,true);if(before.status===body.status)return;
  await c.execute('UPDATE hr_leave_balances SET status=?,updated_by_user_id=? WHERE id=?',[body.status,req.auth.user.id,balanceId]);
  await audit(c,req,balanceId,body.status==='active'?'REACTIVATE':'DEACTIVATE',body.reason,before,{status:body.status});
 });res.json({message:'LEAVE_BALANCE_STATUS_UPDATED'});}
export async function balanceAudit(req,res){requireRole(req,'manage');const balanceId=id.parse(req.params.id);await getBalance(req.auth.pool,balanceId);
 const [rows]=await req.auth.pool.execute(`SELECT a.id,a.action_type,a.reason,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,COALESCE(u.full_name,'System') AS actor_name FROM hr_leave_balance_audit_logs a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.balance_id=? ORDER BY a.id DESC LIMIT 100`,[balanceId]);res.set('Cache-Control','no-store').json({logs:rows.map(r=>({...r,id:String(r.id)}))});}
export async function balanceGenerate(req,res){requireRole(req,'manage');const input=z.object({year:year}).strict().parse(req.body);
 const count=await transaction(req.auth.pool,async c=>{
  const [[sc]]=await c.execute("SELECT COUNT(*) AS n FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.status='active' AND sp.employment_status IN ('Active','Probation') AND u.status='ACTIVE'");
  const [[lc]]=await c.execute("SELECT COUNT(*) AS n FROM hr_leave_types WHERE status='active' AND is_deleted=0");
  if(Number(sc.n)*Number(lc.n)>5000)fail('GENERATE_LIMIT_5000',422);
  const [rows]=await c.execute("SELECT sp.id AS staff_id,lt.id AS leave_id,lt.default_entitlement_days FROM staff_profiles sp JOIN users u ON u.id=sp.user_id CROSS JOIN hr_leave_types lt WHERE sp.status='active' AND sp.employment_status IN ('Active','Probation') AND u.status='ACTIVE' AND lt.status='active' AND lt.is_deleted=0 ORDER BY sp.id,lt.id FOR UPDATE");
  let created=0;for(const r of rows){const [saved]=await c.execute(`INSERT IGNORE INTO hr_leave_balances(staff_profile_id,leave_type_id,balance_year,entitlement_days,adjustment_notes,created_by_user_id,updated_by_user_id) VALUES(?,?,?,?,?,?,?)`,[r.staff_id,r.leave_id,input.year,r.default_entitlement_days,'Generated from active Leave Types',req.auth.user.id,req.auth.user.id]);
   if(saved.affectedRows===1){created++;await audit(c,req,saved.insertId,'GENERATE',`Generated entitlement for ${input.year}`,null,{staff_profile_id:r.staff_id,leave_type_id:r.leave_id,balance_year:input.year,entitlement_days:r.default_entitlement_days});}
  }
  return created;
 });res.json({message:'LEAVE_BALANCES_GENERATED',count,year:input.year});}
export function balanceTemplate(req,res){requireRole(req,'manage');res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('leave-balances-template.csv').send(balanceCsvTemplate());}
const importSchema=z.object({csv:z.string().max(2*1024*1024)}).strict();
async function reviewImport(c,csv){const rows=parseBalanceCsv(csv);const staffNos=[...new Set(rows.map(r=>r.staffNo).filter(Boolean))],codes=[...new Set(rows.map(r=>r.leaveCode.toUpperCase()).filter(Boolean))];
 const staff=new Map(),types=new Map();
 if(staffNos.length){const [found]=await c.execute(`SELECT sp.id,sp.staff_no,sp.status,sp.employment_status,u.status AS user_status FROM staff_profiles sp JOIN users u ON u.id=sp.user_id WHERE sp.staff_no IN (${staffNos.map(()=>'?').join(',')})`,staffNos);found.forEach(r=>staff.set(r.staff_no.toUpperCase(),r));}
 if(codes.length){const [found]=await c.execute(`SELECT id,leave_code,status,is_deleted,allow_half_day,allow_carry_forward,max_carry_forward_days FROM hr_leave_types WHERE leave_code IN (${codes.map(()=>'?').join(',')})`,codes);found.forEach(r=>types.set(r.leave_code.toUpperCase(),r));}
 const validIds=rows.filter(r=>!r.errors.length&&staff.has(r.staffNo.toUpperCase())&&types.has(r.leaveCode.toUpperCase()));let existing=new Set();
 if(validIds.length){const [found]=await c.execute(`SELECT staff_profile_id,leave_type_id,balance_year FROM hr_leave_balances WHERE (staff_profile_id,leave_type_id,balance_year) IN (${validIds.map(()=>'(?,?,?)').join(',')})`,validIds.flatMap(r=>[staff.get(r.staffNo.toUpperCase()).id,types.get(r.leaveCode.toUpperCase()).id,Number(r.year)]));existing=new Set(found.map(r=>`${r.staff_profile_id}|${r.leave_type_id}|${r.balance_year}`));}
 const checked=rows.map(r=>{const s=staff.get(r.staffNo.toUpperCase()),l=types.get(r.leaveCode.toUpperCase()),errors=[...r.errors];
  if(!s)errors.push('Staff No. does not exist.');else if(s.status!=='active'||s.user_status!=='ACTIVE'||!['Active','Probation'].includes(s.employment_status))errors.push('Staff is inactive.');
  if(!l)errors.push('Leave Code does not exist.');else if(l.status!=='active'||Number(l.is_deleted))errors.push('Leave Type is inactive.');
  if(l&&!r.errors.length){const c=r.record;if(Number(c.carried_forward_days)>0&&!Number(l.allow_carry_forward))errors.push('Carry Forward not allowed for this Leave Type.');if(Number(c.carried_forward_days)>Number(l.max_carry_forward_days))errors.push('Carry Forward exceeds Leave Type policy.');if(!Number(l.allow_half_day)&&moneyFields.some(key=>Math.abs(Math.round(Number(c[key])*100))%100!==0))errors.push('Half day quantities not allowed for this Leave Type.');}
  if(s&&l&&existing.has(`${s.id}|${l.id}|${r.year}`))errors.push('Balance already exists for this Staff / Leave Type / Year.');
  return {...r,errors,...(s&&l?{input:{...r.record,staff_profile_id:s.id,leave_type_id:l.id}}:{})};
 });return {rows:checked,total:checked.length,valid:checked.filter(r=>!r.errors.length).length,invalid:checked.filter(r=>r.errors.length).length,canConfirm:checked.length>0&&checked.every(r=>!r.errors.length)};}
export async function balanceImportPreview(req,res){requireRole(req,'manage');const {csv}=importSchema.parse(req.body);const report=await reviewImport(req.auth.pool,csv);res.set('Cache-Control','no-store').json({...report,rows:report.rows.map(({row,staffNo,leaveCode,year,errors})=>({row,staffNo,leaveCode,year,errors}))});}
export async function balanceImportConfirm(req,res){requireRole(req,'manage');const {csv}=importSchema.parse(req.body);const parsed=parseBalanceCsv(csv);if(!parsed.length||parsed.some(r=>r.errors.length))fail('IMPORT_PREVIEW_HAS_ERRORS',422);
 const total=await transaction(req.auth.pool,async c=>{const review=await reviewImport(c,csv);if(!review.canConfirm)fail('IMPORT_PREVIEW_HAS_ERRORS',422);
  for(const row of review.rows){const {staff_no,leave_code,...canonicalFields}=row.input;const record=validateBalance(canonicalFields);await checkReferences(c,record,{requireActive:true});const [created]=await c.execute(`INSERT INTO hr_leave_balances (${fields.join(',')},created_by_user_id,updated_by_user_id) VALUES (${fields.map(()=>'?').join(',')},?,?)`,[...fields.map(k=>record[k]),req.auth.user.id,req.auth.user.id]);await audit(c,req,created.insertId,'IMPORT_CREATE',record.adjustment_notes||'Opening leave balance import',null,record);}
  return review.rows.length;});res.status(201).json({message:'LEAVE_BALANCES_IMPORTED',count:total});}
