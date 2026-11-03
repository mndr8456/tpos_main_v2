import {z} from 'zod';
import {checkPaymentImage} from './payment-method-security.js';
import {normalizeStaffImportDates,describeStaffImportError} from './staff-import-dates.js';

const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const managed=new Set(['OWNER','ADMIN','HR']);
const elevated=req=>managed.has(req.auth.user.role_code);
const allowView=req=>elevated(req)||req.auth.user.role_code==='MANAGER';
const sensitive=['ic_no','epf_no','socso_no','eis_no','income_tax_no','bank_account_no'];
const baseFields=['address_line_1','address_line_2','address_line_3','postcode','city','state_name','country_code','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone','epf_no','socso_no','eis_no','income_tax_no','bank_name','bank_account_name','bank_account_no','ic_no','job_title','department','employment_type','join_date','confirmation_date','resignation_date','salary_type','basic_salary','standard_working_hours_per_day','standard_working_days_per_month','employment_status','notes','status'];
const selfFields=['address_line_1','address_line_2','address_line_3','postcode','city','state_name','country_code','emergency_contact_name','emergency_contact_relationship','emergency_contact_phone','ic_no','bank_name','bank_account_name','bank_account_no','epf_no','socso_no','eis_no','income_tax_no'];
const text=max=>z.string().trim().max(max).nullable().optional().transform(x=>x||null);
const money=z.union([z.string(),z.number()]).transform(v=>String(v)).pipe(z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/));
const date=z.union([z.literal(''),z.iso.date()]).nullable().optional().transform(v=>v||null);
const profileBody=z.object({
 user_id:id.optional(),staff_prefix:z.string().trim().regex(/^[A-Za-z0-9]{2,12}-$/).optional(),staff_no:z.string().trim().max(50).optional(),
 ic_no:z.union([z.literal(''),z.string().regex(/^\d{12}$/)]).nullable().optional().transform(v=>v||null),
 address_line_1:text(255),address_line_2:text(255),address_line_3:text(255),postcode:text(20),city:text(100),state_name:text(100),country_code:z.string().regex(/^[A-Z]{3}$/).optional().default('MYS'),
 emergency_contact_name:text(255),emergency_contact_relationship:text(100),emergency_contact_phone:text(30),
 epf_no:text(50),socso_no:text(50),eis_no:text(50),income_tax_no:text(50),
 bank_name:text(150),bank_account_name:text(255),bank_account_no:text(100),
 job_title:text(150),department:text(150),employment_type:z.enum(['Full Time','Part Time','Intern']).default('Full Time'),
 join_date:date,confirmation_date:date,resignation_date:date,
 salary_type:z.enum(['Monthly','Daily','Hourly']).default('Monthly'),
 basic_salary:money.default('0.00'),standard_working_hours_per_day:money.default('8.00'),standard_working_days_per_month:money.default('26.00'),
 employment_status:z.enum(['Active','Probation','Suspended','Resigned','Terminated']).default('Active'),notes:text(10000),status:z.enum(['active','inactive']).default('active')
}).strict();
const selfBody=profileBody.pick(Object.fromEntries(selfFields.map(x=>[x,true]))).partial().strict();
const listFields=baseFields.filter(x=>x!=='ic_no').join(',sp.');
const selectStaff=`SELECT sp.id,sp.user_id,sp.staff_no,sp.ic_no,sp.${listFields},sp.overtime_rate_per_hour,
 sp.created_at,sp.updated_at,CASE WHEN sp.image_mime IN ('image/png','image/jpeg','image/webp') AND OCTET_LENGTH(sp.image_data) > 0 THEN 1 ELSE 0 END AS has_image,
 u.full_name,u.email,u.phone,u.status AS user_status,r.code AS role_code
 FROM staff_profiles sp JOIN users u ON u.id=sp.user_id
 JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id`;
