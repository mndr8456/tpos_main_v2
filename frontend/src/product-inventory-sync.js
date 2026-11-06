// Present the same tenant/branch inventory ledger used by Stock / Inventory.
// Never store quantities in Product Master and never treat missing opening stock as zero.
const isYes=value=>value===true||value===1||value==='1';
export function quantityForDisplay(value){
 const raw=String(value??'');
 const match=raw.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
 if(!match)return '—';
 const whole=match[2].replace(/\B(?=(\d{3})+(?!\d))/g,',');
 return `${match[1]}${whole}.${(match[3]||'').padEnd(2,'0')}`;
}
export function stockForProduct(product,branchId,balances,authorized=true){
 if(!product||product.product_type!=='GOODS'||(product.product_structure||'SINGLE')!=='SINGLE'||!isYes(product.track_stock))
  return {status:'NOT_TRACKED',label:'Not tracked'};
 if(!authorized||!branchId)return {status:'UNAVAILABLE',label:'—'};
 const balance=balances instanceof Map?balances.get(`${branchId}:${product.id}`):balances.find(item=>String(item.product_id)===String(product.id)&&String(item.branch_id)===String(branchId));
 if(!balance)return {status:'NOT_INITIALIZED',label:'Not initialized'};
 return {status:'INITIALIZED',label:quantityForDisplay(balance.quantity_on_hand)};
}
export function referenceCostForProduct(referenceCosts,productId){
 if(!productId)return null;
 const value=referenceCosts.find(item=>String(item.productId)===String(productId))?.referenceCost;
 if(value===undefined||value===null)return null;
 const raw=String(value);
 if(!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(raw))return null;
 return quantityForDisplay(raw).replaceAll(',','');
}
