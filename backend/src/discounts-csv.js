// Discount R1 CSV preserves V1 master fields and adds targeting/usage limit.
export const DISCOUNT_CSV_HEADERS=Object.freeze(['discount_code','discount_name','description','discount_type','discount_scope','discount_value','minimum_spend','maximum_discount_amount','start_date','end_date','usage_limit','sort_order','status','eligibility_type','targets']);
export const DISCOUNT_CSV_LIMIT=1000;
const fail=code=>Object.assign(new Error(code),{status:400});
export const csvEscape=value=>{const raw=String(value??'');const safe=/^[=+@-]/.test(raw)?`'${raw}`:raw;return `"${safe.replaceAll('"','""')}"`;};
export const discountCsvTemplate=()=> '\uFEFF'+DISCOUNT_CSV_HEADERS.join(',')+'\r\n'+['WELCOME10','Welcome Discount 10%','Order promotion','PERCENTAGE','ORDER','10.00','0.00','','','','','0','ACTIVE','ALL',''].map(csvEscape).join(',')+'\r\n';
export function parseDiscountCsv(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>1024*1024)throw fail('CSV_TOO_LARGE');
 const lines=[];let cell='',row=[],quoted=false,closed=false;const text=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else cell+=c;}
  else if(c==='"'&&!cell&&!closed)quoted=true;
  else if(c===','||c==='\r'||c==='\n'){row.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()))lines.push(row);row=[];}}
  else{if(c==='"'||closed)throw fail('CSV_MALFORMED');cell+=c;}
 }
 if(quoted)throw fail('CSV_MALFORMED');
 if(row.length||cell.length){row.push(cell);if(row.some(x=>x.trim()))lines.push(row);}
 if(lines.length<2)throw fail('CSV_EMPTY');
 const headers=lines.shift().map(x=>x.trim().toLowerCase());
 if(headers.length!==DISCOUNT_CSV_HEADERS.length||headers.some((h,i)=>h!==DISCOUNT_CSV_HEADERS[i]))throw fail('CSV_INVALID_HEADERS');
 if(lines.length>DISCOUNT_CSV_LIMIT)throw fail('CSV_ROW_LIMIT');
 const seen=new Set();
 return lines.map((cells,i)=>{
  if(cells.length!==headers.length)return {line:i+2,error:'CSV_COLUMN_COUNT'};
  const values=Object.fromEntries(headers.map((key,index)=>[key,cells[index].trim()]));
  const code=values.discount_code.toUpperCase();
  if(seen.has(code))return {line:i+2,error:'DUPLICATE_CODE_IN_FILE'};
  seen.add(code);
  const targets=values.targets?values.targets.split('|').map(t=>t.trim()).filter(Boolean):[];
  const data={discountCode:code,discountName:values.discount_name,description:values.description,discountType:values.discount_type.toUpperCase().replaceAll(' ','_'),discountScope:values.discount_scope.toUpperCase(),discountValue:values.discount_value,minimumSpend:values.minimum_spend||'0',maximumDiscountAmount:values.maximum_discount_amount||null,startDate:values.start_date||null,endDate:values.end_date||null,usageLimit:values.usage_limit||null,sortOrder:values.sort_order||0,status:values.status.toUpperCase()||'ACTIVE',eligibilityType:values.eligibility_type.toUpperCase()||'ALL',targetCodes:targets};
  return {line:i+2,data};
 });
}
