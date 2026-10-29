import { z } from 'zod';
import { parseSupplierCsv } from './suppliers-csv.js';

const failure=(code,status=400)=>Object.assign(new Error(code),{status});
const positive=z.coerce.number().int().positive();
const optional=(length)=>z.string().trim().max(length).optional().default('');
export const supplierSchema=z.object({
 supplierName:z.string().trim().min(1).max(220),
 contactName:optional(120),phoneNo:optional(40),
 email:z.union([z.email().max(254),z.literal('')]).optional().default('').transform(x=>x.toLowerCase()),
 address:optional(2000),status:z.enum(['ACTIVE','INACTIVE']).default('ACTIVE')
}).strict();
const csvSchema=z.object({csv:z.string().max(256*1024)}).strict();
const supplierSelect=`SELECT id,supplier_code,supplier_name,contact_name,phone_no,email,address,status,created_at,updated_at FROM suppliers WHERE is_deleted=0`;
const output=r=>({...r,id:String(r.id)});
async function transaction(pool,callback){
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();const result=await callback(conn);await conn.commit();return result;}
 catch(e){await conn.rollback();throw e;}
 finally{conn.release();}
}
async function findSupplier(conn,id,lock=true){
 const [[row]]=await conn.execute(`${supplierSelect} AND id=?${lock?' FOR UPDATE':''}`,[id]);return row;
}
async function audit(conn,userId,action,{supplierId=null,before=null,after=null}){
 await conn.execute('INSERT INTO supplier_audit_logs(supplier_id,actor_user_id,action_type,previous_data,next_data) VALUES(?,?,?,?,?)',
 [supplierId,userId,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);
}
async function insertSupplier(conn,data,userId,action){
 const [insert]=await conn.execute('INSERT INTO suppliers(supplier_name,contact_name,phone_no,email,address,status) VALUES(?,?,?,?,?,?)',
 [data.supplierName,data.contactName||null,data.phoneNo||null,data.email||null,data.address||null,data.status]);
 const id=insert.insertId;
 // Tenant-local supplier code is stable and unique; not a secret token.
 const supplierCode=`SUP-${String(id).padStart(6,'0')}`;
 await conn.execute('UPDATE suppliers SET supplier_code=? WHERE id=?',[supplierCode,id]);
 await audit(conn,userId,action,{supplierId:id,after:{...data,supplierCode}});
 return {id:String(id),supplierCode};
}
function respondError(res,e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'SUPPLIER_DUPLICATE'});throw e;}
export async function listSuppliers(req,res){
 const [rows]=await req.auth.pool.execute(`${supplierSelect} ORDER BY id ASC LIMIT 5000`);
 return res.json({suppliers:rows.map(output)});
}
export const exportSuppliers=listSuppliers;
export async function createSupplier(req,res){
 const data=supplierSchema.parse(req.body);
 try{const result=await transaction(req.auth.pool,conn=>insertSupplier(conn,data,req.auth.user.id,'SUPPLIER_CREATE'));
  return res.status(201).json({message:'SUPPLIER_CREATED',...result});}
 catch(e){return respondError(res,e);}
}
export async function updateSupplier(req,res){
 const id=positive.parse(req.params.id),data=supplierSchema.parse(req.body);
 try{
  await transaction(req.auth.pool,async conn=>{
   const before=await findSupplier(conn,id);if(!before)throw failure('SUPPLIER_NOT_FOUND',404);
   await conn.execute('UPDATE suppliers SET supplier_name=?,contact_name=?,phone_no=?,email=?,address=?,status=? WHERE id=? AND is_deleted=0',
    [data.supplierName,data.contactName||null,data.phoneNo||null,data.email||null,data.address||null,data.status,id]);
   await audit(conn,req.auth.user.id,'SUPPLIER_UPDATE',{supplierId:id,before,after:data});
  });return res.json({message:'SUPPLIER_UPDATED'});
 }catch(e){return respondError(res,e);}
}
export async function changeSupplierStatus(req,res){
 const id=positive.parse(req.params.id),{status}=z.object({status:z.enum(['ACTIVE','INACTIVE'])}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{
  const before=await findSupplier(conn,id);if(!before)throw failure('SUPPLIER_NOT_FOUND',404);
  if(before.status===status)return;
  await conn.execute('UPDATE suppliers SET status=? WHERE id=? AND is_deleted=0',[status,id]);
  await audit(conn,req.auth.user.id,status==='ACTIVE'?'SUPPLIER_ACTIVATE':'SUPPLIER_DEACTIVATE',{supplierId:id,before,after:{status}});
 });return res.json({message:'SUPPLIER_STATUS_UPDATED'});
}
export async function archiveSupplier(req,res){
 const id=positive.parse(req.params.id);
 await transaction(req.auth.pool,async conn=>{
  const before=await findSupplier(conn,id);if(!before)throw failure('SUPPLIER_NOT_FOUND',404);
  await conn.execute("UPDATE suppliers SET is_deleted=1,status='INACTIVE' WHERE id=? AND is_deleted=0",[id]);
  await audit(conn,req.auth.user.id,'SUPPLIER_ARCHIVE',{supplierId:id,before,after:{isDeleted:true}});
 });return res.json({message:'SUPPLIER_ARCHIVED'});
}
export async function supplierAudit(req,res){
 const [rows]=await req.auth.pool.execute('SELECT id,supplier_id,actor_user_id,action_type,previous_data,next_data,created_at FROM supplier_audit_logs ORDER BY id DESC LIMIT 200');
 return res.json({logs:rows.map(output)});
}
async function validatePreview(pool,csv){
 const rows=parseSupplierCsv(csv);
 const [existing]=await pool.execute('SELECT supplier_name FROM suppliers WHERE is_deleted=0');
 const names=new Set(existing.map(x=>x.supplier_name.trim().toLocaleLowerCase('en')));
 return rows.map(row=>{
  if(!row.data)return row;
  if(names.has(row.data.supplierName.toLocaleLowerCase('en')))return {line:row.line,error:'SUPPLIER_DUPLICATE'};
  return {line:row.line,...row.data};
 });
}
export async function previewSupplierImport(req,res){
 const {csv}=csvSchema.parse(req.body),rows=await validatePreview(req.auth.pool,csv);
 return res.json({rows,valid:rows.every(r=>!r.error),count:rows.length});
}
export async function importSuppliers(req,res){
 const {csv}=csvSchema.parse(req.body);
 try{
  const count=await transaction(req.auth.pool,async conn=>{
   const rows=parseSupplierCsv(csv);
   if(rows.some(r=>r.error))throw failure('CSV_VALIDATION_FAILED');
   let done=0;
   for(const row of rows){await insertSupplier(conn,row.data,req.auth.user.id,'SUPPLIER_IMPORT');done++;}
   return done;
  });return res.status(201).json({message:'SUPPLIERS_IMPORTED',count});
 }catch(e){return respondError(res,e);}
}
