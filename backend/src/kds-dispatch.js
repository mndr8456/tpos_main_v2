// Called INSIDE an existing Waiter/POS transaction. Never commits independently.
import {sourceKey} from './kds-rules.js';
const conflict=(message)=>Object.assign(new Error(message),{status:409});
async function kdsAudit(conn,ticketId,lineId,userId,action,oldState,newState,details){
 await conn.execute('INSERT INTO kds_ticket_audit(ticket_id,line_id,actor_user_id,action_type,previous_status,new_status,details) VALUES(?,?,?,?,?,?,?)',
  [ticketId,lineId,userId,action,oldState,newState,JSON.stringify(details)]);
}
export async function dispatchKitchenTicket(conn,{source,sourceId,branchId,actorUserId,orderScope,tableId,orderNotes=''}){
 if(!['WAITER','POS'].includes(source))throw conflict('KDS_INVALID_SOURCE');
 const column=source==='WAITER'?'waiter_order_id':'pos_draft_id';
 const [[existing]]=await conn.execute(`SELECT id FROM kds_tickets WHERE ${column}=? LIMIT 1`,[sourceId]);
 if(existing)return {ticketId:String(existing.id),existing:true,hasPreparation:true};
 const lineTable=source==='WAITER'?'waiter_order_lines':'pos_draft_lines';
 const orderColumn=source==='WAITER'?'order_id':'draft_id';
 const noteColumn=source==='WAITER'?'l.line_notes':"''";
 const [lines]=await conn.execute(`SELECT l.id,l.product_id,l.product_name,l.sku,l.quantity,l.unit_code,${noteColumn} AS line_notes,
  s.id AS station_id,s.code AS station_code,s.name AS station_name,s.is_active AS station_active
  FROM ${lineTable} l JOIN products p ON p.id=l.product_id
  LEFT JOIN preparation_stations s ON s.id=p.preparation_station_id
  WHERE l.${orderColumn}=? AND p.requires_preparation=1 ORDER BY l.id FOR UPDATE`,[sourceId]);
 if(!lines.length)return {ticketId:null,existing:false,hasPreparation:false};
 for(const l of lines)if(!l.station_id||!l.station_active||l.station_code==='NONE')throw conflict('KDS_PREPARATION_STATION_INVALID');
 let tableNumber=null;
 if(tableId){const [[table]]=await conn.execute('SELECT table_number FROM restaurant_tables WHERE id=? AND branch_id=?',[tableId,branchId]);if(!table)throw conflict('KDS_TABLE_NOT_FOUND');tableNumber=table.table_number;}
 const [saved]=await conn.execute('INSERT INTO kds_tickets(branch_id,waiter_order_id,pos_draft_id,source_type,order_scope,table_number,order_notes,created_by_user_id) VALUES(?,?,?,?,?,?,?,?)',
  [branchId,source==='WAITER'?sourceId:null,source==='POS'?sourceId:null,source,orderScope,tableNumber,orderNotes,actorUserId]);
 for(const l of lines)await conn.execute('INSERT INTO kds_ticket_lines(ticket_id,origin_line_id,product_id,product_name,sku,quantity,unit_code,line_notes,station_id,station_code,station_name) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  [saved.insertId,l.id,l.product_id,l.product_name,l.sku,l.quantity,l.unit_code,l.line_notes||'',l.station_id,l.station_code,l.station_name]);
 await kdsAudit(conn,saved.insertId,null,actorUserId,'DISPATCH',null,'PENDING',{source:sourceKey(source,sourceId),lineCount:lines.length});
 return {ticketId:String(saved.insertId),existing:false,hasPreparation:true};
}
export async function linkWaiterKitchenToPos(conn,waiterId,posId,actorUserId){
 const [[ticket]]=await conn.execute('SELECT id,pos_draft_id FROM kds_tickets WHERE waiter_order_id=? FOR UPDATE',[waiterId]);
 if(!ticket)return;
 if(ticket.pos_draft_id!=null){if(String(ticket.pos_draft_id)!==String(posId))throw conflict('KDS_ALREADY_LINKED_TO_DIFFERENT_POS');return;}
 await conn.execute('UPDATE kds_tickets SET pos_draft_id=? WHERE id=? AND pos_draft_id IS NULL',[posId,ticket.id]);
 await kdsAudit(conn,ticket.id,null,actorUserId,'LINK_POS',null,null,{waiterOrderId:String(waiterId),posDraftId:String(posId)});
}
export async function cancelPendingKitchenFromWaiter(conn,waiterId,actorUserId,reason){
 const [[ticket]]=await conn.execute('SELECT id FROM kds_tickets WHERE waiter_order_id=? FOR UPDATE',[waiterId]);
 if(!ticket)return;
 const [lines]=await conn.execute('SELECT id,status FROM kds_ticket_lines WHERE ticket_id=? ORDER BY id FOR UPDATE',[ticket.id]);
 if(lines.some(l=>l.status!=='PENDING'))throw conflict('WAITER_KITCHEN_ALREADY_STARTED');
 for(const l of lines){await conn.execute("UPDATE kds_ticket_lines SET status='CANCELLED',cancelled_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?",[l.id]);
  await kdsAudit(conn,ticket.id,l.id,actorUserId,'CANCEL','PENDING','CANCELLED',{reason,source:'WAITER_CANCEL'});}
}

// Safe POS discard: never silently leave an active kitchen ticket after cashier discards.
// Started tickets require explicit OWNER/ADMIN KDS cancellation with a recorded reason.
export async function cancelPendingKitchenFromPos(conn,posDraftId,actorUserId){
 const [[ticket]]=await conn.execute('SELECT id FROM kds_tickets WHERE pos_draft_id=? FOR UPDATE',[posDraftId]);
 if(!ticket)return;
 const [lines]=await conn.execute('SELECT id,status FROM kds_ticket_lines WHERE ticket_id=? ORDER BY id FOR UPDATE',[ticket.id]);
 if(lines.some(l=>l.status!=='PENDING'&&l.status!=='CANCELLED'))throw conflict('POS_KDS_CANCEL_REQUIRED');
 for(const l of lines.filter(l=>l.status==='PENDING')){
  await conn.execute("UPDATE kds_ticket_lines SET status='CANCELLED',cancelled_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?",[l.id]);
  await kdsAudit(conn,ticket.id,l.id,actorUserId,'CANCEL','PENDING','CANCELLED',{reason:'POS_DRAFT_DISCARDED'});
 }
}
