import {z} from 'zod';
import {tableSchema,parseTableCsv,csvRows,csvTemplate} from './restaurant-tables-csv.js';
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const elevated=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code);
const checkBranch=(req,branchId)=>{if(!elevated(req)&&!req.auth.user.branchIds.includes(String(branchId)))throw fail('TABLE_BRANCH_NOT_ASSIGNED',403);};
const allowedBusiness=req=>{if(!['RESTAURANT','CAFE'].includes(req.auth.company.business_type))throw fail('RESTAURANT_TABLES_NOT_APPLICABLE',403);};
const permitted=(req,code)=>{if(!req.auth.user.permissions.includes(code))throw fail('PERMISSION_DENIED',403);};
const transact=async(pool,fn)=>{const c=await pool.getConnection();try{await c.beginTransaction();const r=await fn(c);await c.commit();return r;}catch(e){await c.rollback();if(e.code==='ER_DUP_ENTRY')throw fail('TABLE_NUMBER_ALREADY_EXISTS',409);if(e.code==='ER_LOCK_DEADLOCK')throw fail('TABLE_CONFLICT_RETRY',409);throw e;}finally{c.release();}};
async function audit(conn,req,tableId,action,details){await conn.execute('INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,?,?)',[tableId,req.auth.user.id,action,JSON.stringify(details)]);}
export const tablesSelect=`SELECT t.id,t.branch_id,b.code AS branch_code,b.name AS branch_name,t.table_number,t.table_name,t.table_area,t.seating_capacity,t.table_status,t.status,t.sort_order,t.is_deleted,
 CASE WHEN d.id IS NOT NULL THEN 'OCCUPIED' ELSE t.table_status END AS occupancy,
 d.id AS draft_id,d.cashier_user_id AS assigned_cashier, d.status AS draft_status
 FROM restaurant_tables t JOIN branches b ON b.id=t.branch_id
 LEFT JOIN pos_drafts d ON d.active_table_id=t.id`;
