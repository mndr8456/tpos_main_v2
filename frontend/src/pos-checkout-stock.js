// Client-side checkout preflight for a clear operator message.
// Authoritative stock locking, valuation and rejection remain on the backend.
function hundredths(value) {
 const text=String(value??'').trim();
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(text))return null;
 const [whole,decimal='']=text.split('.');
 if(decimal.length===3&&decimal[2]!=='0')return null;
 return BigInt(whole)*100n+BigInt((decimal+'00').slice(0,2));
}
function formatHundredths(value) {
 return `${value/100n}.${String(value%100n).padStart(2,'0')}`;
}
export function findCheckoutStockBlockers(lines,stockLevels,branchId) {
 const available=new Map();
 for(const row of stockLevels||[]) {
  if(String(row.branch_id)!==String(branchId))continue;
  available.set(String(row.product_id),hundredths(row.quantity_on_hand));
 }
 const requested=new Map();
 for(const line of lines||[]) {
  if(line.track_stock!==true&&Number(line.track_stock)!==1)continue;
  const id=String(line.product_id),quantity=hundredths(line.quantity);
  const previous=requested.get(id)||{productId:id,productName:line.product_name||line.sku||`Product ${id}`,quantity:0n,invalid:false};
  if(quantity===null||quantity<=0n)previous.invalid=true;
  else previous.quantity+=quantity;
  requested.set(id,previous);
 }
 const problems=[];
 for(const item of requested.values()) {
  if(item.invalid)problems.push({productId:item.productId,productName:item.productName,reason:'INVALID_QUANTITY'});
  else if(!available.has(item.productId)||available.get(item.productId)===null)problems.push({productId:item.productId,productName:item.productName,reason:'NOT_INITIALIZED'});
  else if(available.get(item.productId)<item.quantity)problems.push({productId:item.productId,productName:item.productName,reason:'INSUFFICIENT',required:formatHundredths(item.quantity),available:formatHundredths(available.get(item.productId))});
 }
 return problems;
}
