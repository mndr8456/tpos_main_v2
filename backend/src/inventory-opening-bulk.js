// Inventory Bulk Opening R2: preview is read-only; confirmation is atomic and
// idempotent. NEVER updates an existing branch balance, Product cost or GL.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {bulkError,normalizeBulkRequest,manifestHash,openingMovementKey,openingMovementHash,bulkTotals,MAX_BULK_ROWS} from './inventory-bulk-logic.js';
// Bind previews to the authenticated HttpOnly session token. No extra .env key,
// and the same Preview works across backend instances sharing the tenant DB.
function sessionSigningKey(req){
 const value=String(req.headers?.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('tpos_v2r_session='))?.slice('tpos_v2r_session='.length)||'';
 const parts=value.split('.');
 if(parts.length!==3||!/^[-_A-Za-z0-9]{43}$/.test(parts[2])||parts[0]!==String(req.auth.tenantId)||parts[1]!==String(req.auth.sessionId))throw bulkError('INVENTORY_BULK_SESSION_REQUIRED',401);
 return createHash('sha256').update('TPOS_V2_BULK_PREVIEW_SESSION_V1:').update(parts[2]).digest();
}
const elevated=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code);
function authorize(req){if(!elevated(req)||!req.auth.user.permissions.includes('inventory.opening'))throw bulkError('INVENTORY_OPENING_OWNER_ADMIN_ONLY',403);}
function tokenFor(hash,key){const issued=Date.now().toString(36);const message=`${issued}:${hash}`;return `${issued}.${createHmac('sha256',key).update(message).digest('hex')}`;}
function validToken(token,hash,key){
 if(typeof token!=='string'||!/^[0-9a-z]+\.[0-9a-f]{64}$/.test(token))return false;
 const [issued,sig]=token.split('.');const created=parseInt(issued,36);
 if(!Number.isSafeInteger(created)||Date.now()-created>15*60*1000||created>Date.now()+30*1000)return false;
 const expected=createHmac('sha256',key).update(`${issued}:${hash}`).digest();
 return timingSafeEqual(Buffer.from(sig,'hex'),expected);
}
function isStockable(p){return p&&p.product_type==='GOODS'&&p.product_structure==='SINGLE'&&Boolean(p.track_stock)&&p.status==='ACTIVE'&&!p.is_deleted;}
async function branchAndProducts(conn,data,{lock=false}={}){
 const suffix=lock?' FOR UPDATE':'';
 const [[branch]]=await conn.execute(`SELECT id,code,name FROM branches WHERE id=? AND is_active=1${suffix}`,[data.branchId]);
 if(!branch)throw bulkError('INVENTORY_BULK_BRANCH_INACTIVE',409);
 const skus=data.rows.filter(r=>r.opening).map(r=>r.sku);
 // No select on cost_price; actual unit cost is always independently verified.
 const [products]=skus.length?await conn.execute(`SELECT id,sku,product_name,product_type,product_structure,track_stock,status,is_deleted FROM products WHERE sku IN (${skus.map(()=>'?').join(',')}) ORDER BY id${suffix}`,skus):[[]];
 const bySku=new Map(products.map(p=>[String(p.sku).toUpperCase(),p]));
 const ids=products.map(p=>p.id);
 let balances=[];
 if(ids.length){
  const [rows]=await conn.execute(`SELECT product_id FROM inventory_branch_balances WHERE branch_id=? AND product_id IN (${ids.map(()=>'?').join(',')})${suffix}`,[data.branchId,...ids]);balances=rows;
 }
 const existing=new Set(balances.map(b=>String(b.product_id)));
 return {branch,bySku,existing};
}
function resolveRows(data,catalog){
 const errors=[...data.errors],valid=[];
 for(const row of data.rows){
  if(!row.opening)continue;
  const problems=[];
  const p=catalog.bySku.get(row.sku);
  if(!p)problems.push('SKU_NOT_FOUND');
  else if(!isStockable(p))problems.push('PRODUCT_NOT_STOCKABLE');
  if(data.source==='CSV'&&row.branchCode!==String(catalog.branch.code).toUpperCase())problems.push('BRANCH_CODE_MISMATCH');
  if(p&&catalog.existing.has(String(p.id)))problems.push('ALREADY_INITIALIZED');
  if(problems.length)errors.push({line:row.line,sku:row.sku,errors:problems});
  else valid.push({...row,productId:String(p.id),productName:p.product_name});
 }
 return {valid,errors};
}
function report(data,result){
 const totals=bulkTotals(result.valid);
 return {branchId:data.branchId,reference:data.reference,source:data.source,submitted:data.rows.length,validCount:result.valid.length,errorCount:result.errors.length,rows:result.valid.map(r=>({line:r.line,sku:r.sku,productName:r.productName,quantity:r.opening.quantity,actualUnitCost:r.unitCost,openingValue:r.opening.carryingValue})),errors:result.errors,totals};
}
export async function previewBulkOpening(req,res){
 authorize(req);
 const data=normalizeBulkRequest(req.body);
 const db=await branchAndProducts(req.auth.pool,data);
 const result=resolveRows(data,db);
 const payload=report(data,result);
 const hash=manifestHash(data,req.auth.user.id);
 return res.set('Cache-Control','no-store').json({...payload,previewToken:result.errors.length?null:tokenFor(hash,sessionSigningKey(req)),canConfirm:result.errors.length===0&&result.valid.length>0,accountingPosted:false});
}
export async function confirmBulkOpening(req,res){
 authorize(req);
 const data=normalizeBulkRequest(req.body);
 if(data.errors.length)throw bulkError('INVENTORY_BULK_ROWS_INVALID');
 if(req.body.confirmAcknowledged!==true)throw bulkError('INVENTORY_BULK_CONFIRMATION_REQUIRED');
 const hash=manifestHash(data,req.auth.user.id);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  // The branch row serializes all bulk attempts for a given branch.
  const [[branch]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1 FOR UPDATE',[data.branchId]);
  if(!branch)throw bulkError('INVENTORY_BULK_BRANCH_INACTIVE',409);
  const [[prior]]=await conn.execute('SELECT id,payload_hash,branch_id,actor_user_id,row_count FROM inventory_bulk_opening_batches WHERE request_key=? FOR UPDATE',[data.requestKey]);
  if(prior){
   if(prior.payload_hash!==hash||String(prior.branch_id)!==data.branchId||String(prior.actor_user_id)!==String(req.auth.user.id))throw bulkError('INVENTORY_BULK_REQUEST_KEY_REUSED',409);
   await conn.commit();return res.set('Cache-Control','no-store').json({message:'INVENTORY_BULK_ALREADY_RECORDED',batchId:String(prior.id),count:Number(prior.row_count),idempotent:true,accountingPosted:false});
  }
  if(!validToken(req.body.previewToken,hash,sessionSigningKey(req)))throw bulkError('INVENTORY_BULK_PREVIEW_EXPIRED_OR_CHANGED',409);
  const catalog=await branchAndProducts(conn,data,{lock:true});
  const result=resolveRows(data,catalog);
  if(result.errors.length)throw bulkError('INVENTORY_BULK_STALE_OR_INVALID_REPREVIEW',409);
  if(!result.valid.length||result.valid.length>MAX_BULK_ROWS)throw bulkError('INVENTORY_BULK_ROW_LIMIT');
  const totals=bulkTotals(result.valid);
  const [batch]=await conn.execute('INSERT INTO inventory_bulk_opening_batches(request_key,payload_hash,branch_id,actor_user_id,reference,row_count,total_quantity,total_value) VALUES(?,?,?,?,?,?,?,?)',[data.requestKey,hash,data.branchId,req.auth.user.id,data.reference,result.valid.length,totals.quantity,totals.value]);
  const batchId=String(batch.insertId);
  const params=[];
  for(const row of result.valid)params.push(data.branchId,row.productId,row.opening.quantity,row.opening.carryingValue,row.opening.averageCost);
  await conn.execute(`INSERT INTO inventory_branch_balances(branch_id,product_id,quantity_on_hand,carrying_value,average_cost) VALUES ${result.valid.map(()=>'(?,?,?,?,?)').join(',')}`,params);
  // Store one immutable movement and exact actual cost audit per row.
  for(const row of result.valid){
   const movementKey=openingMovementKey(data.requestKey,row.productId);
   const digest=openingMovementHash({branchId:data.branchId,productId:row.productId,quantity:row.opening.quantity,unitCost:row.unitCost,reference:data.reference,actorId:req.auth.user.id});
   const [movement]=await conn.execute("INSERT INTO inventory_movements(request_key,request_hash,branch_id,product_id,movement_type,quantity_delta,value_delta,quantity_after,carrying_value_after,average_cost_after,reference,actor_user_id) VALUES(?,?,?,?,'OPENING',?,?,?,?,?,?,?)",[movementKey,digest,data.branchId,row.productId,row.opening.quantity,row.opening.carryingValue,row.opening.quantity,row.opening.carryingValue,row.opening.averageCost,data.reference,req.auth.user.id]);
   await conn.execute('INSERT INTO inventory_bulk_opening_lines(batch_id,product_id,movement_id,opening_quantity,actual_unit_cost,opening_value) VALUES(?,?,?,?,?,?)',[batchId,row.productId,movement.insertId,row.opening.quantity,row.unitCost,row.opening.carryingValue]);
  }
  await conn.commit();
  return res.status(201).set('Cache-Control','no-store').json({message:'INVENTORY_BULK_OPENING_RECORDED',batchId,count:result.valid.length,totals,idempotent:false,accountingPosted:false});
 }catch(err){await conn.rollback();if(err.code==='ER_DUP_ENTRY')throw bulkError('INVENTORY_BULK_CONCURRENT_CONFLICT_REPREVIEW',409);if(['ER_LOCK_DEADLOCK','ER_LOCK_WAIT_TIMEOUT'].includes(err.code))throw bulkError('INVENTORY_CONCURRENT_WRITE_RETRY',409);throw err;}
 finally{conn.release();}
}
