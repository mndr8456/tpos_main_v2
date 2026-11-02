// V1-compatible restaurant table CSV with bounded RFC4180 parsing and injection-safe export.
import {z} from 'zod';
export const headers=['Table Number','Table Name','Table Area','Seating Capacity','Table Status','Status','Sort Order','Branch Code'];
export const tableSchema=z.object({branchId:z.coerce.number().int().positive(),tableNumber:z.string().trim().min(1).max(50),tableName:z.string().trim().max(100).default(''),tableArea:z.string().trim().max(100).default(''),seatingCapacity:z.coerce.number().int().min(1).max(100).default(4),tableStatus:z.enum(['AVAILABLE','RESERVED','CLEANING']).default('AVAILABLE'),status:z.enum(['ACTIVE','INACTIVE']).default('ACTIVE'),sortOrder:z.coerce.number().int().min(-100000).max(100000).default(0)}).strict();
export const csvCell=value=>{const v=String(value??'');const safe=/^[\s]*[=+@-]/.test(v)&&!/^[-+]\d+(?:\.\d+)?$/.test(v.trim())?`'${v}`:v;return `"${safe.replaceAll('"','""')}"`;};
export const csvRows=rows=>'\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
export const csvTemplate=()=>csvRows([['T01','Table 1','Main Hall',4,'AVAILABLE','ACTIVE',1,'MAIN']]);
export function parseTableCsv(input){
 if(typeof input!=='string'||Buffer.byteLength(input,'utf8')>1024*1024)throw Error('CSV_FILE_TOO_LARGE');
 let s=input.replace(/^\ufeff/,'');let rows=[],row=[],cell='',quoted=false,afterQuote=false;
 for(let i=0;i<s.length;i++){
  const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;}
  else if(afterQuote){if(c===','||c==='\n'||c==='\r'){afterQuote=false;i--;continue;}if(c===' '||c==='\t')continue;throw Error('CSV_MALFORMED_QUOTES');}
  else if(c==='"'){if(cell!=='')throw Error('CSV_MALFORMED_QUOTES');quoted=true;}
  else if(c===','){row.push(cell);cell='';}
  else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
  else if(c==='\r'){if(s[i+1]!=='\n')throw Error('CSV_INVALID_LINE_ENDING');}
  else cell+=c;
 }
 if(quoted)throw Error('CSV_MALFORMED_QUOTES');
 if(cell!==''||row.length){row.push(cell);rows.push(row);}
 rows=rows.filter(r=>r.some(x=>x.trim()));
 if(rows.length<2)throw Error('CSV_EMPTY');
 const key=rows.shift().map(x=>x.trim().toLowerCase().replace(/[_\s]+/g,' '));const expected=headers.map(x=>x.toLowerCase());
 // V1 template: seven snake_case headers. V1 exported report: id + seven fields + two timestamps.
 const legacy=key.length===7&&key.every((x,i)=>x===expected[i]);
 const legacyExport=key.length===10&&key[0]==='id'&&key.slice(1,8).every((x,i)=>x===expected[i])&&key[8]==='created at'&&key[9]==='updated at';
 const current=key.length===8&&key.every((x,i)=>x===expected[i]);
 if(!legacy&&!legacyExport&&!current)throw Error('CSV_HEADERS_INVALID');
 if(rows.length>500)throw Error('CSV_ROW_LIMIT_500');
 const seen=new Set();return rows.map((cells,i)=>{
  if(cells.length!==(legacyExport?10:legacy?7:8))throw Error(`CSV_ROW_${i+2}_COLUMN_COUNT`);
  const [tableNumber,tableName,tableArea,capacity,tableStatus,status,sortOrder,branchCode='']=(legacyExport?cells.slice(1,8):cells).map(x=>x.trim());
  if(!tableNumber||tableNumber.length>50||!/^\d+$/.test(capacity)||!/^[-+]?\d+$/.test(sortOrder)||Number(capacity)<1||Number(capacity)>100||Math.abs(Number(sortOrder))>100000||!['AVAILABLE','RESERVED','CLEANING'].includes(tableStatus.toUpperCase())||!['ACTIVE','INACTIVE'].includes(status.toUpperCase()))throw Error(`CSV_ROW_${i+2}_INVALID`);
  const key=`${branchCode.toUpperCase()}:${tableNumber.toUpperCase()}`;if(seen.has(key))throw Error(`CSV_ROW_${i+2}_DUPLICATE_TABLE`);seen.add(key);
  return {row:i+2,tableNumber,tableName,tableArea,seatingCapacity:Number(capacity),tableStatus:tableStatus.toUpperCase(),status:status.toUpperCase(),sortOrder:Number(sortOrder),branchCode:branchCode.toUpperCase()};
 });
}