const rowMap=x=>({...x,id:String(x.id),branch_id:String(x.branch_id),draft_id:x.draft_id==null?null:String(x.draft_id)});
async function getTable(conn,tableId,lock=false,includeArchived=false){const [[row]]=await conn.execute(`SELECT * FROM restaurant_tables WHERE id=?${includeArchived?'':' AND is_deleted=0'}${lock?' FOR UPDATE':''}`,[tableId]);if(!row)throw fail('TABLE_NOT_FOUND',404);return row;}
async function ensureBranch(conn,req,branchId){checkBranch(req,branchId);const [[b]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1',[branchId]);if(!b)throw fail('BRANCH_NOT_ACTIVE',409);}
async function noActiveDraft(conn,tableId){const [[row]]=await conn.execute("SELECT id FROM pos_drafts WHERE active_table_id=? LIMIT 1",[tableId]);if(row)throw fail('TABLE_HAS_ACTIVE_ORDER',409);}
export async function tableMeta(req,res){allowedBusiness(req);const [rows]=await req.auth.pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id');res.set('Cache-Control','no-store').json({branches:rows.filter(x=>elevated(req)||req.auth.user.branchIds.includes(String(x.id))).map(x=>({...x,id:String(x.id)}))});}
export async function listTables(req,res){allowedBusiness(req);const query=z.object({branchId:id.optional()}).strict().parse(req.query);if(query.branchId)checkBranch(req,query.branchId);
 const [rows]=await req.auth.pool.execute(`${tablesSelect} WHERE t.is_deleted=0${query.branchId?' AND t.branch_id=?':''} ORDER BY t.branch_id,t.table_area,t.sort_order,t.table_number`,query.branchId?[query.branchId]:[]);
 return res.set('Cache-Control','no-store').json({tables:rows.filter(x=>elevated(req)||req.auth.user.branchIds.includes(String(x.branch_id))).map(rowMap)});
}
export async function createTable(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.create');const data=tableSchema.parse(req.body);const result=await transact(req.auth.pool,async conn=>{await ensureBranch(conn,req,data.branchId);
 const [ins]=await conn.execute('INSERT INTO restaurant_tables(branch_id,table_number,table_name,table_area,seating_capacity,table_status,status,sort_order) VALUES(?,?,?,?,?,?,?,?)',[data.branchId,data.tableNumber,data.tableName||null,data.tableArea||null,data.seatingCapacity,data.tableStatus,data.status,data.sortOrder]);await audit(conn,req,ins.insertId,'CREATE',data);return ins.insertId;
 });res.status(201).json({message:'TABLE_CREATED',id:String(result)});
}
export async function updateTable(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.update');const tableId=id.parse(req.params.id);const data=tableSchema.parse(req.body);
 await transact(req.auth.pool,async conn=>{const old=await getTable(conn,tableId,true);checkBranch(req,old.branch_id);if(String(old.branch_id)!==String(data.branchId))throw fail('TABLE_BRANCH_IMMUTABLE',409);
 if(data.status==='INACTIVE'||data.tableStatus!=='AVAILABLE')await noActiveDraft(conn,tableId);
 await conn.execute('UPDATE restaurant_tables SET table_number=?,table_name=?,table_area=?,seating_capacity=?,table_status=?,status=?,sort_order=? WHERE id=?',[data.tableNumber,data.tableName||null,data.tableArea||null,data.seatingCapacity,data.tableStatus,data.status,data.sortOrder,tableId]);await audit(conn,req,tableId,'UPDATE',{before:old,after:data});});res.json({message:'TABLE_UPDATED'});
}
export async function archiveTable(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.delete');const tableId=id.parse(req.params.id);
 await transact(req.auth.pool,async conn=>{const row=await getTable(conn,tableId,true);checkBranch(req,row.branch_id);await noActiveDraft(conn,tableId);await conn.execute("UPDATE restaurant_tables SET is_deleted=1,status='INACTIVE' WHERE id=?",[tableId]);await audit(conn,req,tableId,'ARCHIVE',{tableNumber:row.table_number});});res.json({message:'TABLE_ARCHIVED'});
}
export async function tableAudit(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.audit');const tableId=id.parse(req.params.id);const row=await getTable(req.auth.pool,tableId,false,true);checkBranch(req,row.branch_id);
 const [logs]=await req.auth.pool.execute(`SELECT a.id,a.action_type,a.details,DATE_FORMAT(a.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,u.full_name AS actor_name FROM restaurant_table_audit_logs a JOIN users u ON u.id=a.actor_user_id WHERE a.table_id=? ORDER BY a.id DESC LIMIT 300`,[tableId]);res.json({logs});
}
export async function exportTables(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.export');const [rows]=await req.auth.pool.execute('SELECT t.*,b.code AS branch_code FROM restaurant_tables t JOIN branches b ON b.id=t.branch_id WHERE t.is_deleted=0 ORDER BY t.branch_id,t.sort_order,t.id');
 const visible=rows.filter(r=>elevated(req)||req.auth.user.branchIds.includes(String(r.branch_id)));
 res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('restaurant-tables.csv').send(csvRows(visible.map(r=>[r.table_number,r.table_name,r.table_area,r.seating_capacity,r.table_status,r.status,r.sort_order,r.branch_code])));
}
export function tableTemplate(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.import');res.set('Cache-Control','no-store').type('text/csv; charset=utf-8').attachment('restaurant-tables-template.csv').send(csvTemplate());}
const importSchema=z.object({csv:z.string().min(1).max(1024*1024)}).strict();
async function validateImport(conn,req,rows){
 const [branches]=await conn.execute('SELECT id,code FROM branches WHERE is_active=1');const visible=branches.filter(b=>elevated(req)||req.auth.user.branchIds.includes(String(b.id)));
 return rows.map(r=>{
  const branch=r.branchCode?visible.find(b=>b.code.toUpperCase()===r.branchCode):(visible.length===1?visible[0]:null);
  if(!branch)throw fail(`IMPORT_ROW_${r.row}_BRANCH_NOT_FOUND`,409);
  const data=tableSchema.parse({branchId:Number(branch.id),tableNumber:r.tableNumber,tableName:r.tableName,tableArea:r.tableArea,seatingCapacity:r.seatingCapacity,tableStatus:r.tableStatus,status:r.status,sortOrder:r.sortOrder});return {...data,row:r.row};
 });
}
export async function previewTableImport(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.import');const {csv}=importSchema.parse(req.body);const rows=await validateImport(req.auth.pool,req,parseTableCsv(csv));
 const seen=new Set();for(const r of rows){const key=`${r.branchId}:${r.tableNumber.toLowerCase()}`;if(seen.has(key))throw fail(`IMPORT_ROW_${r.row}_DUPLICATE`,409);seen.add(key);}
 const [existing]=await req.auth.pool.execute('SELECT branch_id,table_number FROM restaurant_tables WHERE is_deleted=0');const keys=new Set(existing.map(r=>`${r.branch_id}:${r.table_number.toLowerCase()}`));for(const r of rows)if(keys.has(`${r.branchId}:${r.tableNumber.toLowerCase()}`))throw fail(`IMPORT_ROW_${r.row}_ALREADY_EXISTS`,409);
 res.set('Cache-Control','no-store').json({count:rows.length,preview:rows.slice(0,30)});
}
export async function importTables(req,res){allowedBusiness(req);permitted(req,'restaurant_tables.import');const {csv}=importSchema.parse(req.body);
 const results=await transact(req.auth.pool,async conn=>{const rows=await validateImport(conn,req,parseTableCsv(csv));const seen=new Set();for(const r of rows){const key=`${r.branchId}:${r.tableNumber.toLowerCase()}`;if(seen.has(key))throw fail(`IMPORT_ROW_${r.row}_DUPLICATE`,409);seen.add(key);}
  for(const r of rows){await ensureBranch(conn,req,r.branchId);const [ins]=await conn.execute('INSERT INTO restaurant_tables(branch_id,table_number,table_name,table_area,seating_capacity,table_status,status,sort_order) VALUES(?,?,?,?,?,?,?,?)',[r.branchId,r.tableNumber,r.tableName||null,r.tableArea||null,r.seatingCapacity,r.tableStatus,r.status,r.sortOrder]);await audit(conn,req,ins.insertId,'IMPORT',{row:r.row,tableNumber:r.tableNumber});}
  return rows.length;});res.status(201).json({message:'TABLES_IMPORTED',created:results});
}
