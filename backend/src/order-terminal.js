// Waiter-only ordering stage; does not write cash shifts, sales, inventory, voucher, payment or journals.
import {z} from 'zod';
import {canAccessBranch,isDineIn,waiterPayloadHash,rejectRepeatedProducts,cashierMayClaim} from './waiter-order-rules.js';
import {dispatchKitchenTicket,linkWaiterKitchenToPos,cancelPendingKitchenFromWaiter} from './kds-dispatch.js';
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const uuid=z.string().uuid();
const qty=z.string().regex(/^(?:[1-9]\d{0,3})(?:\.\d{1,3})?$|^0\.\d{1,3}$/).refine(v=>Number(v)>0&&Number(v)<=1000);
const item=z.object({productId:id,quantity:qty,notes:z.string().trim().max(500).default('')}).strict();
const sendSchema=z.object({branchId:id,orderScope:z.enum(['TAKE_AWAY','DINE_IN']),tableId:id.nullable(),orderNotes:z.string().trim().max(500).default(''),items:z.array(item).min(1).max(150),requestKey:uuid}).strict();
const cancelSchema=z.object({reason:z.string().trim().min(8).max(500)}).strict();
const claimSchema=z.object({requestKey:uuid}).strict();
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const elevated=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code);
const access=(req,branchId)=>{if(!canAccessBranch(req.auth.user,branchId))throw fail('WAITER_BRANCH_DENIED',403);};
const canRead=(req,order)=>{access(req,order.branch_id);if(!elevated(req)&&String(order.waiter_user_id)!==String(req.auth.user.id))throw fail('WAITER_ORDER_NOT_OWNED',403);};
const noStore=res=>res.set('Cache-Control','no-store');
const mapOrder=o=>({...o,id:String(o.id),branch_id:String(o.branch_id),waiter_user_id:String(o.waiter_user_id),table_id:o.table_id==null?null:String(o.table_id),pos_draft_id:o.pos_draft_id==null?null:String(o.pos_draft_id)});
const selectOrder=`SELECT o.id,o.branch_id,o.waiter_user_id,o.order_scope,o.table_id,o.status,o.pos_draft_id,o.order_notes,o.version,
 DATE_FORMAT(o.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,b.name AS branch_name,t.table_number,u.full_name AS waiter_name
 FROM waiter_orders o JOIN branches b ON b.id=o.branch_id JOIN users u ON u.id=o.waiter_user_id LEFT JOIN restaurant_tables t ON t.id=o.table_id`;
