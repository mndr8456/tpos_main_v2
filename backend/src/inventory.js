// Tenant-isolated physical inventory foundation. No sale, payment or GL posting.
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {inventoryOpening} from './inventory-cost.js';
const positiveId=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const decimal6=z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
const decimal8=z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,8})?$/);
const openingSchema=z.object({branchId:positiveId,productId:positiveId,quantity:decimal6,unitCost:decimal8,reference:z.string().trim().min(4).max(120),requestKey:z.string().uuid()}).strict();
const listSchema=z.object({branchId:positiveId.optional(),productId:positiveId.optional()}).strict();
const bad=(code,status=400)=>Object.assign(new Error(code),{status});
const elevated=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code);
function access(req,branchId){if(!elevated(req)&&!req.auth.user.branchIds.includes(String(branchId)))throw bad('INVENTORY_BRANCH_FORBIDDEN',403);}
function authorizedBranches(req,rows){return rows.filter(r=>elevated(req)||req.auth.user.branchIds.includes(String(r.id)));}
function ensureOpeningAccess(req){if(!elevated(req)||!req.auth.user.permissions.includes('inventory.opening'))throw bad('INVENTORY_OPENING_OWNER_ADMIN_ONLY',403);}
const mapped=r=>({...r,branch_id:String(r.branch_id),product_id:String(r.product_id),id:r.id===undefined?undefined:String(r.id)});
export async function inventoryBalances(req,res){
 const query=listSchema.parse(req.query);
 if(query.branchId)access(req,query.branchId);
 const [branches]=await req.auth.pool.execute('SELECT id FROM branches WHERE is_active=1');
 const visible=authorizedBranches(req,branches);
 if(!visible.length)return res.set('Cache-Control','no-store').json({balances:[]});
 const params=visible.map(b=>b.id);
 let sql=`SELECT v.branch_id,v.product_id,p.product_name,p.sku,v.quantity_on_hand,v.carrying_value,v.average_cost,v.version,DATE_FORMAT(v.updated_at,'%Y-%m-%d %H:%i:%s') AS updated_at FROM inventory_branch_balances v JOIN products p ON p.id=v.product_id WHERE v.branch_id IN (${visible.map(()=>'?').join(',')})`;
 if(query.branchId){sql+=' AND v.branch_id=?';params.push(query.branchId);}
 if(query.productId){sql+=' AND v.product_id=?';params.push(query.productId);}
 sql+=' ORDER BY v.branch_id,p.product_name LIMIT 5000';
 const [rows]=await req.auth.pool.execute(sql,params);
 return res.set('Cache-Control','no-store').json({balances:rows.map(mapped),accountingPostingReady:false});
}
export async function inventoryMovements(req,res){
 const query=listSchema.parse(req.query);
 if(query.branchId)access(req,query.branchId);
 const [branches]=await req.auth.pool.execute('SELECT id FROM branches WHERE is_active=1');
 const visible=authorizedBranches(req,branches);
 if(!visible.length)return res.set('Cache-Control','no-store').json({movements:[]});
 const params=visible.map(b=>b.id);
 let sql=`SELECT m.id,m.branch_id,m.product_id,p.product_name,m.movement_type,m.quantity_delta,m.value_delta,m.quantity_after,m.carrying_value_after,m.average_cost_after,m.reference,u.full_name AS actor_name,DATE_FORMAT(m.created_at,'%Y-%m-%d %H:%i:%s') AS created_at FROM inventory_movements m JOIN products p ON p.id=m.product_id JOIN users u ON u.id=m.actor_user_id WHERE m.branch_id IN (${visible.map(()=>'?').join(',')})`;
 if(query.branchId){sql+=' AND m.branch_id=?';params.push(query.branchId);}
 if(query.productId){sql+=' AND m.product_id=?';params.push(query.productId);}
 sql+=' ORDER BY m.id DESC LIMIT 500';
 const [rows]=await req.auth.pool.execute(sql,params);
 return res.set('Cache-Control','no-store').json({movements:rows.map(mapped)});
}
export async function openInventoryBalance(req,res){
 ensureOpeningAccess(req);
 const data=openingSchema.parse(req.body);access(req,data.branchId);
 const opening=inventoryOpening(data.quantity,data.unitCost);
 const digest=createHash('sha256').update(JSON.stringify({branchId:data.branchId,productId:data.productId,quantity:opening.quantity,unitCost:data.unitCost,reference:data.reference,actor:String(req.auth.user.id)})).digest('hex');
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[prior]]=await conn.execute('SELECT id,request_hash,branch_id,product_id FROM inventory_movements WHERE request_key=?',[data.requestKey]);
  if(prior){
   if(prior.request_hash!==digest||String(prior.branch_id)!==String(data.branchId)||String(prior.product_id)!==String(data.productId))throw bad('INVENTORY_REQUEST_KEY_REUSED',409);
   await conn.commit();return res.set('Cache-Control','no-store').json({message:'INVENTORY_OPENING_ALREADY_RECORDED',movementId:String(prior.id),idempotent:true});
  }
  const [[branch]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1 FOR UPDATE',[data.branchId]);
  if(!branch)throw bad('INVENTORY_BRANCH_NOT_ACTIVE',409);
  const [[product]]=await conn.execute('SELECT id,product_type,product_structure,track_stock,status,is_deleted FROM products WHERE id=? FOR UPDATE',[data.productId]);
  if(!product||product.status!=='ACTIVE'||product.is_deleted||!product.track_stock||product.product_type!=='GOODS'||product.product_structure!=='SINGLE')throw bad('INVENTORY_PRODUCT_NOT_STOCKABLE',409);
  const [[existing]]=await conn.execute('SELECT branch_id FROM inventory_branch_balances WHERE branch_id=? AND product_id=? FOR UPDATE',[data.branchId,data.productId]);
  if(existing)throw bad('INVENTORY_OPENING_ALREADY_EXISTS',409);
  await conn.execute('INSERT INTO inventory_branch_balances(branch_id,product_id,quantity_on_hand,carrying_value,average_cost) VALUES(?,?,?,?,?)',[data.branchId,data.productId,opening.quantity,opening.carryingValue,opening.averageCost]);
  const [result]=await conn.execute("INSERT INTO inventory_movements(request_key,request_hash,branch_id,product_id,movement_type,quantity_delta,value_delta,quantity_after,carrying_value_after,average_cost_after,reference,actor_user_id) VALUES(?,?,?,?,'OPENING',?,?,?,?,?,?,?)",[data.requestKey,digest,data.branchId,data.productId,opening.quantity,opening.carryingValue,opening.quantity,opening.carryingValue,opening.averageCost,data.reference,req.auth.user.id]);
  await conn.commit();
  return res.status(201).set('Cache-Control','no-store').json({message:'INVENTORY_PHYSICAL_OPENING_RECORDED',movementId:String(result.insertId),balance:opening,accountingPosted:false});
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY')throw bad('INVENTORY_OPENING_CONFLICT',409);if(e.code==='ER_LOCK_DEADLOCK'||e.code==='ER_LOCK_WAIT_TIMEOUT')throw bad('INVENTORY_CONCURRENT_WRITE_RETRY',409);throw e;}finally{conn.release();}
}
