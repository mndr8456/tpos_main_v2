import { z } from 'zod';
import { parseCategoryCsv } from './categories-csv.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const positive=z.coerce.number().int().positive();
const categorySchema=z.object({
 categoryName:z.string().trim().min(1).max(160),
 description:z.string().trim().max(500).optional().default(''),
 stationId:positive,
 status:z.enum(['ACTIVE','INACTIVE']).default('ACTIVE')
}).strict();
const stationSchema=z.object({code:z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/),name:z.string().trim().min(2).max(100)}).strict();
const csvSchema=z.object({csv:z.string().max(256*1024)}).strict();
const catId=p=>positive.parse(p);
const categorySelect=`SELECT c.id,c.category_name,c.description,c.default_preparation_station_id,c.status,c.created_at,c.updated_at,s.code AS station_code,s.name AS station_name
 FROM categories c JOIN preparation_stations s ON s.id=c.default_preparation_station_id WHERE c.is_deleted=0`;
const serialiseCategory=r=>({...r,id:String(r.id),default_preparation_station_id:String(r.default_preparation_station_id)});
async function listAll(pool){const [rows]=await pool.execute(`${categorySelect} ORDER BY c.id ASC LIMIT 5000`);return rows.map(serialiseCategory);}
async function audit(conn,actor,action,{categoryId=null,stationId=null,before=null,after=null}){
 await conn.execute('INSERT INTO category_audit_logs(category_id,station_id,actor_user_id,action_type,previous_data,next_data) VALUES(?,?,?,?,?,?)',
 [categoryId,stationId,actor,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);
}
async function categoryById(conn,id,lock=true){
 const [[row]]=await conn.execute(`${categorySelect} AND c.id=?${lock?' FOR UPDATE':''}`,[id]);
 return row;
}
async function stationById(conn,id,lock=false){const [[row]]=await conn.execute(`SELECT id,code,name,is_active FROM preparation_stations WHERE id=?${lock?' FOR UPDATE':''}`,[id]);return row;}
async function stationByCode(conn,code){const [[row]]=await conn.execute('SELECT id,code,name,is_active FROM preparation_stations WHERE code=?',[code]);return row;}
async function transaction(pool,work){const conn=await pool.getConnection();try{await conn.beginTransaction();const result=await work(conn);await conn.commit();return result;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
export function categoryErrorResponse(res,e){
 if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'CATEGORY_DUPLICATE'});
 if(e.code==='ER_NO_REFERENCED_ROW_2')return res.status(409).json({error:'CATEGORY_REFERENCE_INVALID'});
 throw e;
}
export async function listCategories(req,res){return res.json({categories:await listAll(req.auth.pool)});}
export async function exportCategories(req,res){return res.json({categories:await listAll(req.auth.pool)});}
export async function categoryMeta(req,res){
 const [stations]=await req.auth.pool.execute('SELECT id,code,name,is_active FROM preparation_stations ORDER BY id');
 return res.json({stations:stations.map(s=>({...s,id:String(s.id),is_active:Boolean(s.is_active)}))});
}
export async function createCategory(req,res){
 const data=categorySchema.parse(req.body);
 try{
  const id=await transaction(req.auth.pool,async conn=>{
   const station=await stationById(conn,data.stationId,true);
   if(!station||!station.is_active)throw fail('STATION_INACTIVE');
   const [r]=await conn.execute('INSERT INTO categories(category_name,description,default_preparation_station_id,status) VALUES(?,?,?,?)',[data.categoryName,data.description||null,data.stationId,data.status]);
   await audit(conn,req.auth.user.id,'CATEGORY_CREATE',{categoryId:r.insertId,after:{...data}});
   return r.insertId;
  });
  return res.status(201).json({message:'CATEGORY_CREATED',id:String(id)});
 }catch(e){return categoryErrorResponse(res,e);}
}
export async function updateCategory(req,res){
 const data=categorySchema.parse(req.body),id=catId(req.params.id);
 try{
  await transaction(req.auth.pool,async conn=>{
   const before=await categoryById(conn,id);
   if(!before)throw fail('CATEGORY_NOT_FOUND',404);
   const station=await stationById(conn,data.stationId,true);
   if(!station||!station.is_active)throw fail('STATION_INACTIVE');
   await conn.execute('UPDATE categories SET category_name=?,description=?,default_preparation_station_id=?,status=? WHERE id=? AND is_deleted=0',[data.categoryName,data.description||null,data.stationId,data.status,id]);
   await audit(conn,req.auth.user.id,'CATEGORY_UPDATE',{categoryId:id,before,after:data});
  });
  return res.json({message:'CATEGORY_UPDATED'});
 }catch(e){return categoryErrorResponse(res,e);}
}
export async function changeCategoryStatus(req,res){
 const id=catId(req.params.id),input=z.object({status:z.enum(['ACTIVE','INACTIVE'])}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{
  const before=await categoryById(conn,id);if(!before)throw fail('CATEGORY_NOT_FOUND',404);
  if(before.status===input.status)return;
  await conn.execute('UPDATE categories SET status=? WHERE id=? AND is_deleted=0',[input.status,id]);
  await audit(conn,req.auth.user.id,input.status==='ACTIVE'?'CATEGORY_ACTIVATE':'CATEGORY_DEACTIVATE',{categoryId:id,before,after:{status:input.status}});
 });
 return res.json({message:'CATEGORY_STATUS_UPDATED'});
}
export async function archiveCategory(req,res){
 const id=catId(req.params.id);
 await transaction(req.auth.pool,async conn=>{
  const before=await categoryById(conn,id);if(!before)throw fail('CATEGORY_NOT_FOUND',404);
  await conn.execute('UPDATE categories SET is_deleted=1,status=\'INACTIVE\' WHERE id=? AND is_deleted=0',[id]);
  await audit(conn,req.auth.user.id,'CATEGORY_DELETE',{categoryId:id,before,after:{isDeleted:true}});
 });
 return res.json({message:'CATEGORY_ARCHIVED'});
}
export async function categoryAudit(req,res){
 const [rows]=await req.auth.pool.execute('SELECT id,category_id,station_id,actor_user_id,action_type,previous_data,next_data,created_at FROM category_audit_logs ORDER BY id DESC LIMIT 200');
 return res.json({logs:rows.map(r=>({...r,id:String(r.id)}))});
}
export async function addStation(req,res){
 const data=stationSchema.parse(req.body);
 try{
  const id=await transaction(req.auth.pool,async conn=>{
   const [r]=await conn.execute('INSERT INTO preparation_stations(code,name) VALUES(?,?)',[data.code,data.name]);
   await audit(conn,req.auth.user.id,'STATION_CREATE',{stationId:r.insertId,after:data});
   return r.insertId;
  });return res.status(201).json({id:String(id),message:'STATION_CREATED'});
 }catch(e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'STATION_DUPLICATE'});throw e;}
}
export async function editStation(req,res){
 const id=positive.parse(req.params.id),data=stationSchema.parse(req.body);
 await transaction(req.auth.pool,async conn=>{
  const before=await stationById(conn,id,true);if(!before)throw fail('STATION_NOT_FOUND',404);
  if(['KITCHEN','DRINK','DESSERT','COUNTER','NONE'].includes(before.code)&&data.code!==before.code)throw fail('SYSTEM_STATION_CODE_LOCKED');
  try{await conn.execute('UPDATE preparation_stations SET code=?,name=? WHERE id=?',[data.code,data.name,id]);}catch(e){if(e.code==='ER_DUP_ENTRY')throw fail('STATION_DUPLICATE',409);throw e;}
  await audit(conn,req.auth.user.id,'STATION_UPDATE',{stationId:id,before,after:data});
 });return res.json({message:'STATION_UPDATED'});
}
export async function setStationActive(req,res){
 const id=positive.parse(req.params.id),{isActive}=z.object({isActive:z.boolean()}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{
  const before=await stationById(conn,id,true);if(!before)throw fail('STATION_NOT_FOUND',404);
  if(['KITCHEN','DRINK','DESSERT','COUNTER','NONE'].includes(before.code)&&!isActive)throw fail('SYSTEM_STATION_PROTECTED');
  if(!isActive){const [[used]]=await conn.execute('SELECT id FROM categories WHERE default_preparation_station_id=? AND is_deleted=0 LIMIT 1',[id]);if(used)throw fail('STATION_IN_USE',409);}
  if(Boolean(before.is_active)===isActive)return;
  await conn.execute('UPDATE preparation_stations SET is_active=? WHERE id=?',[isActive?1:0,id]);
  await audit(conn,req.auth.user.id,isActive?'STATION_ACTIVATE':'STATION_DEACTIVATE',{stationId:id,before,after:{isActive}});
 });return res.json({message:'STATION_STATUS_UPDATED'});
}
async function validateCategoryImport(pool,raw){
 const parsed=parseCategoryCsv(raw);
 const [stations]=await pool.execute('SELECT id,code,is_active FROM preparation_stations');
 const active=new Map(stations.filter(x=>x.is_active).map(s=>[s.code,String(s.id)]));
 const [existing]=await pool.execute('SELECT category_name FROM categories WHERE is_deleted=0');
 const names=new Set(existing.map(r=>r.category_name.trim().toLocaleLowerCase('en')));
 return parsed.map(row=>{
  if(!row.data)return row;
  if(!active.has(row.data.stationCode))return {line:row.line,error:'STATION_NOT_FOUND_OR_INACTIVE'};
  if(names.has(row.data.categoryName.toLocaleLowerCase('en')))return {line:row.line,error:'CATEGORY_DUPLICATE'};
  return {line:row.line,categoryName:row.data.categoryName,description:row.data.description,stationCode:row.data.stationCode,status:row.data.status};
 });
}
export async function previewCategoryImport(req,res){
 const {csv}=csvSchema.parse(req.body);
 const rows=await validateCategoryImport(req.auth.pool,csv);
 return res.json({rows,valid:rows.every(x=>!x.error),count:rows.length});
}
export async function importCategories(req,res){
 const {csv}=csvSchema.parse(req.body);
 // Validate against current DB again, inside same transaction. The preview is not authorization.
 try{
  const count=await transaction(req.auth.pool,async conn=>{
   const parsed=parseCategoryCsv(csv);
   if(parsed.some(r=>r.error))throw fail('CSV_VALIDATION_FAILED');
   let result=0;
   for(const row of parsed){
    const station=await stationByCode(conn,row.data.stationCode);
    if(!station||!station.is_active)throw fail('STATION_NOT_FOUND_OR_INACTIVE');
    const [r]=await conn.execute('INSERT INTO categories(category_name,description,default_preparation_station_id,status) VALUES(?,?,?,?)',
    [row.data.categoryName,row.data.description||null,station.id,row.data.status]);
    await audit(conn,req.auth.user.id,'CATEGORY_IMPORT',{categoryId:r.insertId,after:{line:row.line,...row.data}});
    result++;
   }
   return result;
  });
  return res.status(201).json({message:'CATEGORIES_IMPORTED',count});
 }catch(e){return categoryErrorResponse(res,e);}
}
