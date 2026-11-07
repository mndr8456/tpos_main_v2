// KDS R1: pure rules shared by API and tests. Kitchen status is never a payment status.
export const KDS_STATES=Object.freeze(['PENDING','PREPARING','READY','COMPLETED','CANCELLED']);
export const KDS_ACTIVE=Object.freeze(['PENDING','PREPARING','READY']);
export const KDS_NEXT=Object.freeze({PENDING:'PREPARING',PREPARING:'READY',READY:'COMPLETED'});
export const isKdsTransition=(previous,next)=>KDS_NEXT[previous]===next;
export const isKdsStarted=state=>['PREPARING','READY','COMPLETED'].includes(state);
export const canAccessKdsBranch=(user,branch)=>['OWNER','ADMIN'].includes(user.role_code)||user.branchIds.includes(String(branch));
export function stationSummary(lines){
 if(!lines.length)return 'NONE';
 if(lines.every(l=>l.status==='CANCELLED'))return 'CANCELLED';
 const active=lines.filter(l=>l.status!=='CANCELLED');
 if(!active.length)return 'CANCELLED';
 if(active.every(l=>l.status==='COMPLETED'))return 'COMPLETED';
 if(active.every(l=>['READY','COMPLETED'].includes(l.status)))return 'READY';
 if(active.some(l=>['PREPARING','READY','COMPLETED'].includes(l.status)))return 'PREPARING';
 return 'PENDING';
}
export const stationary=(s)=>s.status==='ACTIVE'||Number(s.is_active)===1;
export const sourceKey=(source,id)=>`${source}:${String(id)}`;
