// Voucher master CSV only. No reservation / customer / checkout data is accepted.
export const VOUCHER_CSV_HEADERS=Object.freeze(['voucher_code','voucher_name','description','discount_type','discount_value','minimum_spend','maximum_discount','starts_at','ends_at','order_scope','eligibility_type','targets','usage_limit','per_customer_limit','status']);
export const VOUCHER_CSV_ROW_LIMIT=1000;
const fail=code=>Object.assign(new Error(code),{status:400});
export function csvEscapeVoucher(value){const v=String(value??'');const safe=/^[=+@-]/.test(v)?`'${v}`:v;return `"${safe.replaceAll('"','""')}"`;}
export const voucherCsvTemplate=()=> '\uFEFF'+VOUCHER_CSV_HEADERS.join(',')+'\r\n'+['','Gift Voucher','Example voucher','FIXED_AMOUNT','10.00','20.00','','2026-10-01 00:00:00','2027-12-31 23:59:59','BOTH','ALL','','100','1','INACTIVE'].map(csvEscapeVoucher).join(',')+'\r\n';
// Excel Malaysia (DD/MM/YYYY) commonly rewrites CSV timestamps when saving.
// Normalize in the import adapter, never in the database or the business rules.
export function normalizeVoucherCsvDate(raw){
 const value=String(raw??'').trim();
 const local=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(value);
 if(local){const [,day,month,year,hour='0',minute='0',second='0']=local;return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')} ${hour.padStart(2,'0')}:${minute.padStart(2,'0')}:${second.padStart(2,'0')}`;}
 const iso=/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/.exec(value);
 if(iso){const [,year,month,day,hour='0',minute='0',second='0']=iso;return `${year}-${month.padStart(2,'0')}-${day.padStart(2,'0')} ${hour.padStart(2,'0')}:${minute.padStart(2,'0')}:${second.padStart(2,'0')}`;}
 return value;
}
export function parseVoucherCsv(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>1024*1024)throw fail('CSV_TOO_LARGE');
 let rows=[],cells=[],cell='',quoted=false,closed=false;const text=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else cell+=c;}
  else if(c==='"'&&!cell&&!closed)quoted=true;
  else if(c===','||c==='\r'||c==='\n'){cells.push(cell);cell='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(cells.some(x=>x.trim()))rows.push(cells);cells=[];}}
  else{if(c==='"'||closed)throw fail('CSV_MALFORMED');cell+=c;}
 }
 if(quoted)throw fail('CSV_MALFORMED');if(cells.length||cell.length){cells.push(cell);if(cells.some(x=>x.trim()))rows.push(cells);}
 if(rows.length<2)throw fail('CSV_EMPTY');const headers=rows.shift().map(x=>x.trim().toLowerCase());
 if(headers.length!==VOUCHER_CSV_HEADERS.length||headers.some((x,i)=>x!==VOUCHER_CSV_HEADERS[i]))throw fail('CSV_INVALID_HEADERS');
 if(rows.length>VOUCHER_CSV_ROW_LIMIT)throw fail('CSV_ROW_LIMIT');
 const used=new Set();return rows.map((arr,i)=>{
  if(arr.length!==headers.length)return {line:i+2,error:'CSV_COLUMN_COUNT'};
  const v=Object.fromEntries(headers.map((k,j)=>[k,arr[j].trim().replace(/^'(?=[=+@-])/,'')]));
  if(v.voucher_code){const normalized=v.voucher_code.toUpperCase();if(used.has(normalized))return {line:i+2,error:'DUPLICATE_VOUCHER_CODE',code:normalized,name:v.voucher_name};used.add(normalized);}
  return {line:i+2,data:{voucherCode:v.voucher_code.toUpperCase(),voucherName:v.voucher_name,description:v.description,discountType:v.discount_type.toUpperCase(),discountValue:v.discount_value,minimumSpend:v.minimum_spend||'0.00',maximumDiscount:v.maximum_discount||null,startsAt:normalizeVoucherCsvDate(v.starts_at),endsAt:normalizeVoucherCsvDate(v.ends_at),orderScope:v.order_scope.toUpperCase(),eligibilityType:v.eligibility_type.toUpperCase(),targetCodes:v.targets?v.targets.split('|').map(x=>x.trim()).filter(Boolean):[],usageLimit:v.usage_limit||null,perCustomerLimit:v.per_customer_limit||null,status:v.status.toUpperCase()||'INACTIVE'}};
 });
}
