import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { mkdir,readFile,unlink,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseProductCsv, productCsvTemplate } from './products-csv.js';
export { productCsvTemplate };
import { structureShape, validateStructure, syncProductStructure, getStructure } from './product-structure.js';
const failure=(code,status=400)=>Object.assign(new Error(code),{status});
const id=z.coerce.number().int().positive();
const optional=n=>z.string().trim().max(n).optional().default('');
// Never silently round monetary amounts, stock thresholds, or tax rates in MySQL.
const decimal=(places,max)=>z.union([z.string().trim(),z.number().finite()]).refine(v=>
 new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(String(v)),
 {message:`Use a nonnegative decimal with at most ${places} places`}
).transform(Number).pipe(z.number().finite().min(0).max(max));
const amount=decimal(4,9999999999);
const qty=decimal(4,9999999999);
const optId=z.union([z.coerce.number().int().positive(),z.literal(''),z.null()]).optional().default('');
export const productSchema=z.object({
 sku:optional(64),barcode:optional(100),productName:z.string().trim().min(1).max(220),description:optional(2000),
 imageUrl:z.literal('').optional().default(''),
 productType:z.enum(['GOODS','SERVICE']).default('GOODS'),...structureShape,categoryId:id,supplierId:optId,
 costPrice:amount,sellingPrice:amount,minStockQty:qty,trackStock:z.boolean(),isWeighable:z.boolean(),
 weighingUnit:z.enum(['KG','G']).default('KG'),requiresPreparation:z.boolean(),stationId:optId,
 lhdnClassificationCode:z.string().trim().min(1).max(16).default('022'),
 lhdnUnitCode:z.string().trim().min(1).max(16).default('EA'),
 lhdnTaxTypeCode:z.string().trim().min(1).max(16).default('06'),
 lhdnTaxRate:decimal(3,100),
 lhdnTaxExemptionReason:optional(500),lhdnProductTariffCode:optional(40),
 lhdnCountryOfOriginCode:optional(3),isTaxInclusive:z.boolean(),
 jkdmTaxType:z.enum(['NONE','SALES_TAX','SERVICE_TAX']).default('NONE'),jkdmTaxRate:decimal(3,100),jkdmTaxInclusive:z.boolean().default(false),
 status:z.enum(['ACTIVE','INACTIVE']).default('ACTIVE')
}).strict().superRefine((p,ctx)=>{
 validateStructure(p,ctx);
 if(p.jkdmTaxType==='NONE'&&(p.jkdmTaxRate!==0||p.jkdmTaxInclusive))ctx.addIssue({code:'custom',path:['jkdmTaxRate'],message:'JKDM tax rate and inclusive flag must be zero/false for NONE'});
 if(p.productType==='SERVICE'&&(p.trackStock||p.isWeighable))ctx.addIssue({code:'custom',path:['productType'],message:'Services cannot be stock tracked or weighed'});
 if(p.isWeighable&&!p.trackStock)ctx.addIssue({code:'custom',path:['isWeighable'],message:'Weighable products must be stock tracked'});
 if(p.requiresPreparation&&!p.stationId)ctx.addIssue({code:'custom',path:['stationId'],message:'Preparation station required'});
 if(!p.requiresPreparation&&p.stationId)ctx.addIssue({code:'custom',path:['stationId'],message:'Disable preparation station when preparation is off'});
});
const fields=['sku','barcode','product_name','product_description','product_image_url','product_type','product_structure','base_unit_code','category_id','supplier_id','cost_price','selling_price','min_stock_qty','track_stock','is_weighable','weighing_unit','requires_preparation','preparation_station_id','lhdn_classification_code','lhdn_unit_code','lhdn_tax_type_code','lhdn_tax_rate','lhdn_tax_exemption_reason','lhdn_product_tariff_code','lhdn_country_of_origin_code','is_tax_inclusive','jkdm_tax_type','jkdm_tax_rate','jkdm_tax_inclusive','status'];
const values=p=>[p.sku||null,p.barcode||null,p.productName,p.description||null,p.imageUrl||null,p.productType,p.productStructure,p.baseUnitCode,p.categoryId,p.supplierId||null,p.costPrice,p.sellingPrice,p.minStockQty,Number(p.trackStock),Number(p.isWeighable),p.weighingUnit,Number(p.requiresPreparation),p.stationId||null,p.lhdnClassificationCode,p.lhdnUnitCode,p.lhdnTaxTypeCode,p.lhdnTaxRate,p.lhdnTaxExemptionReason||null,p.lhdnProductTariffCode||null,p.lhdnCountryOfOriginCode||null,Number(p.isTaxInclusive),p.jkdmTaxType,p.jkdmTaxRate,Number(p.jkdmTaxInclusive),p.status];
const select=`SELECT p.*,c.category_name,s.supplier_name,st.code AS station_code,st.name AS station_name FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id LEFT JOIN preparation_stations st ON st.id=p.preparation_station_id WHERE p.is_deleted=0`;
const output=(r,canCost)=>{const {active_name,...item}=r;if(!canCost)delete item.cost_price;return {...item,id:String(r.id),category_id:String(r.category_id),supplier_id:r.supplier_id?String(r.supplier_id):null,preparation_station_id:r.preparation_station_id?String(r.preparation_station_id):null};};
const costAllowed=req=>req.auth.user.permissions.includes('products.cost.view');
async function transaction(pool,callback){const conn=await pool.getConnection();try{await conn.beginTransaction();const val=await callback(conn);await conn.commit();return val;}catch(e){await conn.rollback();throw e;}finally{conn.release();}}
async function getProduct(conn,productId,lock=true){const [[row]]=await conn.execute(`${select} AND p.id=?${lock?' FOR UPDATE':''}`,[productId]);return row;}
async function audit(conn,actor,productId,action,before=null,after=null){await conn.execute('INSERT INTO product_audit_logs(product_id,actor_user_id,action_type,previous_data,next_data) VALUES(?,?,?,?,?)',[productId,actor,action,before?JSON.stringify(before):null,after?JSON.stringify(after):null]);}
async function validateRelations(conn,p){
 const [[cat]]=await conn.execute('SELECT id FROM categories WHERE id=? AND status=? AND is_deleted=0',[p.categoryId,'ACTIVE']);
 if(!cat)throw failure('CATEGORY_NOT_ACTIVE');
 if(p.supplierId){const [[supplier]]=await conn.execute('SELECT id FROM suppliers WHERE id=? AND status=? AND is_deleted=0',[p.supplierId,'ACTIVE']);if(!supplier)throw failure('SUPPLIER_NOT_ACTIVE');}
 if(p.requiresPreparation){const [[station]]=await conn.execute('SELECT id FROM preparation_stations WHERE id=? AND is_active=1',[p.stationId]);if(!station)throw failure('STATION_NOT_ACTIVE');}
}
async function insertProduct(conn,p,actor,action){
 await validateRelations(conn,p);
 const [created]=await conn.execute(`INSERT INTO products (${fields.join(',')}) VALUES (${fields.map(()=>'?').join(',')})`,values(p));
 const productId=created.insertId;
 if(!p.sku){const autoSku=`PRD-${String(productId).padStart(6,'0')}`;await conn.execute('UPDATE products SET sku=? WHERE id=?',[autoSku,productId]);p={...p,sku:autoSku};}
 await syncProductStructure(conn,productId,p);
 await audit(conn,actor,productId,action,null,p);return {id:String(productId),sku:p.sku};
}
function handleDbError(res,e){if(e.code==='ER_DUP_ENTRY')return res.status(409).json({error:'SKU_OR_BARCODE_DUPLICATE'});throw e;}
export async function listProducts(req,res){
 const branchId=req.query.branchId ? id.parse(req.query.branchId) : null;
 if(branchId)requireBranch(req,branchId);
 const [rows]=await req.auth.pool.execute(`${select} ORDER BY p.id ASC LIMIT 50000`);
 const overrides=new Map();
 if(branchId){const [prices]=await req.auth.pool.execute('SELECT product_id,selling_price FROM product_branch_prices WHERE branch_id=?',[branchId]);
  for(const price of prices)overrides.set(String(price.product_id),price.selling_price);}
 const [packageRows,componentRows]=await Promise.all([
  req.auth.pool.execute('SELECT pu.product_id,pu.unit_code,pu.units_per_base,pu.barcode,pu.selling_price FROM product_packaging_units pu JOIN products p ON p.id=pu.product_id WHERE pu.is_active=1 AND p.is_deleted=0'),
  req.auth.pool.execute('SELECT pc.parent_product_id,pc.component_product_id,p.sku,p.product_name,pc.quantity_per_parent FROM product_components pc JOIN products p ON p.id=pc.component_product_id JOIN products parent ON parent.id=pc.parent_product_id WHERE pc.is_active=1 AND parent.is_deleted=0')
 ]);
 const byId=(source,key)=>{const result=new Map();for(const item of source){const k=String(item[key]);if(!result.has(k))result.set(k,[]);result.get(k).push(item);}return result;};
 const packages=byId(packageRows[0],'product_id'),components=byId(componentRows[0],'parent_product_id');
 return res.json({products:rows.map(r=>({...output(r,costAllowed(req)),effective_selling_price:overrides.get(String(r.id))??r.selling_price,
 packaging_units:(packages.get(String(r.id))||[]).map(u=>({unitCode:u.unit_code,unitsPerBase:String(u.units_per_base),barcode:u.barcode||'',sellingPrice:String(u.selling_price)})),
 components:(components.get(String(r.id))||[]).map(u=>({productId:String(u.component_product_id),sku:u.sku,productName:u.product_name,quantity:String(u.quantity_per_parent)}))})),inventoryStatus:'INVENTORY_MODULE_PENDING'});
}
export const exportProducts=listProducts;
export async function productStructure(req,res){
 const productId=id.parse(req.params.id);
 const [[row]]=await req.auth.pool.execute('SELECT id,product_structure,base_unit_code FROM products WHERE id=? AND is_deleted=0',[productId]);
 if(!row)throw failure('PRODUCT_NOT_FOUND',404);
 const structure=await getStructure(req.auth.pool,productId);
 return res.json({productStructure:row.product_structure,baseUnitCode:row.base_unit_code,...structure});
}
export async function productMeta(req,res){
 const {pool,user}=req.auth;
 const [categories,suppliers,stations,branches,componentCandidates]=await Promise.all([
  pool.execute("SELECT id,category_name,default_preparation_station_id FROM categories WHERE status='ACTIVE' AND is_deleted=0 ORDER BY category_name"),
  pool.execute("SELECT id,supplier_name FROM suppliers WHERE status='ACTIVE' AND is_deleted=0 ORDER BY supplier_name"),
  pool.execute('SELECT id,code,name FROM preparation_stations WHERE is_active=1 ORDER BY id'),
  pool.execute('SELECT id,code,name FROM branches WHERE is_active=1 ORDER BY id'),
  pool.execute("SELECT id,sku,product_name,base_unit_code FROM products WHERE product_structure='SINGLE' AND status='ACTIVE' AND is_deleted=0 ORDER BY product_name LIMIT 3000")
 ]);
 const allowed=new Set(user.branchIds);
 return res.json({categories:categories[0].map(x=>({...x,id:String(x.id),default_preparation_station_id:String(x.default_preparation_station_id)})),suppliers:suppliers[0].map(x=>({...x,id:String(x.id)})),stations:stations[0].map(x=>({...x,id:String(x.id)})),branches:branches[0].filter(b=>allowed.has(String(b.id))).map(x=>({...x,id:String(x.id)})),componentCandidates:componentCandidates[0].map(x=>({...x,id:String(x.id)}))});
}
export async function createProduct(req,res){if(!costAllowed(req))throw failure('COST_PERMISSION_REQUIRED',403);const p=productSchema.parse(req.body);try{const result=await transaction(req.auth.pool,conn=>insertProduct(conn,p,req.auth.user.id,'PRODUCT_CREATE'));return res.status(201).json({message:'PRODUCT_CREATED',...result});}catch(e){return handleDbError(res,e);}}
export async function updateProduct(req,res){if(!costAllowed(req))throw failure('COST_PERMISSION_REQUIRED',403);const productId=id.parse(req.params.id),p=productSchema.parse(req.body);try{
 await transaction(req.auth.pool,async conn=>{const before=await getProduct(conn,productId);if(!before)throw failure('PRODUCT_NOT_FOUND',404);await validateRelations(conn,p);
 if((p.status==='INACTIVE'&&before.status==='ACTIVE')||(before.product_structure==='SINGLE'&&p.productStructure!=='SINGLE'))await rejectUsedComponent(conn,productId);
 // SKU may not be blank on update: preserve the original generated identifier.
 const next={...p,sku:p.sku||before.sku,imageUrl:before.product_image_url||''};
 const previousStructure=await getStructure(conn,productId);
 await conn.execute(`UPDATE products SET ${fields.map(f=>`${f}=?`).join(',')} WHERE id=? AND is_deleted=0`,[...values(next),productId]);
 await syncProductStructure(conn,productId,next);
 await audit(conn,req.auth.user.id,productId,'PRODUCT_UPDATE',{...output(before,true),...previousStructure},next);
 });return res.json({message:'PRODUCT_UPDATED'});
 }catch(e){return handleDbError(res,e);}}
