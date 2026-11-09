import {refreshPage} from './refresh-page.js';
import { useCallback,useEffect,useMemo,useState } from 'react';
import { Package,CheckCircle2,Ban,Barcode,QrCode,Search,RefreshCw,Plus,Pencil,Trash2,Download,Upload,Printer,History,X,Save,Check as CheckIcon,Eye,FileDown,Tags,Scale,Image as ImageIcon,ChevronLeft,ChevronRight } from 'lucide-react';
import { request,apiOrigin } from './api.js';
import {stockForProduct} from './product-inventory-sync.js';
import ProductCodeLabels from './ProductCodeLabels.jsx';
import {MYINVOIS_COUNTRIES} from './einvoice-country-codes-r12.js';
const yes=v=>v===true||v===1||v==='1';
const fixed2=value=>value===null||value===undefined||value===''?'0.00':Number(value).toFixed(2);
const IMAGE_MAX_BYTES=2*1024*1024;
const CSV_MAX_BYTES=8*1024*1024;
const LHDN_CLASS_CODES=Array.from({length:45},(_,i)=>String(i+1).padStart(3,'0'));
const LHDN_UNITS=['EA','SET','KGM','GRM','LTR','C62'];
const has=(profile,permission)=>profile.user.permissions.includes(permission);
const blank={sku:'',barcode:'',productName:'',description:'',imageUrl:'',productType:'GOODS',productStructure:'SINGLE',baseUnitCode:'PCS',packagingUnits:[],components:[],categoryId:'',supplierId:'',costPrice:'0.00',sellingPrice:'0.00',minStockQty:'0.00',trackStock:true,isWeighable:false,weighingUnit:'KG',requiresPreparation:false,stationId:'',lhdnClassificationCode:'022',lhdnUnitCode:'EA',lhdnTaxTypeCode:'06',lhdnTaxRate:'0',lhdnTaxExemptionReason:'',lhdnProductTariffCode:'',lhdnCountryOfOriginCode:'',isTaxInclusive:false,jkdmTaxType:'NONE',jkdmTaxRate:'0.00',jkdmTaxInclusive:false,isKpdnControlled:false,status:'ACTIVE'};
const dateString=v=>v?String(v).replace('T',' ').slice(0,19):'—';
function IconAction({icon:Icon,label,onClick,disabled=false,primary=false,danger=false,type='button'}){return <button type={type} className={`${primary?'primary':'outline'} action-icon ${danger?'product-danger':''}`} title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={18}/></button>;}
function Field({label,value,onChange,type='text',required=false,disabled=false,placeholder='',min,max,step,list}){return <label className="field"><span>{label}</span><input type={type} value={value??''} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled} placeholder={placeholder} min={min} max={max} step={step} list={list}/></label>;}
function Select({label,value,onChange,children,required=false,disabled=false}){return <label className="field"><span>{label}</span><select value={value??''} onChange={e=>onChange(e.target.value)} required={required} disabled={disabled}>{children}</select></label>;}
function Check({label,checked,onChange}){return <label className="product-check"><input type="checkbox" checked={Boolean(checked)} onChange={e=>onChange(e.target.checked)}/><span>{label}</span></label>;}
const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csvEsc=v=>{const t=String(v??'');const safe=/^[=+@-]/.test(t)?`'${t}`:t;return `"${safe.replaceAll('"','""')}"`;};
function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function toCsv(items,showCost){
 const fields=['sku','barcode','product_name','description','product_type','category','supplier','cost_price','selling_price','min_stock_qty','track_stock','is_weighable','weighing_unit','requires_preparation','preparation_station','lhdn_classification_code','lhdn_unit_code','lhdn_tax_type_code','lhdn_tax_rate','is_tax_inclusive','status','product_structure','base_unit','packaging_units','component_skus','jkdm_tax_type','jkdm_tax_rate','jkdm_tax_inclusive','is_kpdn_controlled','lhdn_country_of_origin_code'];
 const yn=value=>yes(value)?'YES':'NO';
 const value=(p,key)=>({sku:p.sku,barcode:p.barcode,product_name:p.product_name,description:p.product_description,product_type:p.product_type,category:p.category_name,supplier:p.supplier_name,cost_price:showCost?p.cost_price:'',selling_price:p.selling_price,min_stock_qty:p.min_stock_qty,track_stock:yn(p.track_stock),is_weighable:yn(p.is_weighable),weighing_unit:p.weighing_unit,requires_preparation:yn(p.requires_preparation),preparation_station:p.station_code,lhdn_classification_code:p.lhdn_classification_code,lhdn_unit_code:p.lhdn_unit_code,lhdn_tax_type_code:p.lhdn_tax_type_code,lhdn_tax_rate:p.lhdn_tax_rate,is_tax_inclusive:yn(p.is_tax_inclusive),status:p.status,product_structure:p.product_structure,base_unit:p.base_unit_code,packaging_units:(p.packaging_units||[]).map(u=>[u.unitCode,u.unitsPerBase,u.barcode||'',u.sellingPrice].join(':')).join('|'),component_skus:(p.components||[]).map(c=>`${c.sku}:${c.quantity}`).join('|'),jkdm_tax_type:p.jkdm_tax_type||'NONE',jkdm_tax_rate:p.jkdm_tax_rate||0,jkdm_tax_inclusive:yn(p.jkdm_tax_inclusive),is_kpdn_controlled:yn(p.is_kpdn_controlled),lhdn_country_of_origin_code:p.lhdn_country_of_origin_code||''})[key]??'';
 return '\uFEFF'+[fields,...items.map(p=>fields.map(f=>value(p,f)))].map(row=>row.map(csvEsc).join(',')).join('\r\n');
}
function printProducts(items,businessName,win,showCost){if(!win)throw new Error('POPUP_BLOCKED');const rows=items.map((p,i)=>`<tr><td>${i+1}</td><td>${html(p.sku)}</td><td>${html(p.barcode||'—')}</td><td>${html(p.product_name)}</td><td>${html(p.product_structure||'SINGLE')}</td><td>${html(p.category_name)}</td><td>${html(p.supplier_name||'—')}</td>${showCost?`<td>${html(fixed2(p.cost_price))}</td>`:''}<td>${html(fixed2(p.selling_price))}</td><td>${html(p.status)}</td></tr>`).join('');win.document.open();win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Products Report</title><style>body{font:12px Arial,sans-serif;padding:26px;color:#142742}h1{font-size:24px;margin-bottom:8px}.meta{color:#465d78;margin-bottom:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d4dce8;text-align:left;padding:8px}th{background:#eef4fa}@media print{@page{size:A4 landscape;margin:14mm}}</style></head><body><h1>Products Report</h1><div class="meta"><b>${html(businessName||'TPOS V2')}</b><p>${items.length} records · ${new Date().toLocaleString('en-MY')}</p></div><table><thead><tr>${['No','SKU','Barcode','Product','Structure','Category','Supplier',...(showCost?['Cost(RM)']:[]),'Sell(RM)','Status'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows||'<tr><td colspan="9">No products</td></tr>'}</tbody></table></body></html>`);win.document.close();win.focus();win.print();}
function ProductDialog({original,meta,busy,onClose,onSave,showCost,notify,canEditProduct,canManageBranchPrices,stockSummary,stockBranchName}){
 const [form,setForm]=useState(original?{...blank,sku:original.sku||'',barcode:original.barcode||'',productName:original.product_name,description:original.product_description||'',imageUrl:'',productType:original.product_type,productStructure:original.product_structure||'SINGLE',baseUnitCode:original.base_unit_code||'PCS',packagingUnits:(original.packaging_units||[]).map(u=>({...u,unitsPerBase:fixed2(u.unitsPerBase),sellingPrice:fixed2(u.sellingPrice)})),components:(original.components||[]).map(u=>({...u,quantity:fixed2(u.quantity)})),categoryId:String(original.category_id),supplierId:original.supplier_id||'',costPrice:fixed2(original.cost_price??0),sellingPrice:fixed2(original.selling_price),minStockQty:fixed2(original.min_stock_qty),trackStock:yes(original.track_stock),isWeighable:yes(original.is_weighable),weighingUnit:original.weighing_unit,requiresPreparation:yes(original.requires_preparation),stationId:original.preparation_station_id||'',lhdnClassificationCode:original.lhdn_classification_code,lhdnUnitCode:original.lhdn_unit_code,lhdnTaxTypeCode:original.lhdn_tax_type_code,lhdnTaxRate:fixed2(original.lhdn_tax_rate),lhdnTaxExemptionReason:original.lhdn_tax_exemption_reason||'',lhdnProductTariffCode:original.lhdn_product_tariff_code||'',lhdnCountryOfOriginCode:original.lhdn_country_of_origin_code||'',isTaxInclusive:yes(original.is_tax_inclusive),jkdmTaxType:original.jkdm_tax_type||'NONE',jkdmTaxRate:fixed2(original.jkdm_tax_rate||0),jkdmTaxInclusive:false,isKpdnControlled:yes(original.is_kpdn_controlled),status:original.status}:{...blank,categoryId:meta.categories[0]?.id||''});
 const [imageFile,setImageFile]=useState(null),[imagePreview,setImagePreview]=useState('');
 useEffect(()=>{
  let revoke=null,active=true;
  if(imageFile){revoke=URL.createObjectURL(imageFile);setImagePreview(revoke);}
  else if(original?.product_image_url?.startsWith('tpos-image:')){
   const controller=new AbortController();
   const endpoint=(apiOrigin)+`/api/v2/products/${original.id}/image`;
   fetch(endpoint,{credentials:'include',signal:controller.signal}).then(r=>{if(!r.ok)throw new Error('IMAGE_UNAVAILABLE');return r.blob();}).then(b=>{if(active){revoke=URL.createObjectURL(b);setImagePreview(revoke);}}).catch(()=>{if(active)setImagePreview('');});
   return ()=>{active=false;controller.abort();if(revoke)URL.revokeObjectURL(revoke);};
  }else setImagePreview(original?.product_image_url?.startsWith('https://')?original.product_image_url:'');
  return ()=>{active=false;if(revoke)URL.revokeObjectURL(revoke);};
 },[imageFile,original]);
 const chooseImage=e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)){notify('IMAGE_INVALID_TYPE (PNG, JPG or WebP only)',true);e.target.value='';return;}
  if(file.size>IMAGE_MAX_BYTES){notify('IMAGE_TOO_LARGE (maximum 2 MiB)',true);e.target.value='';return;}
  setImageFile(file);
 };
 const set=(key,value)=>setForm(p=>({...p,[key]:value}));
 const categoryChanged=value=>setForm(p=>({...p,categoryId:value,stationId:p.requiresPreparation?(meta.categories.find(x=>x.id===value)?.default_preparation_station_id||''):''}));
 const checked=key=>v=>set(key,v);
 const updatePackage=(index,key,value)=>setForm(p=>({...p,packagingUnits:p.packagingUnits.map((u,i)=>i===index?{...u,[key]:value}:u)}));
 const updateComponent=(index,key,value)=>setForm(p=>({...p,components:p.components.map((u,i)=>i===index?{...u,[key]:value}:u)}));
 const setStructure=value=>setForm(p=>({...p,productStructure:value,components:value==='SINGLE'?[]:p.components,packagingUnits:value==='SINGLE'?p.packagingUnits:[],trackStock:value==='SINGLE'?p.trackStock:false,isWeighable:false,baseUnitCode:value==='SINGLE'?p.baseUnitCode:'EA'}));

 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="dialog product-dialog" onSubmit={e=>{e.preventDefault();if(!canEditProduct)return;onSave({...form,jkdmTaxInclusive:false,supplierId:form.supplierId||'',stationId:form.requiresPreparation?form.stationId:'',trackStock:form.productType==='SERVICE'||form.productStructure!=='SINGLE'?false:form.trackStock,isWeighable:form.productType==='SERVICE'||form.productStructure!=='SINGLE'?false:form.isWeighable,packagingUnits:form.productStructure==='SINGLE'?form.packagingUnits:[],components:form.productStructure==='SINGLE'?[]:form.components.map(x=>({productId:x.productId,quantity:x.quantity}))},imageFile);}}><div className="dialog-head"><div><h2>{original?'Edit Product':'Add Product'}</h2><p className="muted">Product master, prices, compliance and preparation.</p></div></div>
 <fieldset className="product-edit-fields" disabled={!canEditProduct}>
 <h3>Basic Information</h3><div className="form-two"><Field label="SKU (leave blank to auto-generate)" value={form.sku} onChange={v=>set('sku',v)}/><Field label="Barcode" value={form.barcode} onChange={v=>set('barcode',v)}/><Field label="Product Name" required value={form.productName} onChange={v=>set('productName',v)}/><Select label="Product Type" value={form.productType} onChange={v=>setForm(p=>({...p,productType:v,productStructure:v==='SERVICE'?'SINGLE':p.productStructure,baseUnitCode:v==='SERVICE'?'PCS':p.baseUnitCode,packagingUnits:v==='SERVICE'?[]:p.packagingUnits,components:v==='SERVICE'?[]:p.components,trackStock:v==='SERVICE'?false:p.trackStock,isWeighable:v==='SERVICE'?false:p.isWeighable,isKpdnControlled:v==='SERVICE'?false:p.isKpdnControlled}))}><option value="GOODS">Goods</option><option value="SERVICE">Service</option></Select><Select label="Category" required value={form.categoryId} onChange={categoryChanged}><option value="">Select category</option>{meta.categories.map(x=><option key={x.id} value={x.id}>{x.category_name}</option>)}</Select><Select label="Supplier (optional)" value={form.supplierId} onChange={v=>set('supplierId',v)}><option value="">No supplier</option>{meta.suppliers.map(x=><option key={x.id} value={x.id}>{x.supplier_name}</option>)}</Select></div>
 <h3>Product Structure & Units</h3>
 <div className="form-two"><Select label="Product Structure" value={form.productStructure} onChange={setStructure}>
 <option value="SINGLE">Single Product</option>{form.productType==='GOODS'&&<><option value="SET">Set (Fixed Components)</option><option value="BUNDLE">Bundle (Fixed Components)</option></>}
 </Select><Select label="Base Unit" value={form.baseUnitCode} onChange={v=>set('baseUnitCode',v)}>
 {(form.isWeighable?['KG','G']:['PCS','EA']).map(u=><option key={u} value={u}>{u}</option>)}
 </Select></div>
 {form.productStructure!=='SINGLE'&&<div className="product-structure-block"><div className="product-structure-title"><div><strong>{form.productStructure==='SET'?'Set Components':'Bundle Components'}</strong><p className="muted">Fixed components only. The Inventory/POS integration will determine stock consumption.</p></div><IconAction icon={Plus} label="Add Component" onClick={()=>setForm(p=>({...p,components:[...p.components,{productId:'',quantity:'1.00'}]}))} disabled={form.components.length>=100}/></div>
 {form.components.map((item,i)=><div className="product-structure-row" key={i}><Select label="Component Product" required value={item.productId} onChange={v=>updateComponent(i,'productId',v)}><option value="">Select product</option>{meta.componentCandidates.filter(c=>String(c.id)!==String(original?.id)).map(c=><option value={c.id} key={c.id}>{c.sku} — {c.product_name} ({c.base_unit_code})</option>)}</Select><Field label="Quantity per Set/Bundle" type="number" min="0.01" step="0.01" required value={item.quantity} onChange={v=>updateComponent(i,'quantity',v)}/><IconAction icon={Trash2} label={`Remove Component ${i+1}`} danger onClick={()=>setForm(p=>({...p,components:p.components.filter((_,n)=>n!==i)}))}/></div>)}
 {!form.components.length&&<p className="muted">Add at least one existing Single Product as a component.</p>}</div>}
 {form.productStructure==='SINGLE'&&form.productType==='GOODS'&&!form.isWeighable&&['PCS','EA'].includes(form.baseUnitCode)&&<div className="product-structure-block"><div className="product-structure-title"><div><strong>Units & Packaging</strong><p className="muted">Each selling unit has its own conversion factor, barcode and price. Example: 1 CARTON = 24 PCS.</p></div><IconAction icon={Plus} label="Add Packaging Unit" disabled={form.packagingUnits.length>=3} onClick={()=>setForm(p=>({...p,packagingUnits:[...p.packagingUnits,{unitCode:['PACK','BOX','CARTON'].find(u=>!p.packagingUnits.some(x=>x.unitCode===u))||'PACK',unitsPerBase:'2.00',barcode:'',sellingPrice:p.sellingPrice}]}))}/></div>
 {form.packagingUnits.map((unit,i)=><div className="product-package-row" key={i}><Select label="Unit" value={unit.unitCode} onChange={v=>updatePackage(i,'unitCode',v)}>{['PACK','BOX','CARTON'].map(u=><option key={u} value={u}>{u}</option>)}</Select><Field label={`Base ${form.baseUnitCode} per Unit`} required type="number" min="2" step="1" value={unit.unitsPerBase} onChange={v=>updatePackage(i,'unitsPerBase',v)}/><Field label="Unit Barcode (optional)" value={unit.barcode} onChange={v=>updatePackage(i,'barcode',v)}/><Field label="Unit Selling Price (MYR)" type="number" min="0" step="0.01" required value={unit.sellingPrice} onChange={v=>updatePackage(i,'sellingPrice',v)}/><IconAction icon={Trash2} label={`Remove Packaging Unit ${i+1}`} danger onClick={()=>setForm(p=>({...p,packagingUnits:p.packagingUnits.filter((_,n)=>n!==i)}))}/></div>)}
 </div>}
 <label className="field"><span>Description</span><textarea rows={2} value={form.description} onChange={e=>set('description',e.target.value)}/></label>
 <div className="product-image-picker"><div className="product-image-controls"><strong>Product Image</strong><p className="muted">Choose File: PNG, JPG or WebP (max 2 MiB). Saved securely per tenant after product details.</p><label className="import-file product-image-choose" title="Choose Product Image"><ImageIcon size={18}/><span>{imageFile?.name||'Choose File'}</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} disabled={busy}/></label></div>{imagePreview&&<img className="product-image-preview" alt="Product image preview" src={imagePreview}/>}</div>
 <h3>Prices & Inventory Settings</h3>
 <div className="product-live-stock"><label className="field"><span>Live Stock — {original?stockBranchName:'After Creation'} (Read-Only)</span><input type="text" value={stockSummary.label} readOnly aria-label="Live Product Stock"/></label><p className="muted">{original?'Live quantity comes from Stock / Inventory for the selected branch. Use Opening Stock or Stock In to change it.':'After saving the new product, use Stock / Inventory to record branch Opening Stock.'} Minimum Stock is an alert threshold, not the physical quantity.</p></div>
 <div className="form-two">{showCost&&<Field label="Reference Purchase Cost (MYR)" type="number" min="0" step="0.01" required value={form.costPrice} onChange={v=>set('costPrice',v)}/>}<Field label="Default Selling Price (MYR)" type="number" min="0" step="0.01" required value={form.sellingPrice} onChange={v=>set('sellingPrice',v)}/><Field label="Minimum Stock Qty (Alert Threshold)" type="number" min="0" step="0.01" value={form.minStockQty} onChange={v=>set('minStockQty',v)}/><Select label="Status" value={form.status} onChange={v=>set('status',v)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></div>
 <div className="product-inventory-options"><div className="product-checks">{form.productStructure==='SINGLE'&&form.productType==='GOODS'&&<Check label="Track Stock" checked={form.trackStock} onChange={checked('trackStock')}/>}{form.productStructure==='SINGLE'&&form.productType==='GOODS'&&<Check label="Weighable / Scale Item" checked={form.isWeighable} onChange={v=>setForm(p=>({...p,isWeighable:v,packagingUnits:v?[]:p.packagingUnits,baseUnitCode:v?p.weighingUnit:'PCS',trackStock:v?true:p.trackStock,lhdnUnitCode:v?(p.weighingUnit==='G'?'GRM':'KGM'):p.lhdnUnitCode}))}/>}<Check label="Requires Preparation" checked={form.requiresPreparation} onChange={v=>setForm(p=>({...p,requiresPreparation:v,stationId:v?(meta.categories.find(c=>String(c.id)===String(p.categoryId))?.default_preparation_station_id||''):''}))}/></div>
 <div className="form-two product-inventory-fields">{form.isWeighable&&<Select label="Scale Unit" value={form.weighingUnit} onChange={v=>setForm(p=>({...p,weighingUnit:v,baseUnitCode:v,lhdnUnitCode:v==='G'?'GRM':'KGM'}))}><option value="KG">Kilogram (kg)</option><option value="G">Gram (g)</option></Select>}{form.requiresPreparation&&<Select label="Preparation Station" required value={form.stationId} onChange={v=>set('stationId',v)}><option value="">Choose station</option>{meta.stations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</Select>}</div></div>
 </fieldset>
 <fieldset className="product-edit-fields product-kpdn-section" disabled={!canEditProduct}><h3>KPDN — Controlled Goods</h3><p className="muted">Mark goods subject to KPDN supply or price controls. This is an internal product flag, not an automatic permit, price ceiling or regulatory approval.</p>{form.productType==='GOODS'?<Check label="KPDN Controlled Goods" checked={form.isKpdnControlled} onChange={checked('isKpdnControlled')}/>:<p className="muted">Only GOODS can be marked as controlled goods.</p>}</fieldset>
 {original&&canManageBranchPrices&&<BranchPricesEditor product={original} branches={meta.branches} notify={notify}/>}
 <fieldset className="product-edit-fields" disabled={!canEditProduct}>
 <h3>LHDN / MyInvois — e-Invoice Classification</h3><datalist id="product-lhdn-classification-options">{LHDN_CLASS_CODES.map(c=><option key={c} value={c}>{c==='022'?'Others':'MyInvois Classification'}</option>)}</datalist><datalist id="product-lhdn-unit-options">{LHDN_UNITS.map(c=><option key={c} value={c}/>)}</datalist><datalist id="product-lhdn-country-options">{MYINVOIS_COUNTRIES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</datalist>{form.lhdnTaxTypeCode!==({NONE:'06',SALES_TAX:'01',SERVICE_TAX:'02'}[form.jkdmTaxType]||'06')&&<p className="muted" role="status">Tax code review required: Product MyInvois Tax Type does not match current JKDM type. Verify before Owner confirmation; this notice does not change POS tax.</p>}<p className="muted">Product Master values are suggestions only, not Owner Verified Mapping. Check the official MyInvois codes and confirm separately in e-Invoice Settings. POS tax is controlled by JKDM SST below.</p><div className="form-two"><Field label="LHDN Classification Code" list="product-lhdn-classification-options" value={form.lhdnClassificationCode} onChange={v=>set('lhdnClassificationCode',v)} required/><Field label="LHDN Unit Code" list="product-lhdn-unit-options" value={form.lhdnUnitCode} onChange={v=>set('lhdnUnitCode',v)} required/><Select label="LHDN e-Invoice Tax Type Code" value={form.lhdnTaxTypeCode} onChange={v=>set('lhdnTaxTypeCode',v)} required><option value="01">01 — Sales Tax</option><option value="02">02 — Service Tax</option><option value="03">03 — Tourism Tax</option><option value="04">04 — High-Value Goods Tax</option><option value="05">05 — Sales Tax on Low-Value Goods</option><option value="06">06 — Not Applicable</option><option value="E">E — Tax Exemption</option></Select><Field label="LHDN e-Invoice Tax Rate (%)" type="number" min="0" max="100" step="0.001" value={form.lhdnTaxRate} onChange={v=>set('lhdnTaxRate',v)} required/><Field label="Tax Exemption Reason" value={form.lhdnTaxExemptionReason} onChange={v=>set('lhdnTaxExemptionReason',v)}/><Field label="Tariff Code" value={form.lhdnProductTariffCode} onChange={v=>set('lhdnProductTariffCode',v)}/><Field label="Country of Origin (ISO alpha-3, optional)" list="product-lhdn-country-options" value={form.lhdnCountryOfOriginCode} onChange={v=>set('lhdnCountryOfOriginCode',v)}/><div className="product-lhdn-tax-checkbox"><Check label="LHDN e-Invoice Price Includes Tax" checked={form.isTaxInclusive} onChange={checked('isTaxInclusive')}/></div></div>
 <h3>{form.jkdmTaxType==='SALES_TAX'?'SST — Sales Tax':form.jkdmTaxType==='SERVICE_TAX'?'SST — Service Tax':'SST — No SST'}</h3>
 <p className="muted">The SST rate and On/Off status come from your tenant's GST / SST Settings. Select the product's applicable SST type; no separate product tax rate is entered here.</p>
 <div className="product-sst-choices" role="group" aria-label="SST Type">
  <label className={`product-sst-choice ${form.jkdmTaxType==='SALES_TAX'?'selected':''}`}>
   <input type="checkbox" checked={form.jkdmTaxType==='SALES_TAX'} onChange={e=>setForm(p=>({...p,jkdmTaxType:e.target.checked?'SALES_TAX':'NONE',jkdmTaxRate:'0.00',jkdmTaxInclusive:false}))}/>
   <span><strong>Sales Tax</strong><small>Apply to goods classified for Sales Tax.</small></span>
  </label>
  <label className={`product-sst-choice ${form.jkdmTaxType==='SERVICE_TAX'?'selected':''}`}>
   <input type="checkbox" checked={form.jkdmTaxType==='SERVICE_TAX'} onChange={e=>setForm(p=>({...p,jkdmTaxType:e.target.checked?'SERVICE_TAX':'NONE',jkdmTaxRate:'0.00',jkdmTaxInclusive:false}))}/>
   <span><strong>Service Tax</strong><small>Apply to eligible taxable services, including qualifying F&amp;B services.</small></span>
  </label>
 </div>
 <p className="product-sst-policy-note">Select one applicable SST classification per product. Leave both unchecked for No SST. The tax rate is controlled in GST / SST Settings; Service Charge is separate.</p>


 </fieldset>
 <div className="dialog-actions"><IconAction icon={X} label="Cancel" onClick={onClose} disabled={busy}/>{canEditProduct&&<IconAction icon={Save} primary type="submit" label={original?'Save Product':'Create Product'} disabled={busy||!meta.categories.length}/>}</div></form></div>;
}
const productAuditActionBy=action=>({
 PRODUCT_CREATE:'Created by',
 PRODUCT_IMPORT:'Imported by',
 PRODUCT_UPDATE:'Updated by',
 PRODUCT_BRANCH_PRICE:'Price updated by',
 PRODUCT_ACTIVATE:'Activated by',
 PRODUCT_DEACTIVATE:'Deactivated by',
 PRODUCT_ARCHIVE:'Archived by'
})[action]||'Performed by';
function ProductViewDialog({product,onClose,showCost,stockSummary,stockBranchName}){
 const [imageSrc,setImageSrc]=useState('');
 useEffect(()=>{
  const source=String(product.product_image_url||'');
  if(source.startsWith('https://')){setImageSrc(source);return;}
  if(!source.startsWith('tpos-image:')){setImageSrc('');return;}
  let active=true;let objectUrl='';
  const controller=new AbortController();
  const endpoint=(apiOrigin)+`/api/v2/products/${product.id}/image`;
  fetch(endpoint,{credentials:'include',signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('IMAGE_UNAVAILABLE');return response.blob();}).then(blob=>{if(active){objectUrl=URL.createObjectURL(blob);setImageSrc(objectUrl);}}).catch(()=>{if(active)setImageSrc('');});
  return ()=>{active=false;controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[product.id,product.product_image_url]);
 const value=(v)=>v===null||v===undefined||v===''?'—':String(v);
 const productType=product.product_type||'GOODS';
 const structure=product.product_structure||'SINGLE';
 const packaging=product.packaging_units||[];
 const components=product.components||[];
 const isStockTracked=yes(product.track_stock);
 const requiresPreparation=yes(product.requires_preparation);
 const isWeighable=yes(product.is_weighable);
 function Detail({label,children}){return <div className="product-view-detail"><dt>{label}</dt><dd>{children}</dd></div>;}
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <article className="dialog product-view-dialog" role="dialog" aria-modal="true" aria-labelledby="product-view-title">
   <header className="product-view-top"><div><p className="product-view-eyebrow">PRODUCT MASTER / DETAILS</p><h2 id="product-view-title">View Product</h2></div><IconAction icon={X} label="Close View Product" onClick={onClose}/></header>
   <div className="product-view-content">
    <div className="product-view-hero">
     <div className="product-view-photo">{imageSrc?<img src={imageSrc} alt={product.product_name}/>:<Package size={36} strokeWidth={1.5} aria-hidden="true"/>}</div>
     <div className="product-view-identity"><div className="product-view-tags"><span className="product-view-sku">{value(product.sku)}</span><span className={`pill ${product.status==='ACTIVE'?'good':'off'}`}>{value(product.status)}</span></div><h3>{value(product.product_name)}</h3><p>{value(product.category_name)} <span aria-hidden="true">·</span> {productType} <span aria-hidden="true">·</span> {structure}</p><div className="product-view-barcode"><Barcode size={15} aria-hidden="true"/><span>{value(product.barcode)}</span></div></div>
    </div>
    <div className="product-view-highlights">
     <div className="product-view-highlight"><span>DEFAULT SELLING PRICE</span><strong>RM {fixed2(product.selling_price)}</strong></div>
     {showCost&&<div className="product-view-highlight"><span>REFERENCE COST</span><strong>RM {fixed2(product.cost_price)}</strong></div>}
     <div className="product-view-highlight"><span>MINIMUM STOCK ALERT</span><strong>{fixed2(product.min_stock_qty)} <small>{value(product.base_unit_code||'PCS')}</small></strong></div>
     <div className="product-view-highlight"><span>LIVE STOCK — {stockBranchName}</span><strong>{stockSummary.label}</strong></div>
    </div>
    <section className="product-view-section" aria-label="Product information">
     <h3>Product Information</h3>
     <dl className="product-view-details">
      <Detail label="SKU">{value(product.sku)}</Detail>
      <Detail label="Barcode">{value(product.barcode)}</Detail>
      <Detail label="Product Type">{productType}</Detail>
      <Detail label="Product Structure">{structure}</Detail>
      <Detail label="Base Unit">{value(product.base_unit_code||'PCS')}</Detail>
      <Detail label="Category">{value(product.category_name)}</Detail>
      <Detail label="Supplier">{value(product.supplier_name)}</Detail>
      <Detail label="KPDN Controlled Goods">{yes(product.is_kpdn_controlled)?'Yes':'No'}</Detail>
      <Detail label="Status"><span className={`pill ${product.status==='ACTIVE'?'good':'off'}`}>{value(product.status)}</span></Detail>
      {product.product_description&&<div className="product-view-detail product-view-detail-wide"><dt>Description</dt><dd>{product.product_description}</dd></div>}
     </dl>
    </section>
    <section className="product-view-section" aria-label="Inventory and preparation">
     <h3>Inventory &amp; Preparation</h3>
     <dl className="product-view-details">
      <Detail label="Track Stock">{isStockTracked?'Yes':'No'}</Detail>
      <Detail label={`Live Stock (${stockBranchName})`}>{stockSummary.label} — Read-Only</Detail>
      <Detail label="Weighable / Scale Item">{isWeighable?'Yes':'No'}</Detail>
      {isWeighable&&<Detail label="Scale Unit">{value(product.weighing_unit)}</Detail>}
      <Detail label="Requires Preparation">{requiresPreparation?'Yes':'No'}</Detail>
      {requiresPreparation&&<Detail label="Preparation Station">{value(product.station_name)}</Detail>}
     </dl>
    </section>
    {(packaging.length>0||components.length>0)&&<section className="product-view-section" aria-label="Product structure details"><h3>Units &amp; Components</h3>
     {packaging.length>0&&<div className="product-view-subsection"><h4>Packaging Units</h4><div className="product-view-table-wrap"><table className="product-view-table"><thead><tr><th>Unit</th><th>Units per Base</th><th>Barcode</th><th>Selling Price (RM)</th></tr></thead><tbody>{packaging.map((unit,i)=><tr key={`${unit.unitCode}-${i}`}><td>{value(unit.unitCode)}</td><td>{fixed2(unit.unitsPerBase)}</td><td>{value(unit.barcode)}</td><td>{fixed2(unit.sellingPrice)}</td></tr>)}</tbody></table></div></div>}
     {components.length>0&&<div className="product-view-subsection"><h4>Components</h4><div className="product-view-table-wrap"><table className="product-view-table"><thead><tr><th>SKU</th><th>Quantity</th></tr></thead><tbody>{components.map((component,i)=><tr key={`${component.sku}-${i}`}><td>{value(component.sku)}</td><td>{fixed2(component.quantity)}</td></tr>)}</tbody></table></div></div>}
    </section>}
    <section className="product-view-section" aria-label="Tax and e-Invoice classification"><h3>Tax &amp; e-Invoice</h3>
     <div className="product-view-tax-panels">
      <div className="product-view-tax-panel"><div className="product-view-tax-heading"><span>LHDN / MyInvois</span><strong>e-Invoice Classification</strong></div><dl className="product-view-tax-list">
       <Detail label="Classification Code">{value(product.lhdn_classification_code)}</Detail>
       <Detail label="Unit Code">{value(product.lhdn_unit_code)}</Detail>
       <Detail label="Tax Type Code">{value(product.lhdn_tax_type_code)}</Detail>
       <Detail label="Tax Rate (%)">{fixed2(product.lhdn_tax_rate)}</Detail>
       <Detail label="Exemption Reason">{value(product.lhdn_tax_exemption_reason)}</Detail>
       <Detail label="Tariff Code">{value(product.lhdn_product_tariff_code)}</Detail>
       <Detail label="Country of Origin">{value(product.lhdn_country_of_origin_code)}</Detail>
       <Detail label="Price Includes Tax">{yes(product.is_tax_inclusive)?'Yes':'No'}</Detail>
      </dl></div>
      <div className="product-view-tax-panel"><div className="product-view-tax-heading"><span>SST</span><strong>{product.jkdm_tax_type==='SALES_TAX'?'Sales Tax':product.jkdm_tax_type==='SERVICE_TAX'?'Service Tax':'No SST'}</strong></div><dl className="product-view-tax-list">
       <Detail label="SST Type">{product.jkdm_tax_type==='SALES_TAX'?'Sales Tax':product.jkdm_tax_type==='SERVICE_TAX'?'Service Tax':'No SST'}</Detail>
       <Detail label="Rate Source">{product.jkdm_tax_type==='NONE'?'Not applicable':'GST / SST Settings (tenant)'}</Detail>

      </dl></div>
     </div>
    </section>
   </div>
  </article>
 </div>;
}
function BranchPricesEditor({product,branches,notify}){
 const [branch,setBranch]=useState(String(branches[0]?.id||''));
 const [prices,setPrices]=useState({});
 const [value,setValue]=useState(fixed2(product.selling_price));
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 useEffect(()=>{
  let active=true;
  setLoading(true);
  request(`/products/${product.id}/branch-prices`)
   .then(result=>{
    if(!active)return;
    const overrides=Object.fromEntries((result.prices||[]).map(x=>[String(x.branch_id),fixed2(x.selling_price)]));
    setPrices(overrides);
    setValue(overrides[String(branches[0]?.id||'')]??fixed2(product.selling_price));
   })
   .catch(error=>{if(active)notify(error.message,true);})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[product.id,product.selling_price,branches,notify]);
 function changeBranch(next){setBranch(String(next));setValue(prices[String(next)]??fixed2(product.selling_price));}
 async function savePrice(){
  const amount=Number(value);
  if(!branch||!Number.isFinite(amount)||amount<0||!/^\d+(?:\.\d{1,2})?$/.test(String(value))){notify('Enter a valid branch selling price (0.00 or greater, maximum 2 decimal places).',true);return;}
  setSaving(true);
  try{
   await request(`/products/${product.id}/branch-prices/${branch}`,{method:'PUT',body:{sellingPrice:amount}});
   const normalized=fixed2(amount);
   setPrices(current=>({...current,[branch]:normalized}));
   setValue(normalized);
   notify('Branch selling price saved.');
  }catch(error){notify(error.message,true);}finally{setSaving(false);}
 }
 return <section className="product-branch-price-section" aria-label="Manage Branch Prices">
  <h3>Branch Selling Prices</h3>
  <p className="muted">Default selling price: RM {fixed2(product.selling_price)}. Each branch override is saved separately from Product Master changes.</p>
  {branches.length?<div className="product-branch-price-controls"><Select label="Branch" value={branch} onChange={changeBranch} required disabled={loading||saving}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</Select><Field label="Branch Selling Price (RM)" type="number" min="0" step="0.01" value={value} onChange={setValue} required disabled={loading||saving}/><IconAction icon={Save} label="Save Branch Selling Price" onClick={savePrice} disabled={loading||saving||!branch}/></div>:<p className="muted">No accessible branches are assigned to this account.</p>}
 </section>;
}
function ProductImport({notify,onClose,onImported}){const [csv,setCsv]=useState(''),[name,setName]=useState(''),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[page,setPage]=useState(0);
 async function choose(e){const f=e.target.files?.[0];if(!f)return;if(f.size>CSV_MAX_BYTES){notify('CSV_TOO_LARGE',true);return;}setCsv(await f.text());setName(f.name);setPreview(null);setPage(0);}
 async function previewFile(){setBusy(true);try{setPreview(await request('/products/import/preview',{method:'POST',body:{csv}}));}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function save(){setBusy(true);try{const r=await request('/products/import',{method:'POST',body:{csv}});notify(`${r.count} products imported.`);await onImported();onClose();}catch(e){notify(e.message,true);setPreview(null);}finally{setBusy(false);}}
 async function template(){try{const r=await fetch((apiOrigin)+'/api/v2/products/import/template',{credentials:'include'});if(!r.ok)throw new Error('TEMPLATE_UNAVAILABLE');download('products-import-template.csv',await r.text());}catch(e){notify(e.message,true);}}
 return <div className="overlay"><div className="dialog wide"><div className="dialog-head"><div><h2>Import Products</h2><p className="muted">Download template → Preview → Confirm. Up to 5,000 rows (8 MiB). Category names and optional suppliers must exist.</p></div><IconAction icon={X} label="Close" onClick={onClose} disabled={busy}/></div><div className="product-import-tools"><IconAction icon={FileDown} label="Download CSV Template" onClick={template}/><label className="import-file"><Upload size={19}/><span>{name||'Choose CSV File'}</span><input type="file" accept=".csv,text/csv" onChange={choose} disabled={busy}/></label><IconAction icon={Eye} label="Preview Import" onClick={previewFile} disabled={!csv||busy}/></div>{preview&&<><p className={preview.valid?'import-ok':'import-error'}>{preview.valid?`${preview.count} rows ready to import.`:'Review the errors before importing.'}</p><div className="table-scroll product-preview"><table><thead><tr><th>Line</th><th>SKU</th><th>Product</th><th>Category</th><th>Origin (ISO)</th><th>Price</th><th>Result</th></tr></thead><tbody>{preview.rows.slice(page*100,(page+1)*100).map(x=><tr key={x.line}><td>{x.line}</td><td>{x.sku||'Auto'}</td><td>{x.productName||'—'}</td><td>{x.categoryName||'—'}</td><td>{x.lhdnCountryOfOriginCode||'—'}</td><td>{x.sellingPrice?fixed2(x.sellingPrice):'—'}</td><td className={x.error?'import-error':'import-ok'}>{x.error||(x.review==='LHDN_TAX_TYPE_REVIEW'?'Review LHDN / JKDM Tax Type':x.review==='LHDN_DEFAULTS_SUGGESTED'?'Suggested LHDN defaults (not verified)':'VALID')}</td></tr>)}</tbody></table></div><div className="product-preview-pager"><span>Rows {page*100+1}–{Math.min((page+1)*100,preview.count)} of {preview.count} (page {page+1}/{Math.ceil(preview.count/100)})</span><IconAction icon={ChevronLeft} label="Previous Preview Page" onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}/><IconAction icon={ChevronRight} label="Next Preview Page" onClick={()=>setPage(p=>Math.min(Math.ceil(preview.count/100)-1,p+1))} disabled={(page+1)*100>=preview.count}/></div><div className="dialog-actions"><IconAction icon={X} label="Cancel" onClick={onClose}/><IconAction icon={CheckIcon} label="Confirm Import" primary onClick={save} disabled={!preview.valid||!preview.count||busy}/></div></>}</div></div>;
}
export default function Products({profile,notify}){
 const [items,setItems]=useState([]),[meta,setMeta]=useState({categories:[],suppliers:[],stations:[],branches:[],componentCandidates:[]}),[query,setQuery]=useState(''),[filter,setFilter]=useState('ALL'),[category,setCategory]=useState('ALL'),[supplier,setSupplier]=useState('ALL'),[edit,setEdit]=useState(undefined),[importing,setImporting]=useState(false),[logs,setLogs]=useState(null),[archiveTarget,setArchiveTarget]=useState(null),[viewing,setViewing]=useState(null),[codeLabels,setCodeLabels]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [paging,setPaging]=useState({page:0,key:''});
 const canViewInventory=has(profile,'inventory.view');
 const [stockBalances,setStockBalances]=useState([]),[stockBranches,setStockBranches]=useState([]),[stockBranchId,setStockBranchId]=useState(''),[stockReady,setStockReady]=useState(false);
 const allowed=permission=>has(profile,permission),showCost=allowed('products.cost.view');
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const inventory=canViewInventory?Promise.all([request('/inventory/balances'),request('/inventory/meta')]).then(([b,m])=>({ok:true,balances:b.balances||[],branches:m.branches||[]})).catch(()=>({ok:false,balances:[],branches:[]})):Promise.resolve({ok:false,balances:[],branches:[]});
   const [r,m,s]=await Promise.all([request('/products'),request('/products/meta'),inventory]);
   setItems(r.products);setMeta(m);setStockBalances(s.balances);setStockBranches(s.branches);setStockReady(s.ok);
   setStockBranchId(current=>s.branches.some(b=>String(b.id)===current)?current:String(s.branches.find(b=>String(b.name).toLowerCase()==='main branch'||String(b.code).toUpperCase()==='MAIN')?.id||s.branches[0]?.id||''));
   if(canViewInventory&&!s.ok)notify('Live Inventory Stock unavailable; Product Master is still accessible.',true);
  }catch(e){notify(e.message,true);}finally{setLoading(false);}
 },[notify,canViewInventory]);
 useEffect(()=>{load();},[load]);
 const stockBranchName=stockBranches.find(b=>String(b.id)===stockBranchId)?.name||'Selected Branch';
 const stockIndex=useMemo(()=>new Map(stockBalances.map(row=>[`${row.branch_id}:${row.product_id}`,row])),[stockBalances]);
 const stockFor=product=>stockForProduct(product,stockBranchId,stockIndex,stockReady&&canViewInventory);
 const filtered=useMemo(()=>items.filter(p=>(filter==='ALL'||p.status===filter)&&(category==='ALL'||String(p.category_id)===category)&&(supplier==='ALL'||String(p.supplier_id||'')===supplier)&&`${p.sku} ${p.barcode||''} ${p.product_name} ${p.category_name} ${p.supplier_name||''}`.toLocaleLowerCase('en').includes(query.toLocaleLowerCase('en'))),[items,query,filter,category,supplier]);
 const counts=useMemo(()=>({total:items.length,active:items.filter(x=>x.status==='ACTIVE').length,tracked:items.filter(x=>yes(x.track_stock)).length,weighable:items.filter(x=>yes(x.is_weighable)).length}),[items]);
 const pageKey=JSON.stringify([query,filter,category,supplier]);
 const lastPage=Math.max(0,Math.ceil(filtered.length/100)-1);
 const currentPage=Math.min(paging.key===pageKey?paging.page:0,lastPage);
 async function save(form,imageFile){
  setBusy(true);let saved=false;
  try{
   const isNew=edit==='new';
   const result=await request(isNew?'/products':`/products/${edit.id}`,{method:isNew?'POST':'PUT',body:form});
   saved=true;
   if(imageFile){
    const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('IMAGE_READ_FAILED'));reader.readAsDataURL(imageFile);});
    await request(`/products/${isNew?result.id:edit.id}/image`,{method:'POST',body:{base64,mimeType:imageFile.type}});
   }
   notify(isNew?'Product created.':'Product updated.');setEdit(undefined);await load();
  }catch(e){notify(saved?`PRODUCT_SAVED_BUT_IMAGE_UPLOAD_FAILED: ${e.message}. ${edit==='new'?'Reopen the saved product to retry the image.':'Retry saving the image.'}`:e.message,true);if(saved&&edit==='new'){setEdit(undefined);await load();}}
  finally{setBusy(false);}
 }
 async function toggle(p){setBusy(true);try{await request(`/products/${p.id}/status`,{method:'PATCH',body:{status:p.status==='ACTIVE'?'INACTIVE':'ACTIVE'}});notify('Product status updated.');await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function archive(){setBusy(true);try{await request(`/products/${archiveTarget.id}`,{method:'DELETE',body:{}});notify('Product archived.');setArchiveTarget(null);await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function audit(){try{const r=await request('/products/audit');setLogs(r.logs);}catch(e){notify(e.message,true);}}
 async function exportData(pdf=false){const win=pdf?window.open('','_blank','width=1150,height=820'):null;try{if(pdf&&!win)throw new Error('POPUP_BLOCKED');const r=await request('/products/export');const ids=new Set(filtered.map(p=>p.id));const rows=r.products.filter(p=>ids.has(p.id));if(pdf)printProducts(rows,profile.business?.name,win,showCost);else download('products-export.csv',toCsv(rows,showCost));}catch(e){if(win&&!win.closed)win.close();notify(e.message,true);}}
 return <main className="page product-page"><div className="page-head"><div><p className="eyebrow">CATALOG / MASTER DATA</p><h1>Products</h1><p className="muted">SKU, barcode, category, supplier, preparation and pricing.</p></div><div className="actions">{allowed('products.audit')&&<IconAction icon={History} label="Product Activity Log" onClick={audit}/>} {allowed('products.export')&&<IconAction icon={QrCode} label="Generate Product Barcode and QR Labels (A4 Portrait)" onClick={()=>setCodeLabels({mode:'filtered',products:filtered})} disabled={loading||!filtered.length}/>} {allowed('products.export')&&<><IconAction icon={Download} label="Export Products CSV" onClick={()=>exportData(false)}/><IconAction icon={Printer} label="Print or Save Products PDF" onClick={()=>exportData(true)}/></>}{allowed('products.import')&&<IconAction icon={Upload} label="Import Products CSV" onClick={()=>setImporting(true)}/>} {allowed('products.create')&&<IconAction icon={Plus} label="Add Product" primary onClick={()=>setEdit('new')}/>}</div></div>
 <div className="stat-grid"><div className="stat"><Package size={19}/><span>Total Products</span><b>{counts.total}</b></div><div className="stat"><CheckCircle2 size={19}/><span>Active</span><b>{counts.active}</b></div><div className="stat"><Tags size={19}/><span>Stock Tracked</span><b>{counts.tracked}</b></div><div className="stat"><Scale size={19}/><span>Scale Items</span><b>{counts.weighable}</b></div></div>
 <div className="table-panel product-table-panel"><div className="tools product-tools"><div className="search"><Search size={17}/><input aria-label="Search Products" placeholder="Search SKU, barcode, product or supplier..." value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Filter Product Status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><select aria-label="Filter Category" value={category} onChange={e=>setCategory(e.target.value)}><option value="ALL">All Categories</option>{meta.categories.map(c=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select><select aria-label="Filter Supplier" value={supplier} onChange={e=>setSupplier(e.target.value)}><option value="ALL">All Suppliers</option>{meta.suppliers.map(s=><option key={s.id} value={s.id}>{s.supplier_name}</option>)}</select>{canViewInventory&&<select aria-label="Select Stock Branch" value={stockBranchId} onChange={e=>setStockBranchId(e.target.value)} disabled={loading||!stockReady}>{stockBranches.map(b=><option key={b.id} value={String(b.id)}>Stock: {b.name}</option>)}</select>}<IconAction icon={RefreshCw} label="Refresh Products" onClick={()=>refreshPage(load,notify)} disabled={loading}/></div><div className="table-scroll product-table-scroll"><table><thead><tr>{['#','SKU / Barcode','Product','Structure','Category','Sell(RM)','Stock','Preparation','Status','Actions'].map(s=><th key={s} className={s==='Sell(RM)'?'product-money':undefined}>{s}</th>)}</tr></thead><tbody>{filtered.slice(currentPage*100,(currentPage+1)*100).map((p,i)=><tr key={p.id}><td>{currentPage*100+i+1}</td><td><strong>{p.sku}</strong><small>{p.barcode||'—'}</small></td><td><strong>{p.product_name}</strong><small>{p.product_type||'GOODS'}{yes(p.is_kpdn_controlled)&&<span className="product-kpdn-pill" title="KPDN Controlled Goods">KPDN</span>}</small></td><td><strong>{p.product_structure||'SINGLE'}</strong><small>{p.base_unit_code||'PCS'}{(p.packaging_units||[]).length?` · ${p.packaging_units.map(unit=>unit.unitCode).join(' / ')}`:''}{(p.components||[]).length?` · ${p.components.length} components`:''}{yes(p.is_weighable)?` · ${p.weighing_unit}`:''}</small></td><td>{p.category_name}</td><td className="product-money">{fixed2(p.selling_price)}</td><td className="product-stock-qty" title={stockReady?`Live inventory at ${stockBranchName}`:'Stock unavailable or not permitted'}><span className={stockFor(p).status==='INITIALIZED'?'product-live-stock-qty':'product-no-stock'}>{stockFor(p).label}</span></td><td>{yes(p.requires_preparation)?p.station_name:'—'}</td><td><span className={`pill ${p.status==='ACTIVE'?'good':'off'}`}>{p.status}</span></td><td><div className="row-actions">{(allowed('products.update')||allowed('products.prices.manage'))&&<IconAction icon={Pencil} label={`Edit ${p.product_name}`} onClick={()=>setEdit(p)}/>}<IconAction icon={Eye} label={`View ${p.product_name}`} onClick={()=>setViewing(p)}/>{allowed('products.export')&&<IconAction icon={QrCode} label={`Generate Barcode and QR Label for ${p.product_name}`} onClick={()=>setCodeLabels({mode:'single',products:[p],singleProduct:p})}/>}{allowed('products.delete')&&<IconAction icon={Trash2} label={`Archive ${p.product_name}`} danger onClick={()=>setArchiveTarget(p)}/>}</div></td></tr>)}{!filtered.length&&<tr><td className="empty" colSpan="10">{loading?'Loading products...':'No products match your filters.'}</td></tr>}</tbody></table></div>{filtered.length>100&&<div className="product-preview-pager product-list-pager"><span>Showing {currentPage*100+1}–{Math.min((currentPage+1)*100,filtered.length)} of {filtered.length}</span><IconAction icon={ChevronLeft} label="Previous Products Page" onClick={()=>setPaging({page:Math.max(0,currentPage-1),key:pageKey})} disabled={currentPage===0}/><IconAction icon={ChevronRight} label="Next Products Page" onClick={()=>setPaging({page:Math.min(lastPage,currentPage+1),key:pageKey})} disabled={currentPage>=lastPage}/></div>}</div>
 {edit!==undefined&&<ProductDialog original={edit==='new'?null:edit} meta={meta} busy={busy} showCost={showCost} notify={notify} canEditProduct={edit==='new'||allowed('products.update')} canManageBranchPrices={allowed('products.prices.manage')} stockSummary={edit==='new'?{status:'NEW',label:'Not initialized'}:stockFor(edit)} stockBranchName={stockBranchName} onClose={()=>setEdit(undefined)} onSave={save}/>} {importing&&<ProductImport notify={notify} onClose={()=>setImporting(false)} onImported={load}/>} {viewing&&<ProductViewDialog product={viewing} showCost={showCost} stockSummary={stockFor(viewing)} stockBranchName={stockBranchName} onClose={()=>setViewing(null)}/>}
 {codeLabels&&<ProductCodeLabels products={codeLabels.products} singleProduct={codeLabels.singleProduct||null} businessName={profile.business?.name||'TPOS V2'} notify={notify} onClose={()=>setCodeLabels(null)}/>}
 {archiveTarget&&<div className="overlay"><div className="dialog"><div className="dialog-head"><h2>Archive Product</h2><IconAction icon={X} label="Close" onClick={()=>setArchiveTarget(null)}/></div><p>Archive <strong>{archiveTarget.product_name}</strong>? Its historical SKU and audit records are preserved.</p><div className="dialog-actions"><IconAction icon={X} label="Cancel" onClick={()=>setArchiveTarget(null)}/><IconAction icon={Trash2} label="Confirm Archive Product" danger onClick={archive} disabled={busy}/></div></div></div>}
 {logs&&<div className="overlay"><div className="dialog wide"><div className="dialog-head"><h2>Product Activity Log</h2><IconAction icon={X} label="Close" onClick={()=>setLogs(null)}/></div><div className="table-scroll product-audit-scroll"><table className="product-audit-table"><thead><tr><th>Time (UTC)</th><th>Action</th><th>Product</th><th>Action By</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}><td>{dateString(x.created_at)}</td><td>{x.action_type}</td><td><strong>{x.product_name||'Product unavailable'}</strong></td><td><strong>{x.user_name||'User unavailable'}</strong><small>{productAuditActionBy(x.action_type)}</small></td></tr>)}{!logs.length&&<tr><td colSpan="4">No activity yet.</td></tr>}</tbody></table></div></div></div>}</main>;
}
