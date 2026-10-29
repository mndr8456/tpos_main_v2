// Product import template for TPOS V2 Clean Rebuild. No stock quantities in Product imports.
export const PRODUCT_CSV_HEADERS=Object.freeze([
 'sku','barcode','product_name','description','product_type','category','supplier','cost_price','selling_price','min_stock_qty','track_stock','is_weighable','weighing_unit','requires_preparation','preparation_station','lhdn_classification_code','lhdn_unit_code','lhdn_tax_type_code','lhdn_tax_rate','is_tax_inclusive','status','product_structure','base_unit','packaging_units','component_skus','jkdm_tax_type','jkdm_tax_rate','jkdm_tax_inclusive'
]);
export const PRODUCT_CSV_ROW_LIMIT=5000;
export const PRODUCT_CSV_BYTE_LIMIT=8*1024*1024;
const LEGACY_HEADERS=PRODUCT_CSV_HEADERS.slice(0,21);
const R2_HEADERS=PRODUCT_CSV_HEADERS.slice(0,25);
const fail=code=>Object.assign(new Error(code),{status:400});
export const productCsvTemplate=()=> '\uFEFF'+PRODUCT_CSV_HEADERS.join(',')+'\r\n'+['','9550000001234','Sample Product','Sample description','GOODS','Beverages','','3.50','5.00','5.00','YES','NO','KG','NO','','022','EA','06','0','NO','ACTIVE','SINGLE','PCS','','','NONE','0','NO'].join(',')+'\r\n';
export function parseProductCsv(raw){
 if(typeof raw!=='string'||Buffer.byteLength(raw,'utf8')>PRODUCT_CSV_BYTE_LIMIT)throw fail('CSV_TOO_LARGE');
 const lines=[];let field='',line=[],quoted=false,closed=false;const text=raw.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++;}else if(c==='"'){quoted=false;closed=true;}else field+=c;}
  else if(c==='"'&&!field&&!closed)quoted=true;
  else if(c===','||c==='\r'||c==='\n'){
   line.push(field);field='';closed=false;
   if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(line.some(x=>x.trim()))lines.push(line);line=[];}
  }else{if(c==='"'||closed)throw fail('CSV_MALFORMED');field+=c;}
 }
 if(quoted)throw fail('CSV_MALFORMED');
 if(line.length||field.length){line.push(field);if(line.some(x=>x.trim()))lines.push(line);}
 if(lines.length<2)throw fail('CSV_EMPTY');
 const header=lines.shift().map(x=>x.trim().toLowerCase());
 const acceptedHeaders=[PRODUCT_CSV_HEADERS,R2_HEADERS,LEGACY_HEADERS].some(headers=>header.length===headers.length&&header.every((x,i)=>x===headers[i]));
 if(!acceptedHeaders)throw fail('CSV_INVALID_HEADERS');
 if(lines.length>PRODUCT_CSV_ROW_LIMIT)throw fail('CSV_ROW_LIMIT');
 const skuSet=new Set(),barcodeSet=new Set();
 return lines.map((cells,index)=>{
  const line=index+2;
  if(cells.length!==header.length)return {line,error:'CSV_COLUMN_COUNT'};
  const v=Object.fromEntries(header.map((h,i)=>[h,cells[i].trim()]));
  if(!v.product_name||!v.category)return {line,error:'PRODUCT_REQUIRED_FIELDS'};
  for(const key of ['sku','barcode']){
   if(!v[key])continue;
   const group=key==='sku'?skuSet:barcodeSet;
   const value=v[key].toLocaleLowerCase('en');
   if(group.has(value))return {line,error:key==='sku'?'DUPLICATE_SKU_IN_FILE':'DUPLICATE_BARCODE_IN_FILE'};
   group.add(value);
  }
  const unitText=v.packaging_units||'',componentText=v.component_skus||'';
  const parseDetails=(text,fieldCount,kind)=>{if(!text)return [];return text.split('|').map(item=>{const values=item.trim().split(':').map(x=>x.trim());if(values.length!==fieldCount||values.some((x,i)=>!x&&!(kind==='PACKAGING'&&i===2)))throw fail(`CSV_${kind}_FORMAT`);return values;});};
  let packaging,components;
  try{packaging=parseDetails(unitText,4,'PACKAGING').map(([unitCode,unitsPerBase,barcode,sellingPrice])=>({unitCode:unitCode.toUpperCase(),unitsPerBase,barcode,sellingPrice}));components=parseDetails(componentText,2,'COMPONENT').map(([sku,quantity])=>({sku,quantity}));}
  catch(e){return {line,error:e.message};}
  for(const pack of packaging){if(pack.barcode){const key=pack.barcode.toLowerCase();if(barcodeSet.has(key))return {line,error:'DUPLICATE_BARCODE_IN_FILE'};barcodeSet.add(key);}}
  return {line,data:{sku:v.sku,barcode:v.barcode,productName:v.product_name,description:v.description,
   productType:v.product_type.toUpperCase()||'GOODS',productStructure:(v.product_structure||'SINGLE').toUpperCase(),baseUnitCode:(v.base_unit||(v.is_weighable==='YES'?v.weighing_unit:'PCS')||'PCS').toUpperCase(),packagingUnits:packaging,componentSkus:components,categoryName:v.category,supplierName:v.supplier,
   costPrice:v.cost_price,sellingPrice:v.selling_price,minStockQty:v.min_stock_qty,
   trackStock:csvBoolean(v.track_stock,true),isWeighable:csvBoolean(v.is_weighable,false),
   weighingUnit:v.weighing_unit.toUpperCase()||'KG',requiresPreparation:csvBoolean(v.requires_preparation,false),
   stationCode:v.preparation_station.toUpperCase(),lhdnClassificationCode:v.lhdn_classification_code||'022',
   lhdnUnitCode:v.lhdn_unit_code||'EA',lhdnTaxTypeCode:v.lhdn_tax_type_code||'06',
   lhdnTaxRate:v.lhdn_tax_rate,isTaxInclusive:csvBoolean(v.is_tax_inclusive,false),status:v.status.toUpperCase()||'ACTIVE',jkdmTaxType:(v.jkdm_tax_type||'NONE').toUpperCase(),jkdmTaxRate:v.jkdm_tax_rate||'0',jkdmTaxInclusive:csvBoolean(v.jkdm_tax_inclusive,false)}};
 });
}
function csvBoolean(value,defaultValue){if(!value)return defaultValue;const v=value.toUpperCase();if(['YES','TRUE','1'].includes(v))return true;if(['NO','FALSE','0'].includes(v))return false;return 'INVALID';}
