// Bulk opening inputs are deliberately independent of Product Master edits.
// All quantities and costs are exact, two-decimal inventory values.
import {createHash} from 'node:crypto';
import {inventoryOpening,quantity2AllowZero,printValue} from './inventory-cost.js';
export const MAX_BULK_ROWS=1000;
export const MAX_CSV_BYTES=2*1024*1024;
export const BULK_HEADERS=['SKU','Product','Branch Code','Opening Qty','Actual Unit Cost (RM)','Reference Purchase Cost (RM)'];
// Product Master permits arbitrary trimmed SKU text up to 64 characters.
const skuPattern=/^[^\u0000-\u001f\u007f]{1,64}$/u;
const decimalPattern=/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const bulkError=(code,status=400)=>Object.assign(new Error(code),{status});
export const validUuid=v=>typeof v==='string'&&uuidPattern.test(v);
export const exact2=value=>{const s=String(value??'').trim();if(!decimalPattern.test(s))throw bulkError('INVENTORY_BULK_DECIMAL_INVALID');const [whole,fraction='']=s.split('.');return `${whole}.${fraction.padEnd(2,'0')}`;};
export function parseCsvTable(input){
 if(typeof input!=='string'||!input.length||Buffer.byteLength(input,'utf8')>MAX_CSV_BYTES)throw bulkError('INVENTORY_BULK_CSV_SIZE_INVALID');
 const s=input.replace(/^\uFEFF/,'');let field='',record=[],records=[],quoted=false,closed=false;
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){if(c==='"'&&s[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;continue;}
  if(closed&&c!==','&&c!=='\r'&&c!=='\n')throw bulkError('INVENTORY_BULK_CSV_MALFORMED');
  if(c==='"'){if(field!==''||closed)throw bulkError('INVENTORY_BULK_CSV_MALFORMED');quoted=true;continue;}
  if(c===','){record.push(field);field='';closed=false;continue;}
  if(c==='\r'||c==='\n'){
   if(c==='\r'&&s[i+1]==='\n')i++;
   record.push(field);field='';closed=false;
   if(record.some(x=>x.trim()!==''))records.push(record);
   record=[];if(records.length>MAX_BULK_ROWS+1)throw bulkError('INVENTORY_BULK_ROW_LIMIT');continue;
  }
  field+=c;
 }
 if(quoted)throw bulkError('INVENTORY_BULK_CSV_MALFORMED');
 record.push(field);if(record.some(x=>x.trim()!==''))records.push(record);
 if(records.length<2||records.length>MAX_BULK_ROWS+1)throw bulkError('INVENTORY_BULK_CSV_EMPTY_OR_LIMIT');
 const header=records.shift().map(x=>x.trim());
 if(header.length!==BULK_HEADERS.length||header.some((x,i)=>x!==BULK_HEADERS[i]))throw bulkError('INVENTORY_BULK_CSV_HEADERS_INVALID');
 return records.map((row,i)=>{
  if(row.length!==BULK_HEADERS.length)throw bulkError(`INVENTORY_BULK_CSV_COLUMN_COUNT_ROW_${i+2}`);
  return {sku:row[0].trim(),productName:row[1].trim(),branchCode:row[2].trim(),quantity:row[3].trim(),unitCost:row[4].trim(),referenceCost:row[5].trim(),line:i+2};
 });
}
export function normalizeBulkRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw bulkError('INVENTORY_BULK_INVALID_BODY');
 const branchId=String(body.branchId??'');
 if(!/^[1-9]\d{0,14}$/.test(branchId)||!Number.isSafeInteger(Number(branchId)))throw bulkError('INVENTORY_BULK_BRANCH_INVALID');
 const reference=String(body.reference??'').trim();
 if(reference.length<4||reference.length>120)throw bulkError('INVENTORY_BULK_REFERENCE_INVALID');
 const requestKey=String(body.requestKey??'').toLowerCase();
 if(!validUuid(requestKey))throw bulkError('INVENTORY_BULK_REQUEST_KEY_INVALID');
 const isCsv=typeof body.csvText==='string';
 if(isCsv&&body.rows!==undefined||!isCsv&&!Array.isArray(body.rows))throw bulkError('INVENTORY_BULK_SOURCE_INVALID');
 const sourceRows=isCsv?parseCsvTable(body.csvText):body.rows;
 if(!sourceRows.length||sourceRows.length>MAX_BULK_ROWS)throw bulkError('INVENTORY_BULK_ROW_LIMIT');
 const rows=[],errors=[],seen=new Set();
 for(let i=0;i<sourceRows.length;i++){
  const source=sourceRows[i];const line=isCsv?source.line:i+1;
  const rawSku=String(source?.sku??'').trim();
  const sku=(isCsv&&/^'[=+@-]/.test(rawSku)?rawSku.slice(1):rawSku).toUpperCase();
  const qty=String(source?.quantity??'').trim();
  const unit=String(source?.unitCost??'').trim();
  const branchCode=String(source?.branchCode??'').trim().toUpperCase();
  // Blank CSV opening quantities mean "skip", whereas an explicit 0.00 is posted.
  if(isCsv&&qty==='')continue;
  const issues=[];
  if(!skuPattern.test(sku))issues.push('INVALID_SKU');
  if(seen.has(sku))issues.push('DUPLICATE_SKU');
  seen.add(sku);
  if(!decimalPattern.test(qty))issues.push('INVALID_QUANTITY');
  if(!decimalPattern.test(unit))issues.push('INVALID_ACTUAL_COST');
  let quantity=null,unitCost=null,opening=null;
  if(!issues.length){
   try{quantity=exact2(qty);unitCost=exact2(unit);opening=inventoryOpening(quantity,unitCost);}
   catch(e){issues.push(e.message);}
  }
  if(issues.length)errors.push({line,sku,errors:issues});
  rows.push({line,sku,quantity,unitCost,opening,branchCode,productName:String(source?.productName??'').trim()});
 }
 if(!rows.length&&!errors.length)errors.push({line:0,sku:'',errors:['NO_OPENING_QUANTITIES']});
 return {branchId,reference,requestKey,rows,errors,source:isCsv?'CSV':'QUICK'};
}
export function manifestHash(data,actorId){
 return createHash('sha256').update(JSON.stringify({branchId:data.branchId,reference:data.reference,requestKey:data.requestKey,actor:String(actorId),rows:data.rows.map(r=>[r.sku,r.quantity,r.unitCost,r.branchCode])})).digest('hex');
}
export function openingMovementKey(batchKey,productId){
 const digest=createHash('sha256').update(`TPOS_BULK_OPENING:${batchKey}:${productId}`).digest();
 const b=Buffer.from(digest.subarray(0,16));b[6]=b[6]&15|80;b[8]=b[8]&63|128;
 const x=b.toString('hex');return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}
export function openingMovementHash({branchId,productId,quantity,unitCost,reference,actorId}){
 return createHash('sha256').update(JSON.stringify({branchId:Number(branchId),productId:Number(productId),quantity,unitCost,reference,actor:String(actorId)})).digest('hex');
}
export function bulkTotals(rows){
 let q=0n,v=0n;
 for(const r of rows){if(!r.opening)continue;q+=quantity2AllowZero(r.opening.quantity);v+=quantity2AllowZero(r.opening.carryingValue);}
 try{const quantity=printValue(q),value=printValue(v);quantity2AllowZero(quantity);quantity2AllowZero(value);return {quantity,value};}catch{throw bulkError('INVENTORY_BULK_TOTAL_OUT_OF_RANGE');}
}
