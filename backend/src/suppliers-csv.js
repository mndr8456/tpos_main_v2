// V1 supplier fields, normalized to the Clean Rebuild uppercase status convention.
export const SUPPLIER_CSV_HEADERS=Object.freeze(['supplier_name','contact_name','phone_no','email','address','status']);
const bad=code=>Object.assign(new Error(code),{status:400});
export const supplierCsvTemplate=()=> '\uFEFF'+SUPPLIER_CSV_HEADERS.join(',')+'\r\nABC Trading Sdn Bhd,Mr Tan,0123456789,supplier@example.com,"No 1, Jalan Utama",ACTIVE\r\n';
export function parseSupplierCsv(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>256*1024)throw bad('CSV_TOO_LARGE');
 const rows=[];let field='',row=[],quoted=false,closed=false;
 const text=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;}
  else if(c==='"'&&!field&&!closed)quoted=true;
  else if(c===','||c==='\n'||c==='\r'){
   row.push(field);field='';closed=false;
   if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(v=>v.trim()))rows.push(row);row=[];}
  }else {if(c==='"'||closed)throw bad('CSV_MALFORMED');field+=c;}
 }
 if(quoted)throw bad('CSV_MALFORMED');
 if(row.length||field.length){row.push(field);if(row.some(v=>v.trim()))rows.push(row);}
 if(rows.length<2)throw bad('CSV_EMPTY');
 const header=rows.shift().map(s=>s.trim().toLowerCase());
 if(header.length!==SUPPLIER_CSV_HEADERS.length||header.some((h,i)=>h!==SUPPLIER_CSV_HEADERS[i]))throw bad('CSV_INVALID_HEADERS');
 if(rows.length>200)throw bad('CSV_ROW_LIMIT');
 const seen=new Set();
 return rows.map((cells,index)=>{
  const line=index+2;
  if(cells.length!==6)return {line,error:'CSV_COLUMN_COUNT'};
  const [name,contact,phone,email,address,status]=cells.map(x=>x.trim());
  const normalized=status.toUpperCase()||'ACTIVE';
  if(!name||name.length>220||contact.length>120||phone.length>40||email.length>254||address.length>2000||!['ACTIVE','INACTIVE'].includes(normalized)||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {line,error:'SUPPLIER_VALIDATION_ERROR'};
  const canon=name.toLocaleLowerCase('en');
  if(seen.has(canon))return {line,error:'DUPLICATE_IN_FILE'};
  seen.add(canon);
  return {line,data:{supplierName:name,contactName:contact,phoneNo:phone,email:email.toLowerCase(),address,status:normalized}};
 });
}