const stringifyIds=row=>({...row,id:String(row.id),user_id:String(row.user_id),has_image:row.has_image===true||row.has_image===1||row.has_image==='1'||(Buffer.isBuffer(row.has_image)&&row.has_image.length===1&&row.has_image[0]===1)});
export function safeStaff(row,full=false){
 const result=stringifyIds(row);
 if(!full)for(const key of sensitive)result[key]=row[key]?'************':null;
 return result;
}
const filterBranch=(req,rows)=>elevated(req)?rows:rows.filter(r=>req.auth.user.branchIds.includes(String(r.branch_id)));
const profileError=e=>e.code==='ER_DUP_ENTRY'?fail('STAFF_USER_OR_NUMBER_ALREADY_EXISTS',409):e;
async function transaction(pool,fn){const c=await pool.getConnection();try{await c.beginTransaction();const result=await fn(c);await c.commit();return result;}catch(e){await c.rollback();throw profileError(e);}finally{c.release();}}
async function log(conn,req,staffId,action,fields=[]){
 await conn.execute('INSERT INTO staff_profile_audit_logs(staff_profile_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',
  [staffId,req.auth.user.id,action,JSON.stringify({fields:fields.filter(x=>!['ic_no','bank_account_no','epf_no','socso_no','eis_no','income_tax_no'].includes(x)),sensitiveChanged:fields.some(x=>sensitive.includes(x))})]);
}
function autoPrefix(name){const parts=String(name||'').replace(/[^a-zA-Z0-9 ]/g,' ').trim().split(/\s+/).filter(Boolean);return parts.length>=2?parts.slice(0,3).map(x=>x[0].toUpperCase()).join('')+'-':'STF-';}
async function nextStaffNo(conn,prefix,lock=true){
 const [rows]=await conn.execute(`SELECT staff_no FROM staff_profiles WHERE staff_no LIKE ?${lock?' FOR UPDATE':''}`,[`${prefix}%`]);
 const nums=rows.map(x=>String(x.staff_no).slice(prefix.length)).filter(x=>/^\d{1,8}$/.test(x)).map(Number);
 return `${prefix}${String((nums.length?Math.max(...nums):0)+1).padStart(4,'0')}`;
}
function hourlyRate(input){const salary=Number(input.basic_salary),days=Number(input.standard_working_days_per_month),hours=Number(input.standard_working_hours_per_day);
 if(!Number.isFinite(salary)||!Number.isFinite(days)||!Number.isFinite(hours)||days<=0||hours<=0)throw fail('INVALID_WORKING_STANDARD');
 const value=Math.round((salary/days/hours+Number.EPSILON)*100)/100;
 if(!Number.isFinite(value)||value>9999999999.99)throw fail('INVALID_OVERTIME_RATE');
 return value.toFixed(2);
}
function makeValues(body){const out={};for(const key of baseFields){if(key==='ic_no')out[key]=body.ic_no??null;else if(key==='country_code')out[key]=body.country_code||'MYS';else out[key]=body[key]??null;}out.overtime_rate_per_hour=hourlyRate(body);return out;}
async function getRow(conn,profileId){const [[row]]=await conn.execute(`${selectStaff} WHERE sp.id=? LIMIT 1`,[profileId]);if(!row)throw fail('STAFF_NOT_FOUND',404);return row;}
async function getOwnRow(conn,req){const [[row]]=await conn.execute(`${selectStaff} WHERE sp.user_id=? LIMIT 1`,[req.auth.user.id]);return row||null;}
function authorized(req,row,write=false){const own=String(row.user_id)===String(req.auth.user.id);if(write){if(!elevated(req)&&!own)throw fail('STAFF_UPDATE_NOT_ALLOWED',403);}else if(!allowView(req)&&!own)throw fail('STAFF_VIEW_NOT_ALLOWED',403);return own;}
function checkAccess(req,action){if(action==='manage'&&!elevated(req))throw fail('STAFF_MANAGE_NOT_ALLOWED',403);if(action==='view'&&!allowView(req))throw fail('STAFF_VIEW_NOT_ALLOWED',403);}
export async function staffMeta(req,res){
 const canManage=elevated(req),canList=allowView(req);
 const [users,company]=await Promise.all([
  canManage?req.auth.pool.execute(`SELECT u.id,u.full_name,u.email,u.phone,u.status,r.code AS role_code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id LEFT JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.status='ACTIVE' AND sp.id IS NULL ORDER BY u.full_name`):Promise.resolve([[]]),
  req.auth.pool.execute('SELECT registered_name FROM company_profiles WHERE id=1')
 ]);
 const companyName=company[0][0]?.registered_name||req.auth.company.business_name;const prefix=autoPrefix(companyName);
 const next=canManage?await nextStaffNo(req.auth.pool,prefix,false):`${prefix}0001`;
 res.set('Cache-Control','no-store').json({users:users[0].map(u=>({...u,id:String(u.id)})),businessName:companyName,
  prefix,nextNumber:next.slice(prefix.length),canManage,canList,canPrint:canManage});
}
export async function staffNextNumber(req,res){checkAccess(req,'manage');const query=z.object({prefix:z.string().regex(/^[A-Za-z0-9]{2,12}-$/)}).strict().parse(req.query);const value=await nextStaffNo(req.auth.pool,query.prefix.toUpperCase(),false);res.set('Cache-Control','no-store').json({staffNo:value,nextNumber:value.slice(query.prefix.length)});}
export async function listStaff(req,res){checkAccess(req,'view');const query=z.object({search:z.string().max(160).optional().default(''),department:z.string().max(150).optional(),employmentType:z.enum(['Full Time','Part Time','Intern']).optional(),employmentStatus:z.enum(['Active','Probation','Suspended','Resigned','Terminated']).optional(),status:z.enum(['active','inactive']).optional(),limit:z.coerce.number().int().min(1).max(500).optional().default(100)}).strict().parse(req.query);
 const [rows]=await req.auth.pool.execute(`${selectStaff} WHERE 1=1 ORDER BY SUBSTRING_INDEX(sp.staff_no, '-', 1), CAST(SUBSTRING_INDEX(sp.staff_no, '-', -1) AS UNSIGNED), sp.staff_no, sp.id LIMIT 1000`);
 const q=query.search.toLowerCase();const filtered=rows.filter(r=>(!q||[r.full_name,r.staff_no,r.email,r.department,r.job_title].some(v=>String(v||'').toLowerCase().includes(q)))&&(!query.department||r.department===query.department)&&(!query.employmentType||r.employment_type===query.employmentType)&&(!query.employmentStatus||r.employment_status===query.employmentStatus)&&(!query.status||r.status===query.status));
 const safe=filtered.slice(0,query.limit).map(r=>safeStaff(r,elevated(req)||String(r.user_id)===String(req.auth.user.id)));
 const salary=elevated(req)?filtered.reduce((n,r)=>n+Number(r.basic_salary||0),0).toFixed(2):null;
 return res.set('Cache-Control','no-store').json({staff:safe,summary:{totalStaff:filtered.length,activeStaff:filtered.filter(r=>r.employment_status==='Active').length,probation:filtered.filter(r=>r.employment_status==='Probation').length,basicSalaryTotal:salary}});
}
export async function getStaff(req,res){const staffId=id.parse(req.params.id),row=await getRow(req.auth.pool,staffId);const own=authorized(req,row);res.set('Cache-Control','no-store').json({staff:safeStaff(row,own||elevated(req))});}
export async function getMyStaff(req,res){const row=await getOwnRow(req.auth.pool,req);res.set('Cache-Control','no-store').json({staff:row?safeStaff(row,true):null});}
export async function createStaff(req,res){checkAccess(req,'manage');const data=profileBody.extend({user_id:id}).parse(req.body);const prefix=data.staff_prefix||autoPrefix(req.auth.company.business_name);const staffId=await transaction(req.auth.pool,async conn=>{
 const [[user]]=await conn.execute('SELECT id FROM users WHERE id=? AND status=\'ACTIVE\' FOR UPDATE',[data.user_id]);if(!user)throw fail('STAFF_USER_NOT_ACTIVE',404);
 const staffNo=data.staff_no&&/^[A-Za-z0-9]{2,12}-\d{1,8}$/.test(data.staff_no)?data.staff_no:await nextStaffNo(conn,prefix);
 const values=makeValues(data);const keys=['user_id','staff_no',...Object.keys(values),'created_by_user_id','updated_by_user_id'];const params=[data.user_id,staffNo,...Object.values(values),req.auth.user.id,req.auth.user.id];
 const [insert]=await conn.execute(`INSERT INTO staff_profiles (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,params);
 await log(conn,req,insert.insertId,'CREATE',Object.keys(values));return insert.insertId;
 });res.status(201).json({message:'STAFF_CREATED',id:String(staffId)});}
export async function updateStaff(req,res){checkAccess(req,'manage');const staffId=id.parse(req.params.id),data=profileBody.omit({user_id:true,staff_no:true,staff_prefix:true}).parse(req.body);
 await transaction(req.auth.pool,async conn=>{await getRow(conn,staffId);const values=makeValues(data);const keys=Object.keys(values);
 await conn.execute(`UPDATE staff_profiles SET ${keys.map(k=>`${k}=?`).join(',')},updated_by_user_id=? WHERE id=?`,[...Object.values(values),req.auth.user.id,staffId]);await log(conn,req,staffId,'UPDATE',keys);});
 res.json({message:'STAFF_UPDATED'});}
export async function updateMyStaff(req,res){const data=selfBody.parse(req.body);
 const result=await transaction(req.auth.pool,async conn=>{const row=await getOwnRow(conn,req);if(!row)throw fail('STAFF_NOT_FOUND',404);const keys=Object.keys(data).filter(k=>selfFields.includes(k));if(!keys.length)throw fail('NO_FIELDS_TO_UPDATE');
 await conn.execute(`UPDATE staff_profiles SET ${keys.map(k=>`${k}=?`).join(',')},updated_by_user_id=? WHERE id=?`,[...keys.map(k=>data[k]),req.auth.user.id,row.id]);await log(conn,req,row.id,'SELF_UPDATE',keys);return row.id;});
 res.json({message:'STAFF_SELF_UPDATED',id:String(result)});}
export async function changeStaffStatus(req,res){checkAccess(req,'manage');const staffId=id.parse(req.params.id),body=z.object({status:z.enum(['active','inactive'])}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{await getRow(conn,staffId);await conn.execute('UPDATE staff_profiles SET status=?,updated_by_user_id=? WHERE id=?',[body.status,req.auth.user.id,staffId]);await log(conn,req,staffId,'STATUS_CHANGE',['status']);});
 res.json({message:'STAFF_STATUS_UPDATED'});}
export async function staffAudit(req,res){checkAccess(req,'manage');const staffId=id.parse(req.params.id);await getRow(req.auth.pool,staffId);
 const [rows]=await req.auth.pool.execute(`SELECT l.id,l.action_type,l.details,l.recorded_at,u.full_name AS actor_name FROM staff_profile_audit_logs l JOIN users u ON u.id=l.actor_user_id WHERE l.staff_profile_id=? ORDER BY l.id DESC LIMIT 100`,[staffId]);
 res.set('Cache-Control','no-store').json({logs:rows.map(x=>({...x,id:String(x.id)}))});}
export async function staffImage(req,res){const staffId=id.parse(req.params.id);const row=await getRow(req.auth.pool,staffId);authorized(req,row);const [[image]]=await req.auth.pool.execute('SELECT image_mime,image_data FROM staff_profiles WHERE id=?',[staffId]);
 if(!image?.image_data)return res.status(404).json({error:'STAFF_IMAGE_NOT_FOUND'});
 res.set('Cache-Control','private,no-store').type(image.image_mime).send(image.image_data);}
export async function uploadStaffImage(req,res){const staffId=id.parse(req.params.id);const data=z.object({mime:z.enum(['image/png','image/jpeg','image/webp']),base64:z.string().min(1).max(1_400_000)}).strict().parse(req.body);
 const bytes=checkPaymentImage(data.mime,data.base64);await transaction(req.auth.pool,async conn=>{const row=await getRow(conn,staffId);authorized(req,row,true);await conn.execute('UPDATE staff_profiles SET image_mime=?,image_data=?,updated_by_user_id=? WHERE id=?',[data.mime,bytes,req.auth.user.id,staffId]);await log(conn,req,staffId,'IMAGE_UPDATE',[]);});res.json({message:'STAFF_IMAGE_UPDATED'});}
export async function removeStaffImage(req,res){const staffId=id.parse(req.params.id);await transaction(req.auth.pool,async conn=>{const row=await getRow(conn,staffId);authorized(req,row,true);await conn.execute('UPDATE staff_profiles SET image_mime=NULL,image_data=NULL,updated_by_user_id=? WHERE id=?',[req.auth.user.id,staffId]);await log(conn,req,staffId,'IMAGE_REMOVED',[]);});res.json({message:'STAFF_IMAGE_REMOVED'});}
export const staffImportHeaders=['user_email','staff_no','ic_no',...baseFields.filter(x=>x!=='ic_no')];
export function parseStaffCsv(source){if(typeof source!=='string'||source.length>450000)throw fail('STAFF_CSV_INVALID_SIZE');const lines=source.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());if(lines.length<2||lines.length>201)throw fail('STAFF_CSV_ROW_LIMIT');const records=lines.map(line=>{const values=[];let s='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){s+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){values.push(s);s='';}else s+=c;}if(quoted)throw fail('STAFF_CSV_MALFORMED_QUOTES');values.push(s);return values;});const head=records.shift().map(v=>v.trim().toLowerCase());const legacy=staffImportHeaders.filter(x=>x!=='ic_no');if(head.join(',')!==staffImportHeaders.join(',')&&head.join(',')!==legacy.join(','))throw fail('STAFF_CSV_HEADERS_MISMATCH');return records.map((values,i)=>{if(values.length!==head.length)throw fail(`STAFF_CSV_ROW_${i+2}_WIDTH`);return Object.fromEntries(head.map((k,j)=>[k,values[j].trim()]));});}
export async function staffCsvTemplate(req,res){checkAccess(req,'manage');res.type('text/csv').set('Content-Disposition','attachment; filename="staff-profiles-template.csv"').send('\uFEFF'+staffImportHeaders.join(',')+'\r\n');}
async function validateImport(req,csv){const rows=parseStaffCsv(csv),errors=[];const prepared=[];const emails=new Set(),numbers=new Set();for(let i=0;i<rows.length;i++){const raw=rows[i],row=i+2;try{
 if(emails.has(raw.user_email.toLowerCase())||(raw.staff_no&&numbers.has(raw.staff_no)))throw fail('STAFF_DUPLICATE_IN_CSV');if(raw.staff_no&&!/^[A-Za-z0-9]{2,12}-\d{1,8}$/.test(raw.staff_no))throw fail('STAFF_NO_INVALID');emails.add(raw.user_email.toLowerCase());numbers.add(raw.staff_no);
 const [[user]]=await req.auth.pool.execute('SELECT u.id FROM users u LEFT JOIN staff_profiles sp ON sp.user_id=u.id WHERE u.email=? AND u.status=\'ACTIVE\' AND sp.id IS NULL LIMIT 1',[raw.user_email.toLowerCase()]);if(!user)throw fail('USER_NOT_AVAILABLE');
 const cleaned=normalizeStaffImportDates(raw);
 const normalized={};for(const key of baseFields)normalized[key]=cleaned[key]||undefined;
 if(raw.ic_no)normalized.ic_no=raw.ic_no;
 const parsed=profileBody.extend({user_id:id}).parse({user_id:user.id,staff_no:raw.staff_no||undefined,...normalized});
 prepared.push(parsed);
 }catch(e){errors.push({row,error:describeStaffImportError(e)});}}
 return {rows:prepared,errors,count:rows.length};}
export async function previewStaffImport(req,res){checkAccess(req,'manage');const {csv}=z.object({csv:z.string()}).strict().parse(req.body);const result=await validateImport(req,csv);res.set('Cache-Control','no-store').json({count:result.count,errors:result.errors,validRows:result.rows.length});}
export async function confirmStaffImport(req,res){checkAccess(req,'manage');const {csv}=z.object({csv:z.string()}).strict().parse(req.body);const result=await validateImport(req,csv);if(result.errors.length)throw fail('STAFF_IMPORT_PREVIEW_HAS_ERRORS',409);
 const count=await transaction(req.auth.pool,async conn=>{for(const d of result.rows){const prefix=d.staff_prefix||autoPrefix(req.auth.company.business_name);const number=d.staff_no||await nextStaffNo(conn,prefix);const values=makeValues(d);const keys=['user_id','staff_no',...Object.keys(values),'created_by_user_id','updated_by_user_id'];const [insert]=await conn.execute(`INSERT INTO staff_profiles (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,[d.user_id,number,...Object.values(values),req.auth.user.id,req.auth.user.id]);await log(conn,req,insert.insertId,'IMPORT_CREATE',Object.keys(values));}return result.rows.length;});
 res.json({message:'STAFF_IMPORTED',count});}