async function audit(conn,req,orderId,action,details){await conn.execute('INSERT INTO waiter_order_audit(order_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[orderId,req.auth.user.id,action,JSON.stringify(details)]);}
async function orderLines(conn,orderId){const [lines]=await conn.execute('SELECT id,product_id,product_name,sku,barcode,unit_code,quantity,unit_price,line_notes FROM waiter_order_lines WHERE order_id=? ORDER BY id',[orderId]);return lines.map(l=>({...l,id:String(l.id),product_id:String(l.product_id),quantity:String(l.quantity),unit_price:String(l.unit_price)}));}
async function resultOrder(conn,req,orderId,checkOwnership=true){const [[found]]=await conn.execute(`${selectOrder} WHERE o.id=?`,[orderId]);if(!found)throw fail('WAITER_ORDER_NOT_FOUND',404);if(checkOwnership)canRead(req,found);return {order:mapOrder(found),lines:await orderLines(conn,orderId)};}
async function stockAvailable(conn,branchId,p,quantity){
 if(!p.track_stock||p.product_type==='SERVICE')return;
 if(!/^\d+(?:\.\d{1,2})?$/.test(String(quantity)))throw fail('WAITER_STOCK_TWO_DECIMALS_ONLY');
 const [[stock]]=await conn.execute('SELECT quantity_on_hand FROM inventory_branch_balances WHERE branch_id=? AND product_id=?',[branchId,p.id]);
 if(!stock)throw fail('WAITER_STOCK_NOT_INITIALIZED',409);
 if(Number(stock.quantity_on_hand)<Number(quantity))throw fail('WAITER_INSUFFICIENT_STOCK',409);
}
export async function waiterBootstrap(req,res){
 const [branches]=await req.auth.pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');
 const visible=branches.filter(b=>canAccessBranch(req.auth.user,b.id));
 const [products]=await req.auth.pool.execute(`SELECT p.id,p.sku,p.barcode,p.product_name,p.category_id,p.base_unit_code,p.product_type,p.product_structure,p.track_stock,p.is_weighable,p.selling_price FROM products p JOIN categories c ON c.id=p.category_id AND c.is_deleted=0 AND c.status='ACTIVE' WHERE p.status='ACTIVE' AND p.is_deleted=0 ORDER BY p.product_name LIMIT 6000`);
 const [categories]=await req.auth.pool.execute("SELECT id,category_name FROM categories WHERE status='ACTIVE' AND is_deleted=0 ORDER BY category_name");
 const [prices]=visible.length?await req.auth.pool.execute(`SELECT branch_id,product_id,selling_price FROM product_branch_prices WHERE branch_id IN (${visible.map(()=>'?').join(',')})`,visible.map(b=>b.id)):[[]];
 const [tables]=['RESTAURANT','CAFE'].includes(req.auth.company.business_type)&&visible.length?await req.auth.pool.execute(`SELECT t.id,t.branch_id,t.table_number,t.table_name,t.table_area,t.table_status,t.status,
 CASE WHEN d.id IS NOT NULL OR w.id IS NOT NULL THEN 'OCCUPIED' ELSE t.table_status END AS occupancy
 FROM restaurant_tables t LEFT JOIN pos_drafts d ON d.active_table_id=t.id LEFT JOIN waiter_orders w ON w.active_table_id=t.id
 WHERE t.is_deleted=0 AND t.status='ACTIVE' AND t.branch_id IN (${visible.map(()=>'?').join(',')}) ORDER BY t.branch_id,t.table_area,t.sort_order,t.table_number`,visible.map(b=>b.id)):[[]];
 return noStore(res).json({branches:visible.map(b=>({...b,id:String(b.id)})),products:products.map(p=>({...p,id:String(p.id),category_id:String(p.category_id)})),categories,prices:prices.map(p=>({...p,branch_id:String(p.branch_id),product_id:String(p.product_id)})),tables:tables.map(t=>({...t,id:String(t.id),branch_id:String(t.branch_id)})),orderTypes:['TAKE_AWAY',...(['RESTAURANT','CAFE'].includes(req.auth.company.business_type)?['DINE_IN']:[])],checkout:false,kdsConnected:true});
}
export async function listWaiterOrders(req,res){
 const [rows]=await req.auth.pool.execute(`${selectOrder} WHERE ${elevated(req)?'1=1':'o.waiter_user_id=?'} ORDER BY o.id DESC LIMIT 200`,elevated(req)?[]:[req.auth.user.id]);
 return noStore(res).json({orders:rows.filter(o=>canAccessBranch(req.auth.user,o.branch_id)).map(mapOrder)});
}
export async function getWaiterOrder(req,res){return noStore(res).json(await resultOrder(req.auth.pool,req,id.parse(req.params.id)));}
export async function sendWaiterOrder(req,res){
 const data=sendSchema.parse(req.body);access(req,data.branchId);
 if(isDineIn(data.orderScope)!==Boolean(data.tableId))throw fail('WAITER_TABLE_REQUIRED_FOR_DINE_IN');
 if(isDineIn(data.orderScope)&&!['RESTAURANT','CAFE'].includes(req.auth.company.business_type))throw fail('WAITER_DINE_IN_NOT_SUPPORTED',403);
 if(rejectRepeatedProducts(data.items))throw fail('WAITER_DUPLICATE_PRODUCT');
 const hash=waiterPayloadHash(data);const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[previous]]=await conn.execute('SELECT id,waiter_user_id,request_hash FROM waiter_orders WHERE request_key=?',[data.requestKey]);
  if(previous){if(String(previous.waiter_user_id)!==String(req.auth.user.id)||previous.request_hash!==hash)throw fail('WAITER_REQUEST_KEY_REUSED',409);const old=await resultOrder(conn,req,previous.id);await conn.commit();return noStore(res).json({...old,idempotent:true});}
  const [[branch]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1',[data.branchId]);
  if(!branch)throw fail('WAITER_BRANCH_INACTIVE',409);
  if(data.tableId){
   const [[t]]=await conn.execute('SELECT id,branch_id,status,table_status FROM restaurant_tables WHERE id=? AND is_deleted=0 FOR UPDATE',[data.tableId]);
   if(!t||String(t.branch_id)!==String(data.branchId))throw fail('WAITER_TABLE_NOT_IN_BRANCH',409);
   if(t.status!=='ACTIVE'||t.table_status!=='AVAILABLE')throw fail('WAITER_TABLE_NOT_AVAILABLE',409);
   const [[pos]]=await conn.execute('SELECT id FROM pos_drafts WHERE active_table_id=? LIMIT 1',[data.tableId]);
   const [[other]]=await conn.execute('SELECT id FROM waiter_orders WHERE active_table_id=? LIMIT 1',[data.tableId]);
   if(pos||other)throw fail('WAITER_TABLE_OCCUPIED',409);
  }
  const productIds=data.items.map(i=>i.productId);const placeholders=productIds.map(()=>'?').join(',');
  const [records]=await conn.execute(`SELECT p.id,p.product_name,p.sku,p.barcode,p.category_id,p.base_unit_code,p.product_type,p.product_structure,p.track_stock,p.is_weighable,COALESCE(bp.selling_price,p.selling_price) AS price FROM products p LEFT JOIN product_branch_prices bp ON bp.product_id=p.id AND bp.branch_id=? WHERE p.id IN (${placeholders}) AND p.status='ACTIVE' AND p.is_deleted=0 ORDER BY p.id FOR UPDATE`,[data.branchId,...productIds]);
  const products=new Map(records.map(p=>[String(p.id),p]));
  for(const input of data.items){const p=products.get(String(input.productId));if(!p)throw fail('WAITER_PRODUCT_NOT_AVAILABLE',409);if(p.product_structure!=='SINGLE')throw fail('WAITER_PRODUCT_STRUCTURE_PENDING',409);if(!p.is_weighable&&!Number.isInteger(Number(input.quantity)))throw fail('WAITER_WHOLE_QUANTITY_REQUIRED');await stockAvailable(conn,data.branchId,p,input.quantity);}
  const [saved]=await conn.execute('INSERT INTO waiter_orders(request_key,request_hash,branch_id,waiter_user_id,order_scope,table_id,order_notes) VALUES(?,?,?,?,?,?,?)',[data.requestKey,hash,data.branchId,req.auth.user.id,data.orderScope,data.tableId,data.orderNotes]);
  for(const input of data.items){const p=products.get(String(input.productId));await conn.execute(`INSERT INTO waiter_order_lines(order_id,product_id,product_name,sku,barcode,category_id,unit_code,quantity,unit_price,track_stock,product_type,line_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,[saved.insertId,p.id,p.product_name,p.sku,p.barcode,p.category_id,p.base_unit_code,input.quantity,String(p.price),p.track_stock?1:0,p.product_type,input.notes]);}
  await audit(conn,req,saved.insertId,'SUBMIT',{scope:data.orderScope,branchId:String(data.branchId),tableId:data.tableId?String(data.tableId):null,lineCount:data.items.length,notes:data.orderNotes});
  // Dispatch after all line snapshots are persisted, in the SAME transaction.
  // Cashier Receive later links this ticket, never dispatching a duplicate.
  await dispatchKitchenTicket(conn,{source:'WAITER',sourceId:saved.insertId,branchId:data.branchId,actorUserId:req.auth.user.id,orderScope:data.orderScope,tableId:data.tableId,orderNotes:data.orderNotes});
  if(data.tableId)await conn.execute("INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,'ASSIGN',?)",[data.tableId,req.auth.user.id,JSON.stringify({waiterOrderId:String(saved.insertId)})]);
  const result=await resultOrder(conn,req,saved.insertId);await conn.commit();return res.status(201).set('Cache-Control','no-store').json({...result,idempotent:false});
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw fail('WAITER_CONCURRENT_SUBMISSION_RETRY',409);if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code))throw fail('WAITER_CONCURRENT_RETRY',409);throw e;}finally{conn.release();}
}
export async function cancelWaiterOrder(req,res){
 const orderId=id.parse(req.params.id),{reason}=cancelSchema.parse(req.body);const conn=await req.auth.pool.getConnection();
 try{await conn.beginTransaction();
  const [[reference]]=await conn.execute('SELECT branch_id,table_id FROM waiter_orders WHERE id=?',[orderId]);if(!reference)throw fail('WAITER_ORDER_NOT_FOUND',404);access(req,reference.branch_id);
  // Serialize cancellation with cashier claims and new table assignment.
  if(reference.table_id)await conn.execute('SELECT id FROM restaurant_tables WHERE id=? FOR UPDATE',[reference.table_id]);
  const [[o]]=await conn.execute('SELECT id,branch_id,waiter_user_id,status,table_id FROM waiter_orders WHERE id=? FOR UPDATE',[orderId]);canRead(req,o);
  if(o.status!=='SUBMITTED')throw fail('WAITER_ORDER_ALREADY_FINAL',409);
  // Once the kitchen has started, only OWNER/ADMIN KDS cancellation may proceed.
  await cancelPendingKitchenFromWaiter(conn,orderId,req.auth.user.id,reason);
  await conn.execute("UPDATE waiter_orders SET status='CANCELLED',version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[orderId]);
  await audit(conn,req,orderId,'CANCEL',{reason});
  if(o.table_id)await conn.execute("INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,'RELEASE',?)",[o.table_id,req.auth.user.id,JSON.stringify({waiterOrderId:String(orderId),reason:'CANCELLED'})]);
  await conn.commit();return noStore(res).json({message:'WAITER_ORDER_CANCELLED',orderId:String(orderId)});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
// Cashier handoff: create an ordinary cashier-owned HELD POS draft with all original snapshots.
// No payment, stock movement, kitchen ticket, sales or journals are written by this endpoint.
export async function waiterQueue(req,res){
 if(!cashierMayClaim(req))throw fail('WAITER_RECEIVE_DENIED',403);
 const branchIds=req.auth.user.branchIds||[];const limited=elevated(req)?'':` AND o.branch_id IN (${branchIds.map(()=>'?').join(',')})`;
 if(!elevated(req)&&!branchIds.length)return noStore(res).json({orders:[]});
 const [rows]=await req.auth.pool.execute(`${selectOrder} WHERE o.status='SUBMITTED'${limited} ORDER BY o.id ASC LIMIT 200`,elevated(req)?[]:branchIds);
 return noStore(res).json({orders:rows.map(mapOrder)});
}
export async function waiterQueueDetail(req,res){
 if(!cashierMayClaim(req))throw fail('WAITER_RECEIVE_DENIED',403);
 const orderId=id.parse(req.params.id);
 const [[o]]=await req.auth.pool.execute(`${selectOrder} WHERE o.id=? AND o.status='SUBMITTED'`,[orderId]);
 if(!o)throw fail('WAITER_ORDER_NOT_AVAILABLE',404);
 access(req,o.branch_id);
 return noStore(res).json({order:mapOrder(o),lines:await orderLines(req.auth.pool,orderId)});
}
export async function claimWaiterOrder(req,res){
 if(!cashierMayClaim(req))throw fail('WAITER_RECEIVE_DENIED',403);
 const orderId=id.parse(req.params.id),{requestKey}=claimSchema.parse(req.body);const conn=await req.auth.pool.getConnection();
 try{await conn.beginTransaction();
  const [[reference]]=await conn.execute('SELECT id,branch_id,table_id FROM waiter_orders WHERE id=?',[orderId]);if(!reference)throw fail('WAITER_ORDER_NOT_FOUND',404);access(req,reference.branch_id);
  const [[shift]]=await conn.execute("SELECT id FROM cash_shifts WHERE cashier_user_id=? AND branch_id=? AND status='OPEN' LIMIT 1 FOR UPDATE",[req.auth.user.id,reference.branch_id]);if(!shift)throw fail('POS_OPEN_SHIFT_REQUIRED',409);
  if(reference.table_id)await conn.execute('SELECT id FROM restaurant_tables WHERE id=? FOR UPDATE',[reference.table_id]);
  const [[o]]=await conn.execute('SELECT * FROM waiter_orders WHERE id=? FOR UPDATE',[orderId]);
  if(o.status==='CLAIMED'){
   const [[existing]]=await conn.execute('SELECT id,cashier_user_id,shift_id FROM pos_drafts WHERE id=?',[o.pos_draft_id]);
   if(!existing||String(existing.cashier_user_id)!==String(req.auth.user.id)||String(existing.shift_id)!==String(shift.id))throw fail('WAITER_ORDER_ALREADY_CLAIMED',409);
   await conn.commit();return noStore(res).json({message:'WAITER_ORDER_ALREADY_RECEIVED',draftId:String(existing.id),idempotent:true});
  }
  if(o.status!=='SUBMITTED')throw fail('WAITER_ORDER_NOT_AVAILABLE',409);
  if(o.table_id){const [[taken]]=await conn.execute('SELECT id FROM pos_drafts WHERE active_table_id=? LIMIT 1',[o.table_id]);if(taken)throw fail('POS_TABLE_OCCUPIED',409);}
  const [lines]=await conn.execute('SELECT * FROM waiter_order_lines WHERE order_id=? ORDER BY id FOR UPDATE',[orderId]);if(!lines.length)throw fail('WAITER_ORDER_EMPTY',409);
  const [saved]=await conn.execute("INSERT INTO pos_drafts(request_key,branch_id,cashier_user_id,shift_id,order_scope,table_id,status) VALUES(?,?,?,?,?,?,'HELD')",[requestKey,o.branch_id,req.auth.user.id,shift.id,o.order_scope,o.table_id]);
  for(const line of lines){await conn.execute('INSERT INTO pos_draft_lines(draft_id,product_id,product_name,sku,barcode,category_id,unit_code,quantity,unit_price,track_stock,product_type) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[saved.insertId,line.product_id,line.product_name,line.sku,line.barcode,line.category_id,line.unit_code,line.quantity,line.unit_price,line.track_stock,line.product_type]);}
  await conn.execute("UPDATE waiter_orders SET status='CLAIMED',pos_draft_id=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=?",[saved.insertId,orderId]);
  const logDetails=JSON.stringify({waiterOrderId:String(orderId),waiterId:String(o.waiter_user_id),tableId:o.table_id?String(o.table_id):null,orderNotes:o.order_notes,lineNotes:lines.map(l=>({productId:String(l.product_id),notes:l.line_notes})).filter(x=>x.notes)});
  await conn.execute("INSERT INTO pos_draft_audit_logs(draft_id,actor_user_id,action_type,details) VALUES(?,?,'CREATE',?)",[saved.insertId,req.auth.user.id,logDetails]);
  await linkWaiterKitchenToPos(conn,orderId,saved.insertId,req.auth.user.id);
  await audit(conn,req,orderId,'CLAIM',{posDraftId:String(saved.insertId),shiftId:String(shift.id)});
  await conn.commit();return res.status(201).set('Cache-Control','no-store').json({message:'WAITER_ORDER_RECEIVED',draftId:String(saved.insertId),idempotent:false});
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw fail('WAITER_CLAIM_CONFLICT_RETRY',409);if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(e.code))throw fail('WAITER_CONCURRENT_RETRY',409);throw e;}finally{conn.release();}
}
