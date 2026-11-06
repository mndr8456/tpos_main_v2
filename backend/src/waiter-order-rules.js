// Deterministic request validation and authorization helpers; no external services.
import {createHash} from 'node:crypto';
export const isDineIn=scope=>scope==='DINE_IN';
export const canAccessBranch=(user,branchId)=>['OWNER','ADMIN'].includes(user.role_code)||user.branchIds.includes(String(branchId));
export const formatScope=scope=>scope==='DINE_IN'?'Dine In':'Take Away';
export function waiterPayloadHash(body){
 const normalized={branchId:Number(body.branchId),orderScope:body.orderScope,tableId:body.tableId?Number(body.tableId):null,
  orderNotes:body.orderNotes||'',items:body.items.map(i=>({productId:Number(i.productId),quantity:String(i.quantity),notes:i.notes||''}))};
 return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}
export function rejectRepeatedProducts(items){
 const seen=new Set();for(const item of items){const id=String(item.productId);if(seen.has(id))return true;seen.add(id);}return false;
}
export function cashierMayClaim(req){return ['CASHIER','OWNER','ADMIN','MANAGER','SUPERVISOR'].includes(req.auth.user.role_code)&&
 req.auth.user.permissions.includes('pos.cart.manage')&&req.auth.user.permissions.includes('pos.view')&&req.auth.user.permissions.includes('order_terminal.receive');}
