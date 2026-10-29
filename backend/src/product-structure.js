import { z } from 'zod';

const bad=(code,status=400)=>Object.assign(new Error(code),{status});
const positiveDecimal=(places,max)=>z.union([z.string().trim(),z.number().finite()])
 .refine(v=>new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(String(v)) && Number(v)>0,{message:`Quantity must be positive, max ${places} decimals`})
 .transform(Number).pipe(z.number().finite().positive().max(max));
const money=z.union([z.string().trim(),z.number().finite()]).refine(v=>/^\d+(?:\.\d{1,4})?$/.test(String(v)),{message:'Invalid selling price'}).transform(Number).pipe(z.number().finite().min(0).max(9999999999));
export const packagingSchema=z.object({unitCode:z.enum(['PACK','BOX','CARTON']),unitsPerBase:z.coerce.number().int().min(2).max(9999999999),barcode:z.string().trim().max(100).default(''),sellingPrice:money}).strict();
export const componentSchema=z.object({productId:z.coerce.number().int().positive(),quantity:positiveDecimal(6,9999999999)}).strict();
export const structureShape={
 productStructure:z.enum(['SINGLE','SET','BUNDLE']).default('SINGLE'),
 baseUnitCode:z.enum(['PCS','EA','KG','G']).default('PCS'),
 packagingUnits:z.array(packagingSchema).max(3).default([]),
 components:z.array(componentSchema).max(100).default([])
};
export function validateStructure(p,ctx){
 const distinct=(xs,extract,path)=>{const values=new Set();for(const [i,x] of xs.entries()){const v=String(extract(x)).toLowerCase();if(values.has(v))ctx.addIssue({code:'custom',path:[path,i],message:`Duplicate ${path}`});values.add(v);}};
 distinct(p.packagingUnits,x=>x.unitCode,'packagingUnits');
 distinct(p.components,x=>x.productId,'components');
 const barcodes=p.packagingUnits.map(x=>x.barcode.toLowerCase()).filter(Boolean);
 if(p.barcode&&barcodes.includes(p.barcode.toLowerCase()))ctx.addIssue({code:'custom',path:['packagingUnits'],message:'Duplicate base and packaging barcode'});
 if(new Set(barcodes).size!==barcodes.length)ctx.addIssue({code:'custom',path:['packagingUnits'],message:'Duplicate package barcode'});
 if(p.productStructure!=='SINGLE'){
  if(p.productType!=='GOODS'||p.trackStock||p.isWeighable)ctx.addIssue({code:'custom',path:['productStructure'],message:'Set/Bundle cannot be directly stock-tracked or weighed'});
  if(p.baseUnitCode!=='EA'&&p.baseUnitCode!=='PCS')ctx.addIssue({code:'custom',path:['baseUnitCode'],message:'Set/Bundle must use an each/piece base unit'});
  if(p.packagingUnits.length)ctx.addIssue({code:'custom',path:['packagingUnits'],message:'Packaging is for Single Goods only'});
  if(!p.components.length)ctx.addIssue({code:'custom',path:['components'],message:'Set/Bundle requires components'});
 }else if(p.components.length)ctx.addIssue({code:'custom',path:['components'],message:'Single products cannot contain components'});
 if(p.packagingUnits.length&&(p.productStructure!=='SINGLE'||p.productType!=='GOODS'||p.isWeighable||!['PCS','EA'].includes(p.baseUnitCode)))ctx.addIssue({code:'custom',path:['packagingUnits'],message:'Packaging requires a non-weighable Single Good with PCS/EA base unit'});
 if(p.isWeighable&&p.baseUnitCode!==p.weighingUnit)ctx.addIssue({code:'custom',path:['baseUnitCode'],message:'Base unit must match scale unit'});
 if(!p.isWeighable&&['KG','G'].includes(p.baseUnitCode))ctx.addIssue({code:'custom',path:['baseUnitCode'],message:'KG/G base unit requires weighable product'});
 if(p.productType==='SERVICE'&&p.packagingUnits.length)ctx.addIssue({code:'custom',path:['packagingUnits'],message:'Services cannot be packaged'});
}
export async function syncProductStructure(conn,productId,p){
 if(p.productStructure!=='SINGLE'){
  const ids=p.components.map(x=>x.productId);
  if(ids.includes(Number(productId)))throw bad('SELF_COMPONENT_NOT_ALLOWED');
  const [children]=await conn.query(`SELECT id,product_structure,status,is_deleted FROM products WHERE id IN (${ids.map(()=>'?').join(',')}) FOR SHARE`,ids);
  if(children.length!==ids.length||children.some(x=>x.product_structure!=='SINGLE'||x.status!=='ACTIVE'||x.is_deleted))throw bad('COMPONENT_NOT_ACTIVE_SINGLE');
 }
 // Reserve all active barcodes in one unique registry in the same transaction.
 // A collision in another product fails with ER_DUP_ENTRY and the entire edit rolls back.
 await conn.execute('DELETE FROM product_barcodes WHERE product_id=?',[productId]);
 await conn.execute('UPDATE product_packaging_units SET is_active=0 WHERE product_id=?',[productId]);
 for(const unit of p.packagingUnits){
  await conn.execute(`INSERT INTO product_packaging_units(product_id,unit_code,units_per_base,barcode,selling_price,is_active) VALUES(?,?,?,?,?,1)
   ON DUPLICATE KEY UPDATE units_per_base=VALUES(units_per_base),barcode=VALUES(barcode),selling_price=VALUES(selling_price),is_active=1`,
   [productId,unit.unitCode,unit.unitsPerBase,unit.barcode||null,unit.sellingPrice]);
 }
 if(p.barcode)await conn.execute("INSERT INTO product_barcodes(barcode,product_id,package_unit_id,source_type) VALUES(?,?,NULL,'BASE')",[p.barcode,productId]);
 for(const unit of p.packagingUnits){
  if(!unit.barcode)continue;
  const [[row]]=await conn.execute('SELECT id FROM product_packaging_units WHERE product_id=? AND unit_code=? AND is_active=1',[productId,unit.unitCode]);
  await conn.execute("INSERT INTO product_barcodes(barcode,product_id,package_unit_id,source_type) VALUES(?,?,?,'PACKAGING')",[unit.barcode,productId,row.id]);
 }
 await conn.execute('UPDATE product_components SET is_active=0 WHERE parent_product_id=?',[productId]);
 for(const item of p.components){
  await conn.execute(`INSERT INTO product_components(parent_product_id,component_product_id,quantity_per_parent,is_active) VALUES(?,?,?,1)
   ON DUPLICATE KEY UPDATE quantity_per_parent=VALUES(quantity_per_parent),is_active=1`,
   [productId,item.productId,item.quantity]);
 }
}
export async function getStructure(pool,productId){
 const [packages,components]=await Promise.all([
  pool.execute('SELECT id,unit_code,units_per_base,barcode,selling_price FROM product_packaging_units WHERE product_id=? AND is_active=1 ORDER BY FIELD(unit_code,\'PACK\',\'BOX\',\'CARTON\')',[productId]),
  pool.execute('SELECT pc.component_product_id,p.sku,p.product_name,pc.quantity_per_parent,p.base_unit_code FROM product_components pc JOIN products p ON p.id=pc.component_product_id WHERE pc.parent_product_id=? AND pc.is_active=1 ORDER BY p.product_name',[productId])
 ]);
 return {packagingUnits:packages[0].map(x=>({id:String(x.id),unitCode:x.unit_code,unitsPerBase:String(x.units_per_base),barcode:x.barcode||'',sellingPrice:String(x.selling_price)})),components:components[0].map(x=>({productId:String(x.component_product_id),sku:x.sku,productName:x.product_name,quantity:String(x.quantity_per_parent),baseUnitCode:x.base_unit_code}))};
}