async function rejectUsedComponent(conn,productId){const [[row]]=await conn.execute("SELECT pc.parent_product_id FROM product_components pc JOIN products p ON p.id=pc.parent_product_id WHERE pc.component_product_id=? AND pc.is_active=1 AND p.status='ACTIVE' AND p.is_deleted=0 LIMIT 1",[productId]);if(row)throw failure('PRODUCT_USED_IN_ACTIVE_SET_OR_BUNDLE');}
export async function productStatus(req,res){const productId=id.parse(req.params.id),{status}=z.object({status:z.enum(['ACTIVE','INACTIVE'])}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{const before=await getProduct(conn,productId);if(!before)throw failure('PRODUCT_NOT_FOUND',404);if(before.status===status)return;if(status==='INACTIVE')await rejectUsedComponent(conn,productId);
 await conn.execute('UPDATE products SET status=? WHERE id=? AND is_deleted=0',[status,productId]);
 await audit(conn,req.auth.user.id,productId,status==='ACTIVE'?'PRODUCT_ACTIVATE':'PRODUCT_DEACTIVATE',{status:before.status},{status});});return res.json({message:'PRODUCT_STATUS_UPDATED'});
}
export async function archiveProduct(req,res){const productId=id.parse(req.params.id);await transaction(req.auth.pool,async conn=>{const before=await getProduct(conn,productId);if(!before)throw failure('PRODUCT_NOT_FOUND',404);await rejectUsedComponent(conn,productId);await conn.execute("UPDATE products SET status='INACTIVE',is_deleted=1 WHERE id=? AND is_deleted=0",[productId]);await audit(conn,req.auth.user.id,productId,'PRODUCT_ARCHIVE',{sku:before.sku,status:before.status},{isDeleted:true});});return res.json({message:'PRODUCT_ARCHIVED'});}
function sanitizedAuditDetail(value,canCost){
 if(canCost||value===null||value===undefined)return value;
 const obj=typeof value==='string'?JSON.parse(value):value;
 if(!obj||typeof obj!=='object')return obj;
 const withoutCost={...obj};delete withoutCost.costPrice;delete withoutCost.cost_price;
 return withoutCost;
}
export async function productAudit(req,res){
 const [rows]=await req.auth.pool.execute(`
  SELECT al.id,al.product_id,p.product_name,al.actor_user_id,
         COALESCE(NULLIF(TRIM(u.full_name),''),u.username) AS user_name,
         al.action_type,al.previous_data,al.next_data,al.created_at
  FROM product_audit_logs al
  LEFT JOIN products p ON p.id=al.product_id
  LEFT JOIN users u ON u.id=al.actor_user_id
  ORDER BY al.id DESC LIMIT 200`);
 const canCost=costAllowed(req);
 return res.json({logs:rows.map(r=>({...r,id:String(r.id),product_id:String(r.product_id),previous_data:sanitizedAuditDetail(r.previous_data,canCost),next_data:sanitizedAuditDetail(r.next_data,canCost)}))});
}
function requireBranch(req,branchId){if(!req.auth.user.branchIds.includes(String(branchId)))throw failure('BRANCH_ACCESS_DENIED',403);}
export async function listBranchPrices(req,res){const productId=id.parse(req.params.id);const [rows]=await req.auth.pool.execute('SELECT bp.branch_id,b.name AS branch_name,bp.selling_price,bp.updated_at FROM product_branch_prices bp JOIN branches b ON b.id=bp.branch_id JOIN products p ON p.id=bp.product_id WHERE bp.product_id=? AND p.is_deleted=0',[productId]);return res.json({prices:rows.filter(r=>req.auth.user.branchIds.includes(String(r.branch_id))).map(r=>({...r,branch_id:String(r.branch_id)}))});}
export async function saveBranchPrice(req,res){const productId=id.parse(req.params.id),branchId=id.parse(req.params.branchId);requireBranch(req,branchId);
 const {sellingPrice}=z.object({sellingPrice:amount}).strict().parse(req.body);
 await transaction(req.auth.pool,async conn=>{const [[branch]]=await conn.execute('SELECT id FROM branches WHERE id=? AND is_active=1',[branchId]);if(!branch)throw failure('BRANCH_NOT_ACTIVE');
 const product=await getProduct(conn,productId);if(!product)throw failure('PRODUCT_NOT_FOUND',404);
 const [[before]]=await conn.execute('SELECT selling_price FROM product_branch_prices WHERE product_id=? AND branch_id=? FOR UPDATE',[productId,branchId]);
 await conn.execute('INSERT INTO product_branch_prices(product_id,branch_id,selling_price,updated_by) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE selling_price=VALUES(selling_price),updated_by=VALUES(updated_by)',[productId,branchId,sellingPrice,req.auth.user.id]);
 await audit(conn,req.auth.user.id,productId,'PRODUCT_BRANCH_PRICE',before?{branchId,sellingPrice:before.selling_price}:null,{branchId,sellingPrice});});return res.json({message:'PRODUCT_BRANCH_PRICE_UPDATED'});
}
const csvSchema=z.object({csv:z.string().max(8*1024*1024)}).strict();
async function csvRows(conn,csv){
 const parsed=parseProductCsv(csv);
 const [categories,suppliers,stations,componentProducts]=await Promise.all([
  conn.execute("SELECT id,category_name FROM categories WHERE status='ACTIVE' AND is_deleted=0"),
  conn.execute("SELECT id,supplier_name FROM suppliers WHERE status='ACTIVE' AND is_deleted=0"),
  conn.execute('SELECT id,code FROM preparation_stations WHERE is_active=1'),
  conn.execute("SELECT id,sku FROM products WHERE is_deleted=0 AND status='ACTIVE' AND product_structure='SINGLE'")
 ]);
 const byName=(rows,key)=>new Map(rows.map(r=>[String(r[key]).trim().toLocaleLowerCase('en'),r.id]));
 const cats=byName(categories[0],'category_name'),sup=byName(suppliers[0],'supplier_name'),sts=byName(stations[0],'code'),productSkus=byName(componentProducts[0],'sku');
 const [existing]=await conn.execute('SELECT sku,barcode FROM products');
 const [existingBarcodes]=await conn.execute('SELECT barcode FROM product_barcodes');
 const skus=new Set(existing.map(x=>x.sku?.toLowerCase()).filter(Boolean)),barcodes=new Set([...existing.map(x=>x.barcode?.toLowerCase()).filter(Boolean),...existingBarcodes.map(x=>x.barcode.toLowerCase())]);
 return parsed.map(row=>{
  if(!row.data)return row;
  const d=row.data;
  const resolved={sku:d.sku,barcode:d.barcode,productName:d.productName,description:d.description,productType:d.productType,productStructure:d.productStructure,baseUnitCode:d.baseUnitCode,packagingUnits:d.packagingUnits,components:d.componentSkus.map(c=>({productId:productSkus.get(c.sku.toLowerCase())||0,quantity:c.quantity})),
   categoryId:cats.get(d.categoryName.toLocaleLowerCase('en'))||null,
   supplierId:d.supplierName?sup.get(d.supplierName.toLocaleLowerCase('en'))||null:'',
   costPrice:d.costPrice,sellingPrice:d.sellingPrice,minStockQty:d.minStockQty,trackStock:d.trackStock,
   isWeighable:d.isWeighable,weighingUnit:d.weighingUnit,requiresPreparation:d.requiresPreparation,
   stationId:d.stationCode?sts.get(d.stationCode.toLocaleLowerCase('en'))||null:'',
   lhdnClassificationCode:d.lhdnClassificationCode,lhdnUnitCode:d.lhdnUnitCode,lhdnTaxTypeCode:d.lhdnTaxTypeCode,
   lhdnTaxRate:d.lhdnTaxRate,isTaxInclusive:d.isTaxInclusive,jkdmTaxType:d.jkdmTaxType,jkdmTaxRate:d.jkdmTaxRate,jkdmTaxInclusive:d.jkdmTaxInclusive,status:d.status};
  if(resolved.components.some(x=>!x.productId))return {line:row.line,error:'COMPONENT_SKU_NOT_FOUND',...d};
  if(d.packagingUnits.some(x=>x.barcode&&barcodes.has(x.barcode.toLowerCase())))return {line:row.line,error:'SKU_OR_BARCODE_DUPLICATE',...d};
  if(!resolved.categoryId)return {line:row.line,error:'CATEGORY_NOT_ACTIVE',...d};
  if(d.supplierName&&!resolved.supplierId)return {line:row.line,error:'SUPPLIER_NOT_ACTIVE',...d};
  if(d.stationCode&&!resolved.stationId)return {line:row.line,error:'STATION_NOT_ACTIVE',...d};
  if(d.sku&&skus.has(d.sku.toLowerCase()))return {line:row.line,error:'SKU_OR_BARCODE_DUPLICATE',...d};
  if(d.barcode&&barcodes.has(d.barcode.toLowerCase()))return {line:row.line,error:'SKU_OR_BARCODE_DUPLICATE',...d};
  const checked=productSchema.safeParse({...resolved,imageUrl:'',lhdnTaxExemptionReason:'',lhdnProductTariffCode:'',lhdnCountryOfOriginCode:''});
  if(!checked.success)return {line:row.line,error:'PRODUCT_VALIDATION_FAILED',...d};
  return {line:row.line,...d,data:checked.data};
 });
}
export async function previewProductsImport(req,res){if(!costAllowed(req))throw failure('COST_PERMISSION_REQUIRED',403);const {csv}=csvSchema.parse(req.body);const rows=await csvRows(req.auth.pool,csv);return res.json({rows:rows.map(({data,...r})=>r),valid:rows.every(r=>!r.error),count:rows.length});}
export async function importProducts(req,res){if(!costAllowed(req))throw failure('COST_PERMISSION_REQUIRED',403);const {csv}=csvSchema.parse(req.body);try{const count=await transaction(req.auth.pool,async conn=>{const rows=await csvRows(conn,csv);if(rows.some(x=>x.error))throw failure('CSV_VALIDATION_FAILED');for(const row of rows)await insertProduct(conn,row.data,req.auth.user.id,'PRODUCT_IMPORT');return rows.length;});return res.status(201).json({message:'PRODUCTS_IMPORTED',count});}catch(e){return handleDbError(res,e);}}


