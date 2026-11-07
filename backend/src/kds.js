// Kitchen Display System R1. Tenant-scoped, append-only audit, no sale/payment/stock/ledger writes.
import {z} from 'zod';
import {KDS_ACTIVE,KDS_STATES,isKdsTransition,canAccessKdsBranch,stationSummary} from './kds-rules.js';
import {dispatchKitchenTicket} from './kds-dispatch.js';
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const fail=(name,status=400)=>Object.assign(new Error(name),{status});
const person=req=>req.auth.user;
const has=(req,p)=>person(req).permissions.includes(p);
const elevated=req=>['OWNER','ADMIN'].includes(person(req).role_code);
const access=(req,branchId)=>{if(!canAccessKdsBranch(person(req),branchId))throw fail('KDS_BRANCH_DENIED',403);};
const noStore=res=>res.set('Cache-Control','no-store');
const updated=z.object({nextStatus:z.enum(['PREPARING','READY','COMPLETED']),expectedVersion:z.number().int().positive()}).strict();
const stationUpdate=z.object({nextStatus:z.enum(['PREPARING','READY','COMPLETED']),expectedVersions:z.array(z.object({id:id,version:z.number().int().positive()}).strict()).min(1).max(150)}).strict();
const cancelSchema=z.object({reason:z.string().trim().min(8).max(500)}).strict();
const dispatchSchema=z.object({requestKey:z.string().uuid()}).strict();
async function transaction(pool,fn){const conn=await pool.getConnection();try{await conn.beginTransaction();const result=await fn(conn);await conn.commit();return result;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
const audit=async(conn,ticket,line,actor,action,previous,next,details)=>conn.execute('INSERT INTO kds_ticket_audit(ticket_id,line_id,actor_user_id,action_type,previous_status,new_status,details) VALUES(?,?,?,?,?,?,?)',
 [ticket,line,actor,action,previous,next,JSON.stringify(details)]);
const dateFields="DATE_FORMAT(t.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,GREATEST(0,TIMESTAMPDIFF(MINUTE,t.created_at,NOW())) AS age_minutes";
const ticketBase=`SELECT t.id,t.branch_id,t.waiter_order_id,t.pos_draft_id,t.source_type,t.order_scope,t.table_number,t.order_notes,${dateFields},b.name AS branch_name,u.full_name AS sender_name FROM kds_tickets t JOIN branches b ON b.id=t.branch_id JOIN users u ON u.id=t.created_by_user_id`;
const lineFields=`l.id,l.ticket_id,l.origin_line_id,l.product_id,l.product_name,l.sku,l.quantity,l.unit_code,l.line_notes,l.station_id,l.station_code,l.station_name,l.status,l.version,
 DATE_FORMAT(l.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at`;
const castLine=l=>({...l,id:String(l.id),ticket_id:String(l.ticket_id),product_id:String(l.product_id),station_id:String(l.station_id),quantity:String(l.quantity),version:Number(l.version)});
const castTicket=t=>({...t,id:String(t.id),branch_id:String(t.branch_id),waiter_order_id:t.waiter_order_id==null?null:String(t.waiter_order_id),pos_draft_id:t.pos_draft_id==null?null:String(t.pos_draft_id)});
function groupCards(tickets,lines){
 const byTicket=new Map(tickets.map(t=>[String(t.id),castTicket(t)]));
 const byStation=new Map();
 for(const row of lines){const t=byTicket.get(String(row.ticket_id));if(!t)continue;
  const key=`${row.ticket_id}:${row.station_id}`;
  if(!byStation.has(key))byStation.set(key,{...t,station_id:String(row.station_id),station_code:row.station_code,station_name:row.station_name,lines:[]});
  byStation.get(key).lines.push(castLine(row));
 }
 return [...byStation.values()].map(card=>({...card,status:stationSummary(card.lines)}));
}
export async function kdsMeta(req,res){
 const [branches]=await req.auth.pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');
 const [stations]=await req.auth.pool.execute("SELECT id,code,name FROM preparation_stations WHERE is_active=1 AND code<>'NONE' ORDER BY id");
 return noStore(res).json({branches:branches.filter(b=>canAccessKdsBranch(person(req),b.id)).map(b=>({...b,id:String(b.id)})),stations:stations.map(s=>({...s,id:String(s.id)})),refreshSeconds:10,thresholdMinutes:[8,15,30]});
}
export async function kdsBoard(req,res){
 const input=z.object({branchId:id,stationId:id.optional(),status:z.enum([...KDS_STATES,'ALL']).default('ALL'),history:z.enum(['0','1']).default('0')}).strict().parse(req.query);
 access(req,input.branchId);
 const statusFilter=input.history==='1'?"('COMPLETED','CANCELLED')":"('PENDING','PREPARING','READY')";
 // Filter before LIMIT: historical completed tickets must not hide today's active queue.
 const [tickets]=await req.auth.pool.execute(`${ticketBase} WHERE t.branch_id=? AND EXISTS (
  SELECT 1 FROM kds_ticket_lines x WHERE x.ticket_id=t.id AND x.status IN ${statusFilter}${input.stationId?' AND x.station_id=?':''})
  ORDER BY t.created_at ASC,t.id ASC LIMIT 200`,[input.branchId,...(input.stationId?[input.stationId]:[])]);
 if(!tickets.length)return noStore(res).json({cards:[],latestTicketId:null});
 const ids=tickets.map(t=>t.id);
 const [lines]=await req.auth.pool.execute(`SELECT ${lineFields} FROM kds_ticket_lines l WHERE l.ticket_id IN (${ids.map(()=>'?').join(',')})${input.stationId?' AND l.station_id=?':''} ORDER BY l.ticket_id,l.id`,[...ids,...(input.stationId?[input.stationId]:[])]);
 const cards=groupCards(tickets,lines).filter(c=>input.history==='1'?['COMPLETED','CANCELLED'].includes(c.status):KDS_ACTIVE.includes(c.status)).filter(c=>input.status==='ALL'||c.status===input.status);
 return noStore(res).json({cards,latestTicketId:cards.length?String(Math.max(...cards.map(c=>Number(c.id)))):null});
}
export async function kdsTicket(req,res){
 const ticketId=id.parse(req.params.id);
 const [[ticket]]=await req.auth.pool.execute(`${ticketBase} WHERE t.id=?`,[ticketId]);if(!ticket)throw fail('KDS_TICKET_NOT_FOUND',404);
 access(req,ticket.branch_id);
 const [lines]=await req.auth.pool.execute(`SELECT ${lineFields} FROM kds_ticket_lines l WHERE l.ticket_id=? ORDER BY l.station_id,l.id`,[ticketId]);
 return noStore(res).json({ticket:castTicket(ticket),lines:lines.map(castLine),status:stationSummary(lines)});
}
async function getLockedTicket(conn,req,ticketId){
 const [[t]]=await conn.execute('SELECT id,branch_id,waiter_order_id,pos_draft_id FROM kds_tickets WHERE id=? FOR UPDATE',[ticketId]);
 if(!t)throw fail('KDS_TICKET_NOT_FOUND',404);access(req,t.branch_id);return t;
}
async function moveLine(conn,req,l,next){
 if(!isKdsTransition(l.status,next))throw fail('KDS_INVALID_STATUS_TRANSITION',409);
 const clock=next==='PREPARING'?'started_at':next==='READY'?'ready_at':'completed_at';
 await conn.execute(`UPDATE kds_ticket_lines SET status=?,${clock}=UTC_TIMESTAMP(6),version=version+1 WHERE id=? AND status=? AND version=?`,[next,l.id,l.status,l.version]);
 await audit(conn,l.ticket_id,l.id,person(req).id,'STATUS',l.status,next,{stationId:String(l.station_id),stationCode:l.station_code});
}
export async function kdsLineStatus(req,res){
 const lineId=id.parse(req.params.id),data=updated.parse(req.body);
 const output=await transaction(req.auth.pool,async conn=>{
  // Lock ticket first, consistently with waiter cancellation and station actions.
  const [[reference]]=await conn.execute('SELECT ticket_id FROM kds_ticket_lines WHERE id=?',[lineId]);if(!reference)throw fail('KDS_LINE_NOT_FOUND',404);
  await getLockedTicket(conn,req,reference.ticket_id);
  const [[line]]=await conn.execute('SELECT id,ticket_id,station_id,station_code,status,version FROM kds_ticket_lines WHERE id=? FOR UPDATE',[lineId]);
  if(!line||Number(line.version)!==data.expectedVersion)throw fail('KDS_STALE_REFRESH_REQUIRED',409);
  await moveLine(conn,req,line,data.nextStatus);
  return {lineId:String(line.id),status:data.nextStatus,version:Number(line.version)+1};
 });return noStore(res).json(output);
}
export async function kdsStationStatus(req,res){
 const ticketId=id.parse(req.params.ticketId),stationId=id.parse(req.params.stationId),data=stationUpdate.parse(req.body);
 const output=await transaction(req.auth.pool,async conn=>{
  await getLockedTicket(conn,req,ticketId);
  const [lines]=await conn.execute('SELECT id,ticket_id,station_id,station_code,status,version FROM kds_ticket_lines WHERE ticket_id=? AND station_id=? ORDER BY id FOR UPDATE',[ticketId,stationId]);
  const versions=new Map(data.expectedVersions.map(x=>[String(x.id),x.version]));
  if(!lines.length||lines.length!==versions.size||lines.some(l=>versions.get(String(l.id))!==Number(l.version)))throw fail('KDS_STALE_REFRESH_REQUIRED',409);
  for(const l of lines)if(!isKdsTransition(l.status,data.nextStatus))throw fail('KDS_INVALID_STATUS_TRANSITION',409);
  for(const l of lines)await moveLine(conn,req,l,data.nextStatus);
  return {ticketId:String(ticketId),stationId:String(stationId),status:data.nextStatus,updatedLines:lines.length};
 });return noStore(res).json(output);
}
export async function kdsCancel(req,res){
 if(!elevated(req))throw fail('KDS_CANCEL_REQUIRES_OWNER_ADMIN',403);
 const ticketId=id.parse(req.params.id),{reason}=cancelSchema.parse(req.body);
 const output=await transaction(req.auth.pool,async conn=>{
  // Read source before acquiring locks. Kitchen cancellation does not alter financial records.
  const [[ref]]=await conn.execute('SELECT branch_id,waiter_order_id FROM kds_tickets WHERE id=?',[ticketId]);if(!ref)throw fail('KDS_TICKET_NOT_FOUND',404);access(req,ref.branch_id);
  let waiter=null;
  if(ref.waiter_order_id){const [[w]]=await conn.execute('SELECT id,table_id,status FROM waiter_orders WHERE id=?',[ref.waiter_order_id]);waiter=w;
   if(w?.status==='SUBMITTED'&&w.table_id)await conn.execute('SELECT id FROM restaurant_tables WHERE id=? FOR UPDATE',[w.table_id]);
   if(w?.status==='SUBMITTED'){const [[current]]=await conn.execute('SELECT id,table_id,status FROM waiter_orders WHERE id=? FOR UPDATE',[w.id]);waiter=current;}
  }
  await getLockedTicket(conn,req,ticketId);
  const [lines]=await conn.execute('SELECT id,status FROM kds_ticket_lines WHERE ticket_id=? ORDER BY id FOR UPDATE',[ticketId]);
  if(!lines.length||lines.every(l=>l.status==='CANCELLED'))throw fail('KDS_ALREADY_CANCELLED',409);
  if(lines.some(l=>l.status==='COMPLETED'))throw fail('KDS_COMPLETED_CANNOT_CANCEL',409);
  for(const l of lines.filter(l=>l.status!=='CANCELLED')){
   await conn.execute("UPDATE kds_ticket_lines SET status='CANCELLED',cancelled_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?",[l.id]);
   await audit(conn,ticketId,l.id,person(req).id,'CANCEL',l.status,'CANCELLED',{reason});
  }
  if(waiter?.status==='SUBMITTED'){
   await conn.execute("UPDATE waiter_orders SET status='CANCELLED',version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='SUBMITTED'",[waiter.id]);
   await conn.execute("INSERT INTO waiter_order_audit(order_id,actor_user_id,action_type,details) VALUES(?,?,'CANCEL',?)",[waiter.id,person(req).id,JSON.stringify({reason,source:'KDS_OWNER_CANCEL'})]);
   if(waiter.table_id)await conn.execute("INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,'RELEASE',?)",[waiter.table_id,person(req).id,JSON.stringify({waiterOrderId:String(waiter.id),reason:'KDS_CANCEL'})]);
  }
  return {ticketId:String(ticketId),status:'CANCELLED',note:waiter?.status==='CLAIMED'?'Cashier must resolve the existing POS draft separately.':null};
 });return noStore(res).json(output);
}
export async function kdsAudit(req,res){
 const ticketId=id.parse(req.params.id);
 const [[ticket]]=await req.auth.pool.execute('SELECT id,branch_id FROM kds_tickets WHERE id=?',[ticketId]);if(!ticket)throw fail('KDS_TICKET_NOT_FOUND',404);access(req,ticket.branch_id);
 const [rows]=await req.auth.pool.execute(`SELECT a.id,a.line_id,a.action_type,a.previous_status,a.new_status,a.details,DATE_FORMAT(a.recorded_at,'%Y-%m-%d %H:%i:%s') AS recorded_at,u.full_name AS actor_name
 FROM kds_ticket_audit a JOIN users u ON u.id=a.actor_user_id WHERE a.ticket_id=? ORDER BY a.id DESC LIMIT 300`,[ticketId]);
 return noStore(res).json({events:rows.map(a=>({...a,id:String(a.id),line_id:a.line_id==null?null:String(a.line_id)}))});
}
export async function kdsDispatchPos(req,res){
 if(!['CASHIER','OWNER','ADMIN','MANAGER','SUPERVISOR'].includes(person(req).role_code)||!has(req,'pos.cart.manage')||!has(req,'pos.view'))throw fail('KDS_DISPATCH_DENIED',403);
 const draftId=id.parse(req.params.id);dispatchSchema.parse(req.body);
 const output=await transaction(req.auth.pool,async conn=>{
  const [[d]]=await conn.execute("SELECT id,branch_id,cashier_user_id,shift_id,order_scope,table_id,status FROM pos_drafts WHERE id=? FOR UPDATE",[draftId]);
  if(!d)throw fail('KDS_POS_DRAFT_NOT_FOUND',404);access(req,d.branch_id);
  if(String(d.cashier_user_id)!==String(person(req).id))throw fail('KDS_POS_NOT_OWNED',403);
  const [[existing]]=await conn.execute('SELECT id FROM kds_tickets WHERE pos_draft_id=? LIMIT 1',[draftId]);
  if(existing)return {ticketId:String(existing.id),alreadyDispatched:true,hasPreparation:true};
  if(d.status!=='HELD')throw fail('KDS_POS_HOLD_BEFORE_DISPATCH',409);
  const [[shift]]=await conn.execute("SELECT id FROM cash_shifts WHERE id=? AND cashier_user_id=? AND status='OPEN'",[d.shift_id,person(req).id]);
  if(!shift)throw fail('POS_OPEN_SHIFT_REQUIRED',409);
  const result=await dispatchKitchenTicket(conn,{source:'POS',sourceId:d.id,branchId:d.branch_id,actorUserId:person(req).id,orderScope:d.order_scope,tableId:d.table_id});
  return {ticketId:result.ticketId,alreadyDispatched:result.existing,hasPreparation:result.hasPreparation};
 });return noStore(res).json(output);
}
// Read-only kitchen progress for a waiter's own order or a cashier's own POS draft.
async function kdsSourceStatus(req,res,source){
 const orderId=id.parse(req.params.id),table=source==='WAITER'?'waiter_orders':'pos_drafts';
 const [[o]]=await req.auth.pool.execute(`SELECT id,branch_id,${source==='WAITER'?'waiter_user_id':'cashier_user_id'} AS actor_id FROM ${table} WHERE id=?`,[orderId]);
 if(!o)throw fail('KDS_SOURCE_NOT_FOUND',404);access(req,o.branch_id);
 if(!elevated(req)&&String(o.actor_id)!==String(person(req).id))throw fail('KDS_SOURCE_NOT_OWNED',403);
 const column=source==='WAITER'?'waiter_order_id':'pos_draft_id';
 const [[ticket]]=await req.auth.pool.execute(`SELECT id FROM kds_tickets WHERE ${column}=? LIMIT 1`,[orderId]);
 if(!ticket)return noStore(res).json({ticketId:null,status:'NOT_REQUIRED',stations:[]});
 const [rows]=await req.auth.pool.execute('SELECT station_id,station_code,station_name,status FROM kds_ticket_lines WHERE ticket_id=? ORDER BY station_id,id',[ticket.id]);
 const stations=new Map();for(const line of rows){const key=String(line.station_id);if(!stations.has(key))stations.set(key,{id:key,code:line.station_code,name:line.station_name,lines:[]});stations.get(key).lines.push(line);}
 const summaries=[...stations.values()].map(s=>({id:s.id,code:s.code,name:s.name,status:stationSummary(s.lines)}));
 return noStore(res).json({ticketId:String(ticket.id),status:stationSummary(rows),stations:summaries});
}
export const kdsWaiterStatus=(req,res)=>kdsSourceStatus(req,res,'WAITER');
export const kdsPosStatus=(req,res)=>kdsSourceStatus(req,res,'POS');
