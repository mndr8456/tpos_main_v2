import {z} from 'zod';
import {parseSen,fmtSen,expectedSen} from './cash-shift-money.js';

const money=z.string().regex(/^(0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?$/,'Money must have at most 2 decimals');
const positiveId=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const has=(req,permission)=>req.auth.user.permissions.includes(permission);
const role=(req)=>req.auth.user.role_code;
const admin=(req)=>['OWNER','ADMIN'].includes(role(req));
const all=(req)=>['OWNER','ADMIN','MANAGER','ACCOUNTANT'].includes(role(req)) && has(req,'cash_shifts.view.all');
const manageOther=(req)=>['OWNER','ADMIN','MANAGER'].includes(role(req));
const operator=(req)=>['OWNER','ADMIN','MANAGER','SUPERVISOR','CASHIER'].includes(role(req));
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const assertVisible=(req,shift)=>{if(!all(req)&&String(shift.cashier_user_id)!==String(req.auth.user.id))throw fail('SHIFT_ACCESS_DENIED',403);};
const assertBranch=(req,branchId)=>{if(!admin(req)&&!req.auth.user.branchIds.includes(String(branchId)))throw fail('BRANCH_ACCESS_DENIED',403);};
const assertAction=(req,shift,ownPermission,anyPermission)=>{
 const own=String(shift.cashier_user_id)===String(req.auth.user.id);
 if(own&&has(req,ownPermission))return;
 if(manageOther(req)&&has(req,anyPermission)){assertBranch(req,shift.branch_id);return;}
 throw fail('SHIFT_ACTION_DENIED',403);
};
const parseId=req=>positiveId.parse(req.params.id);
async function txn(pool,operation){const conn=await pool.getConnection();try{await conn.beginTransaction();const result=await operation(conn);await conn.commit();return result;}catch(error){await conn.rollback();throw error;}finally{conn.release();}}
const selectOne=`SELECT s.id,s.branch_id,b.name AS branch_name,s.cashier_user_id,u.full_name AS cashier_name,s.opened_by,
 DATE_FORMAT(s.opened_at,'%Y-%m-%d %H:%i:%s') AS opened_at,s.opening_cash,s.status,
 s.closed_by,DATE_FORMAT(s.closed_at,'%Y-%m-%d %H:%i:%s') AS closed_at,
 s.counted_cash,s.manual_expected_cash,s.cash_variance,s.closing_notes
 FROM cash_shifts s JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.cashier_user_id`;
async function findShift(conn,id,lock=false){const [[shift]]=await conn.execute(`${selectOne} WHERE s.id=?${lock?' FOR UPDATE':''}`,[id]);if(!shift)throw fail('SHIFT_NOT_FOUND',404);return shift;}
async function audit(conn,shiftId,userId,action,details){await conn.execute('INSERT INTO cash_shift_audit_logs(shift_id,actor_user_id,action_type,details,recorded_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6))',[shiftId,userId,action,JSON.stringify(details)]);}
const amountText=v=>fmtSen(parseSen(v));
const csvSafe=x=>{const text=String(x??'');return `"${(/^[=+@-]/.test(text)?"'":'')+text.replaceAll('"','""')}\"`;};

export async function shiftMeta(req,res){
 const [branches]=await req.auth.pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');
 return res.json({branches:branches.filter(b=>admin(req)||req.auth.user.branchIds.includes(String(b.id))),scope:all(req)?'ALL':'OWN',
 canOpen:has(req,'cash_shifts.open'),canMoveOwn:has(req,'cash_shifts.move.own'),canMoveAny:manageOther(req)&&has(req,'cash_shifts.move.any'),
 canCloseOwn:has(req,'cash_shifts.close.own'),canCloseAny:manageOther(req)&&has(req,'cash_shifts.close.any'),
 posIntegration:'NOT_CONNECTED',expectedBasis:'OPENING_FLOAT_AND_MANUAL_MOVEMENTS_ONLY'});
}
export async function listShifts(req,res){
 const query=z.object({status:z.enum(['ALL','OPEN','CLOSED']).default('ALL'),branchId:z.string().regex(/^[1-9][0-9]*$/).optional()}).strict().parse(req.query);
 const filters=[],params=[];
 if(!all(req)){filters.push('s.cashier_user_id=?');params.push(req.auth.user.id);}
 if(query.status!=='ALL'){filters.push('s.status=?');params.push(query.status);}
 if(query.branchId){filters.push('s.branch_id=?');params.push(query.branchId);}
 const [rows]=await req.auth.pool.execute(`${selectOne}${filters.length?' WHERE '+filters.join(' AND '):''} ORDER BY s.id DESC LIMIT 500`,params);
 return res.json({shifts:rows,scope:all(req)?'ALL':'OWN',posIntegration:'NOT_CONNECTED'});
}
export async function shiftDetails(req,res){
 const id=parseId(req);const shift=await findShift(req.auth.pool,id);assertVisible(req,shift);
 const [movements]=await req.auth.pool.execute(`SELECT m.id,m.direction,m.amount,m.reason,m.request_key,
 DATE_FORMAT(m.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,u.full_name AS actor_name
 FROM cash_shift_movements m JOIN users u ON u.id=m.actor_user_id WHERE m.shift_id=? ORDER BY m.id`,[id]);
 const pending=shift.status==='OPEN'?expectedSen(shift.opening_cash,movements):parseSen(String(shift.manual_expected_cash));
 return res.json({shift,movements,manualExpected:fmtSen(pending),posIntegration:'NOT_CONNECTED',expectedBasis:'OPENING_FLOAT_AND_MANUAL_MOVEMENTS_ONLY'});
}
export async function openShift(req,res){
 const data=z.object({branchId:positiveId,openingCash:money,notes:z.string().trim().max(500).optional().default('')}).strict().parse(req.body);
 if(!operator(req)||!has(req,'cash_shifts.open'))throw fail('PERMISSION_DENIED',403);
 assertBranch(req,data.branchId);
 const userId=req.auth.user.id,amount=amountText(data.openingCash);
 try{
  const shiftId=await txn(req.auth.pool,async conn=>{
   const [[branch]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1',[data.branchId]);if(!branch)throw fail('BRANCH_NOT_ACTIVE');
   const [insert]=await conn.execute('INSERT INTO cash_shifts(branch_id,cashier_user_id,opened_by,opening_cash,opened_at) VALUES(?,?,?,?,UTC_TIMESTAMP(6))',[data.branchId,userId,userId,amount]);
   await audit(conn,insert.insertId,userId,'OPEN',{branchId:data.branchId,openingCash:amount,notes:data.notes});
   return insert.insertId;
  });
  return res.status(201).json({message:'SHIFT_OPENED',shiftId:String(shiftId)});
 }catch(error){if(error.code==='ER_DUP_ENTRY')throw fail('CASHIER_ALREADY_HAS_OPEN_SHIFT',409);throw error;}
}
export async function addShiftMovement(req,res){
 const id=parseId(req);if(!operator(req))throw fail('SHIFT_ACTION_DENIED',403);
 const data=z.object({direction:z.enum(['CASH_IN','CASH_OUT']),amount:money,reason:z.string().trim().min(4).max(500),requestKey:z.uuid()}).strict().parse(req.body);
 const amount=amountText(data.amount);if(parseSen(amount)===0n)throw fail('AMOUNT_MUST_BE_POSITIVE');
 const result=await txn(req.auth.pool,async conn=>{
  const shift=await findShift(conn,id,true);assertAction(req,shift,'cash_shifts.move.own','cash_shifts.move.any');
  const [[existing]]=await conn.execute('SELECT id,shift_id,direction,amount,reason FROM cash_shift_movements WHERE request_key=?',[data.requestKey]);
  if(existing){
   if(String(existing.shift_id)!==String(id)||existing.direction!==data.direction||fmtSen(parseSen(String(existing.amount)))!==amount||existing.reason!==data.reason)throw fail('REQUEST_KEY_REUSE_CONFLICT',409);
   return {id:String(existing.id),idempotent:true};
  }
  if(shift.status!=='OPEN')throw fail('SHIFT_ALREADY_CLOSED',409);
  const [movements]=await conn.execute('SELECT direction,amount FROM cash_shift_movements WHERE shift_id=?',[id]);
  const projected=expectedSen(shift.opening_cash,movements)+(data.direction==='CASH_IN'?1n:-1n)*parseSen(amount);
  if(projected<0n)throw fail('MANUAL_CASH_CANNOT_BE_NEGATIVE',409);
  if(projected>99999999999999n)throw fail('MANUAL_CASH_LIMIT_EXCEEDED',409);
  const [insert]=await conn.execute('INSERT INTO cash_shift_movements(shift_id,direction,amount,reason,request_key,actor_user_id,recorded_at) VALUES(?,?,?,?,?,?,UTC_TIMESTAMP(6))',[id,data.direction,amount,data.reason,data.requestKey,req.auth.user.id]);
  await audit(conn,id,req.auth.user.id,data.direction,{amount,reason:data.reason,requestKey:data.requestKey,manualExpected:fmtSen(projected)});
  return {id:String(insert.insertId),idempotent:false};
 });
 return res.status(result.idempotent?200:201).json({message:result.idempotent?'MOVEMENT_ALREADY_RECORDED':'MOVEMENT_RECORDED',...result});
}
export async function closeShift(req,res){
 const id=parseId(req);if(!operator(req))throw fail('SHIFT_ACTION_DENIED',403);
 const data=z.object({countedCash:money,notes:z.string().trim().max(1000).optional().default('')}).strict().parse(req.body);
 const result=await txn(req.auth.pool,async conn=>{
  const shift=await findShift(conn,id,true);assertAction(req,shift,'cash_shifts.close.own','cash_shifts.close.any');
  if(shift.status!=='OPEN')throw fail('SHIFT_ALREADY_CLOSED',409);
  if(String(shift.cashier_user_id)!==String(req.auth.user.id)&&data.notes.length<8)throw fail('MANAGER_CLOSE_REASON_REQUIRED');
  const [movements]=await conn.execute('SELECT direction,amount FROM cash_shift_movements WHERE shift_id=?',[id]);
  const expected=expectedSen(shift.opening_cash,movements),counted=parseSen(data.countedCash),variance=counted-expected;
  const [update]=await conn.execute(`UPDATE cash_shifts SET status='CLOSED',closed_by=?,closed_at=UTC_TIMESTAMP(6),counted_cash=?,manual_expected_cash=?,cash_variance=?,closing_notes=? WHERE id=? AND status='OPEN'`,
   [req.auth.user.id,fmtSen(counted),fmtSen(expected),fmtSen(variance),data.notes||null,id]);
  if(update.affectedRows!==1)throw fail('SHIFT_CLOSE_CONFLICT',409);
  await audit(conn,id,req.auth.user.id,'CLOSE',{countedCash:fmtSen(counted),manualExpected:fmtSen(expected),variance:fmtSen(variance),notes:data.notes,posIntegration:'NOT_CONNECTED'});
  return {countedCash:fmtSen(counted),manualExpected:fmtSen(expected),variance:fmtSen(variance)};
 });
 return res.json({message:'SHIFT_CLOSED',...result,expectedBasis:'OPENING_FLOAT_AND_MANUAL_MOVEMENTS_ONLY'});
}
export async function shiftAudit(req,res){
 const id=parseId(req);const shift=await findShift(req.auth.pool,id);assertVisible(req,shift);
 const [logs]=await req.auth.pool.execute(`SELECT l.id,l.action_type,l.details,
 DATE_FORMAT(l.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,u.full_name AS actor_name
 FROM cash_shift_audit_logs l JOIN users u ON u.id=l.actor_user_id WHERE l.shift_id=? ORDER BY l.id DESC LIMIT 300`,[id]);
 return res.json({logs});
}
export async function exportShifts(req,res){
 if(!has(req,'cash_shifts.export'))throw fail('PERMISSION_DENIED',403);
 const scope=all(req)?'':' WHERE s.cashier_user_id=?';
 const [rows]=await req.auth.pool.execute(`${selectOne}${scope} ORDER BY s.id DESC LIMIT 1000`,all(req)?[]:[req.auth.user.id]);
 const headers=['ID','Branch','Cashier','Opened At (UTC)','Status','Opening Float (RM)','Manual Expected (RM)','Counted Cash (RM)','Manual Variance (RM)','Closed At (UTC)','Closing Notes','Basis'];
 const data=rows.map(r=>[r.id,r.branch_name,r.cashier_name,r.opened_at,r.status,r.opening_cash,r.manual_expected_cash,r.counted_cash,r.cash_variance,r.closed_at,r.closing_notes,'Opening + manual in - manual out only; POS not connected']);
 res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('cash-shifts-report.csv');
 return res.send('\ufeff'+[headers,...data].map(row=>row.map(csvSafe).join(',')).join('\r\n'));
}