// Images are private, tenant-scoped and served only after authentication.
// Never use a filename or path supplied by a browser to access the filesystem.
const PRODUCT_IMAGE_MAX_BYTES=2*1024*1024;
const productImageBase=fileURLToPath(new URL('../data/product-images/',import.meta.url));
const imageFileName=/^tpos-image-([a-f0-9]{32})\.(png|jpg|webp)$/;
const detectImage=bytes=>{
 if(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {ext:'png',mime:'image/png'};
 if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {ext:'jpg',mime:'image/jpeg'};
 if(bytes.length>=12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return {ext:'webp',mime:'image/webp'};
 return null;
};
const imageDirectory=tenantId=>path.join(productImageBase,String(tenantId));
const imageName=value=>{const name=String(value||'').replace(/^tpos-image:/,'');return imageFileName.test(name)?name:null;};
export async function uploadProductImage(req,res){
 const productId=id.parse(req.params.id);
 if(!costAllowed(req))throw failure('COST_PERMISSION_REQUIRED',403);
 const {base64,mimeType}=z.object({base64:z.string().min(12).max(2800000),mimeType:z.enum(['image/png','image/jpeg','image/webp'])}).strict().parse(req.body);
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))throw failure('IMAGE_INVALID_BASE64');
 const image=Buffer.from(base64,'base64');
 if(!image.length||image.length>PRODUCT_IMAGE_MAX_BYTES)throw failure('IMAGE_TOO_LARGE');
 const detected=detectImage(image);
 if(!detected||detected.mime!==mimeType)throw failure('IMAGE_INVALID_TYPE');
 const dir=imageDirectory(req.auth.tenantId);
 await mkdir(dir,{recursive:true,mode:0o700});
 const filename=`tpos-image-${randomBytes(16).toString('hex')}.${detected.ext}`;
 const full=path.join(dir,filename);
 await writeFile(full,image,{flag:'wx',mode:0o600});
 let previous=null;
 try{
  await transaction(req.auth.pool,async conn=>{
   const current=await getProduct(conn,productId);
   if(!current)throw failure('PRODUCT_NOT_FOUND',404);
   previous=imageName(current.product_image_url);
   await conn.execute('UPDATE products SET product_image_url=? WHERE id=? AND is_deleted=0',[`tpos-image:${filename}`,productId]);
   await audit(conn,req.auth.user.id,productId,'PRODUCT_UPDATE',{image:current.product_image_url?'PRESENT':null},{image:'UPLOADED'});
  });
 }catch(e){await unlink(full).catch(()=>{});throw e;}
 if(previous&&previous!==filename)await unlink(path.join(dir,previous)).catch(()=>{});
 return res.status(201).json({message:'PRODUCT_IMAGE_SAVED',imageUrl:`/api/v2/products/${productId}/image`});
}
export async function readProductImage(req,res){
 const productId=id.parse(req.params.id);
 const [[row]]=await req.auth.pool.execute('SELECT product_image_url FROM products WHERE id=? AND is_deleted=0',[productId]);
 const filename=imageName(row?.product_image_url);
 if(!filename)throw failure('PRODUCT_IMAGE_NOT_FOUND',404);
 const ext=filename.slice(filename.lastIndexOf('.')+1);
 const mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp'}[ext];
 let bytes;
 try{bytes=await readFile(path.join(imageDirectory(req.auth.tenantId),filename));}
 catch(e){if(e.code==='ENOENT')throw failure('PRODUCT_IMAGE_NOT_FOUND',404);throw e;}
 res.set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').type(mime);
 return res.send(bytes);
}
