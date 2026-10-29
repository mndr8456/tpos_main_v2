// Category CSV is deliberately independent from the Users importer.
export const CATEGORY_CSV_HEADERS = Object.freeze(['category_name','description','default_preparation_station','status']);
const error = code => Object.assign(new Error(code),{status:400});
export const categoryCsvTemplate = () => '\uFEFF'+CATEGORY_CSV_HEADERS.join(',')+'\r\nBeverages,Drinks and ready-to-sell beverages,DRINK,ACTIVE\r\n';
export function parseCategoryCsv(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>256*1024)throw error('CSV_TOO_LARGE');
 const lines=[];let field='',row=[],quoted=false,closed=false;
 const text=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const ch=text[i];
  if(quoted){if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}else if(ch==='"'){quoted=false;closed=true;}else field+=ch;}
  else if(ch==='"'&&!field&&!closed){quoted=true;}
  else if(ch===','||ch==='\r'||ch==='\n'){
   row.push(field);field='';closed=false;
   if(ch!==','){
    if(ch==='\r'&&text[i+1]==='\n')i++;
    if(row.some(v=>v.trim()))lines.push(row);
    row=[];
   }
  }else {if(ch==='"'||closed)throw error('CSV_MALFORMED');field+=ch;}
 }
 if(quoted)throw error('CSV_MALFORMED');
 if(row.length||field.length){row.push(field);if(row.some(v=>v.trim()))lines.push(row);}
 if(lines.length<2)throw error('CSV_EMPTY');
 const header=lines.shift().map(x=>x.trim().toLowerCase());
 if(header.length!==4||header.some((h,i)=>h!==CATEGORY_CSV_HEADERS[i]))throw error('CSV_INVALID_HEADERS');
 if(lines.length>200)throw error('CSV_ROW_LIMIT');
 const seen=new Set();
 return lines.map((fields,index)=>{
  const line=index+2;
  if(fields.length!==4)return {line,error:'CSV_COLUMN_COUNT'};
  const [name,description,station,status]=fields.map(s=>s.trim());
  const canonical=name.toLocaleLowerCase('en');
  if(!name||name.length>160||description.length>500||!/^[A-Z][A-Z0-9_]{0,39}$/.test((station||'KITCHEN').toUpperCase())||!['ACTIVE','INACTIVE'].includes((status||'ACTIVE').toUpperCase()))return {line,error:'CATEGORY_VALIDATION_ERROR'};
  if(seen.has(canonical))return {line,error:'DUPLICATE_IN_FILE'};
  seen.add(canonical);
  return {line,data:{categoryName:name,description,stationCode:(station||'KITCHEN').toUpperCase(),status:(status||'ACTIVE').toUpperCase()}};
 });
}
