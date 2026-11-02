import {refreshPage} from './refresh-page.js';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {BadgePercent,CheckCircle2,CalendarClock,Layers3,Calculator,Plus,Pencil,Eye,Trash2,History,RefreshCw,Upload,FileDown,Search,X,Save,Check,ChevronLeft,ChevronRight,Info,Printer,Settings2} from 'lucide-react';
import {request} from './api.js';
import {generateDiscountPdf} from './discount-pdf.js';
import {buildDiscountPrintHtml} from './discount-print.js';
import {qrSvg,barcodeSvg,svgData} from './discount-codes-render.js';
const initial={discountCode:'',discountName:'',description:'',discountType:'PERCENTAGE',discountScope:'ORDER',eligibilityType:'ALL',targetIds:[],discountValue:'10.00',minimumSpend:'0.00',maximumDiscountAmount:null,startDate:null,endDate:null,usageLimit:null,sortOrder:0,status:'ACTIVE'};
const money=v=>Number(v||0).toFixed(2);
const fmtDate=v=>v?String(v).slice(0,10):'—';
function Icon({icon:Component,title,action,disabled=false,primary=false,danger=false,type="button"}){return <button type={type} className={`${primary?'primary':'outline'} action-icon ${danger?'discount-danger':''}`} title={title} aria-label={title} onClick={action} disabled={disabled}><Component size={18}/></button>;}
function Field({label,value,change,type='text',required=false,placeholder='',min,step,max,disabled=false}){return <label className="field"><span>{label}</span><input type={type} value={value??''} onChange={e=>change(e.target.value)} placeholder={placeholder} min={min} max={max} step={step} disabled={disabled} required={required}/></label>;}
function Select({label,value,change,children,disabled=false}){return <label className="field"><span>{label}</span><select value={value} onChange={e=>change(e.target.value)} disabled={disabled}>{children}</select></label>;}
const titleType=d=>d.discount_type==='PERCENTAGE'?`${money(d.discount_value)}%`:`RM ${money(d.discount_value)}`;
function DiscountForm({record,meta,save,close,busy}){
 const [targetSearch,setTargetSearch]=useState('');const [generateQuantity,setGenerateQuantity]=useState('1');
 const [form,setForm]=useState(record?{discountCode:record.discount_code,discountName:record.discount_name,description:record.description||'',discountType:record.discount_type,discountScope:record.discount_scope,eligibilityType:record.eligibility_type,targetIds:record.targets.map(x=>Number(x.id)),discountValue:money(record.discount_value),minimumSpend:money(record.minimum_spend),maximumDiscountAmount:record.maximum_discount_amount===null?'':money(record.maximum_discount_amount),startDate:fmtDate(record.start_date)==='—'?'':fmtDate(record.start_date),endDate:fmtDate(record.end_date)==='—'?'':fmtDate(record.end_date),usageLimit:record.usage_limit??'',sortOrder:record.sort_order,status:record.status}:{...initial,maximumDiscountAmount:'',startDate:'',endDate:'',usageLimit:''});
 const update=(key,value)=>setForm(s=>({...s,[key]:value}));
 const choices=form.eligibilityType==='CATEGORY'?meta.categories:form.eligibilityType==='PRODUCT'?meta.products:[];
 const submit=e=>{e.preventDefault();save({...form,discountCode:record?form.discountCode:undefined,...(record?{}:{generateQuantity:Number(generateQuantity)}),discountValue:Number(form.discountValue),minimumSpend:Number(form.minimumSpend),maximumDiscountAmount:form.maximumDiscountAmount===''?null:Number(form.maximumDiscountAmount),startDate:form.startDate||null,endDate:form.endDate||null,usageLimit:form.usageLimit===''?null:Number(form.usageLimit),sortOrder:Number(form.sortOrder),targetIds:form.targetIds.map(Number)});};
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}><form className="dialog discount-dialog voucher-dialog" onSubmit={submit}>
 <div className="dialog-head"><div><p className="eyebrow">DISCOUNT / MASTER DATA</p><h2>{record?'Edit Discount':'Add Discount'}</h2><p className="muted">Manage discount rules without processing POS redemptions.</p></div><Icon icon={X} title="Close" action={close} disabled={busy}/></div>
 <section className="discount-section voucher-section"><h3>Discount Identity</h3><div className="form-two"><label className="field"><span>Discount Code (Auto-generated)</span><input type="text" value={record?form.discountCode:"Generated automatically on save"} readOnly aria-label="Discount Code (Auto-generated)" title="The unique discount code is generated when creating a discount and cannot be edited."/></label><Field label="Discount Name" required value={form.discountName} change={v=>update('discountName',v)}/></div><label className="field"><span>Description</span><textarea rows="2" maxLength="1000" value={form.description} onChange={e=>update('description',e.target.value)}/></label></section>
 <section className="discount-section voucher-section"><h3>Discount Rules</h3><div className="form-two"><Select label="Discount Type" value={form.discountType} change={v=>update('discountType',v)}><option value="PERCENTAGE">Percentage (%)</option><option value="FIXED_AMOUNT">Fixed Amount (RM)</option></Select><Select label="Discount Scope" value={form.discountScope} change={v=>update('discountScope',v)}><option value="ORDER">Order</option><option value="ITEM">Item</option></Select><Field label={form.discountType==='PERCENTAGE'?'Discount Value (%)':'Discount Value (RM)'} required type="number" min="0.01" max={form.discountType==='PERCENTAGE'?100:99999999.99} step="0.01" value={form.discountValue} change={v=>update('discountValue',v)}/><Field label="Minimum Spend (RM)" required type="number" min="0" step="0.01" value={form.minimumSpend} change={v=>update('minimumSpend',v)}/><Field label="Maximum Discount (RM, optional)" type="number" min="0.01" step="0.01" value={form.maximumDiscountAmount} change={v=>update('maximumDiscountAmount',v)}/><Select label="Eligibility" value={form.eligibilityType} change={v=>setForm(s=>({...s,eligibilityType:v,discountScope:v==='ALL'?s.discountScope:'ITEM',targetIds:[]}))}><option value="ALL">All eligible items / order</option><option value="CATEGORY">Selected Categories</option><option value="PRODUCT">Selected Products</option></Select></div>
 {form.eligibilityType!=='ALL'&&<div className="discount-target-picker voucher-target-picker"><span className="discount-caption">Select eligible {form.eligibilityType==='PRODUCT'?'products':'categories'} ({form.targetIds.length} selected, maximum 200). The discount must use Item scope.</span><input className="discount-target-search" type="search" aria-label="Search Discount Targets" placeholder="Search product or category..." value={targetSearch} onChange={e=>setTargetSearch(e.target.value)}/><div className="discount-target-list voucher-target-list">{choices.filter(item=>`${item.product_name||item.category_name} ${item.sku||''}`.toLowerCase().includes(targetSearch.toLowerCase())).map(item=>{const id=Number(item.id);return <label key={item.id}><input type="checkbox" checked={form.targetIds.includes(id)} disabled={!form.targetIds.includes(id)&&form.targetIds.length>=200} onChange={e=>update('targetIds',e.target.checked?[...form.targetIds,id]:form.targetIds.filter(v=>v!==id))}/><span>{item.product_name||item.category_name}{item.sku?` · ${item.sku}`:''}</span></label>;})}{!choices.length&&<p>No active targets available.</p>}</div></div>}
 </section>
 <section className="discount-section voucher-section"><h3>Validity and Availability</h3><div className="form-two"><Field label="Start Date (optional)" type="date" value={form.startDate} change={v=>update('startDate',v)}/><Field label="End Date (optional)" type="date" value={form.endDate} change={v=>update('endDate',v)}/><Field label="Usage Limit (optional)" type="number" min="1" step="1" value={form.usageLimit} change={v=>update('usageLimit',v)}/><Field label="Sort Order" type="number" step="1" value={form.sortOrder} change={v=>update('sortOrder',v)}/><Select label="Status" value={form.status} change={v=>update('status',v)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></Select></div><p className="discount-hint">Usage Count is read-only and remains zero until a later POS redemption implementation. No sales, taxes, stock or voucher data is changed by this module.</p></section>
 {!record&&<section className="discount-section voucher-section voucher-batch-section"><h3>Discount Generation</h3><div className="form-two"><Field label="Quantity to Generate" type="number" min="1" max="200" step="1" required value={generateQuantity} change={setGenerateQuantity}/><p className="voucher-help">Create 1–200 independent discount rule records from these details. Each record receives its own auto-generated code. These are rule identifiers, not redeemable Voucher codes. Creation is all-or-nothing.</p></div></section>}
 <div className="dialog-actions"><Icon icon={X} title="Cancel" action={close} disabled={busy}/><button type="submit" className="primary" disabled={busy}><Save size={18}/>{record?'Save Changes':'Create Discount'}</button></div>
 </form></div>;
}
// Keep View Discount visually consistent with the accepted Voucher View.
// A discount code is a rule reference, NOT a redeemable Voucher bearer token.
const displayDiscountDate=value=>value?String(value).slice(0,10):'No date restriction';
function DiscountCard({discount,settings,businessName}){
 const code=String(discount.discount_code||'').toUpperCase();
 const barcode=svgData(barcodeSvg(code));
 const qr=svgData(qrSvg(code));
 const width=Number(settings?.widthCm)||18.55;
 const height=Number(settings?.heightCm)||8.45;
 return <div className="voucher-print-card" style={{'--voucher-width':`${width}cm`,'--voucher-height':`${height}cm`,aspectRatio:width/height}}>
  <div className="voucher-print-left">
   <p className="voucher-print-brand">{businessName||'Business Name'}</p>
   <h2>{discount.discount_name}</h2>
   <p className="voucher-print-value">{titleType(discount)}</p>
   <p className="voucher-print-description">{discount.description||'Discount rule reference only. Not redeemable.'}</p>
   <div className="voucher-code-group">
    <img src={barcode} className="voucher-barcode" alt={`Code128 for discount rule ${code}`}/>
    <strong className="voucher-print-code">{code}</strong>
    <p className="voucher-print-date">Valid: {displayDiscountDate(discount.start_date)} – {displayDiscountDate(discount.end_date)}</p>
   </div>
  </div>
  <div className="voucher-print-right">
   <img src={qr} className="voucher-qr" alt={`QR code for discount rule ${code}`}/>
   <small>Discount rule reference only. Not redeemable.</small>
  </div>
 </div>;
}
function DiscountView({discount,settings,businessName,close,onPrint,canPrint}){
 const lines=[
  ['Discount Code',discount.discount_code],
  ['Type',discount.discount_type.replaceAll('_',' ')],
  ['Scope',discount.discount_scope],
  ['Status',discount.status],
  ['Eligibility',discount.eligibility_type],
  ['Minimum Spend',`RM ${money(discount.minimum_spend)}`],
  ['Maximum Discount',discount.maximum_discount_amount==null?'No cap':`RM ${money(discount.maximum_discount_amount)}`],
  ['Start Date',fmtDate(discount.start_date)],
  ['End Date',fmtDate(discount.end_date)],
  ['Usage Limit',discount.usage_limit??'Unlimited'],
  ['Usage Count',discount.usage_count],
  ['Sort Order',discount.sort_order],
  ['Last Updated By',discount.updated_by_name||'—']
 ];
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
  <div className="dialog wide voucher-view">
   <div className="dialog-head"><div><p className="eyebrow">DISCOUNT / DETAILS</p><h2>View Discount</h2></div><Icon icon={X} title="Close" action={close}/></div>
   <DiscountCard discount={discount} settings={settings} businessName={businessName}/>
   <p className="voucher-help">Print size: {settings.widthCm} cm × {settings.heightCm} cm. The barcode and QR identify the same discount rule; this is not a redeemable voucher.</p>
   {discount.targets.length>0&&<p className="voucher-help"><strong>Eligible Targets:</strong> {discount.targets.map(t=>t.name||t.code||`ID ${t.id}`).join(', ')}</p>}
   <div className="voucher-view-grid">{lines.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
   {canPrint&&<div className="dialog-actions"><button type="button" className="primary" onClick={onPrint}><Printer size={18}/>Print Discount</button></div>}
  </div>
 </div>;
}
// The calculation is server-side and does not reserve, redeem or post a discount.
function DiscountCalculationPreview({discount,meta,close,notify}){
 const [subtotal,setSubtotal]=useState('100.00');
 const [productId,setProductId]=useState('');
 const [productSearch,setProductSearch]=useState('');
 const [simulate,setSimulate]=useState(false);
 const [simulatedCount,setSimulatedCount]=useState(String(discount.usage_count??0));
 const [result,setResult]=useState(null);
 const [busy,setBusy]=useState(false);
 const targeted=discount.eligibility_type!=='ALL';
 const needsProduct=discount.discount_scope==='ITEM';
 const filteredProducts=meta.products.filter(p=>`${p.sku} ${p.product_name}`.toLocaleLowerCase('en').includes(productSearch.toLocaleLowerCase('en')));
 const reasons={ELIGIBLE:'Discount is eligible',TARGET_NOT_ELIGIBLE:'Product is not eligible for this discount',DISCOUNT_INACTIVE:'Discount is inactive',DISCOUNT_NOT_STARTED:'Discount has not started',DISCOUNT_EXPIRED:'Discount has expired',USAGE_LIMIT_REACHED:'Usage limit has been reached',MINIMUM_SPEND_NOT_MET:'Minimum spend is not met',INVALID_SUBTOTAL:'Subtotal is invalid',INVALID_DISCOUNT_TYPE:'Discount type is invalid',INVALID_DISCOUNT_VALUE:'Discount value is invalid'};
 async function calculate(e){
  e.preventDefault();setResult(null);
  const n=Number(subtotal);
  if(!Number.isFinite(n)||n<0||Math.abs(n*100-Math.round(n*100))>1e-7){notify('Enter a valid subtotal in RM with up to two decimal places.',true);return;}
  if(targeted&&!productId){notify('Choose a product to test the Product / Category target.',true);return;}
  const count=Number(simulatedCount);
  if(simulate&&(!Number.isSafeInteger(count)||count<0||count>1000000000)){notify('Enter a valid simulated usage count (0 to 1,000,000,000).',true);return;}
  setBusy(true);
  try{
   const body={eligibleSubtotal:n,...(needsProduct&&productId?{productId:Number(productId)}:{})};
   if(simulate)body.simulatedUsageCount=count;
   const response=await request(`/discounts/${discount.id}/preview-calculation`,{method:'POST',body});
   setResult(response);
  }catch(err){notify(err.message,true);}finally{setBusy(false);}
 }
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}><form className="dialog discount-calculator" onSubmit={calculate}>
  <div className="dialog-head"><div><p className="eyebrow">DISCOUNT / VALIDATION</p><h2>Preview Calculation</h2><p className="muted">Read-only estimate — no POS sale, usage redemption or accounting posting.</p></div><Icon icon={X} title="Close" action={close} disabled={busy}/></div>
  <div className="discount-calc-rule"><div><strong>{discount.discount_name}</strong><span>{discount.discount_code} · {discount.discount_scope} · {discount.eligibility_type}</span></div><b>{titleType(discount)}</b></div>
  <div className="form-two discount-calc-inputs"><Field label={discount.discount_scope==='ORDER'?'Order Subtotal (RM)':'Eligible Item Subtotal (RM)'} value={subtotal} change={v=>{setSubtotal(v);setResult(null);}} type="number" min="0" step="0.01" required/>
  <div className="discount-calc-facts"><span>Current Usage Count</span><strong>{discount.usage_count??0} / {discount.usage_limit??'Unlimited'}</strong><small>Live count from Discount Master. No redemptions are created.</small></div></div>
  {needsProduct&&<div className="discount-calc-product"><label className="field"><span>{targeted?'Product to Test (required)':'Product to Test (optional)'}</span><input type="search" placeholder="Filter products by SKU or name" value={productSearch} onChange={e=>setProductSearch(e.target.value)}/><select aria-label="Product for calculation" value={productId} required={targeted} onChange={e=>{setProductId(e.target.value);setResult(null);}}><option value="">{targeted?'Choose eligible or ineligible product':'No product selected'}</option>{filteredProducts.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.product_name}</option>)}{productId&&!filteredProducts.some(p=>String(p.id)===productId)&&meta.products.filter(p=>String(p.id)===productId).map(p=><option key={p.id} value={p.id}>{p.sku} — {p.product_name}</option>)}</select></label><p className="discount-calc-note">The server verifies the product and its category against the saved targets.</p></div>}
  <div className="discount-calc-simulation"><label className="discount-calc-check"><input type="checkbox" checked={simulate} onChange={e=>{setSimulate(e.target.checked);setResult(null);}}/><span>Simulate Usage Count (for testing only)</span></label>{simulate&&<><Field label="Hypothetical Usage Count" type="number" min="0" max="1000000000" step="1" required value={simulatedCount} change={v=>{setSimulatedCount(v);setResult(null);}}/><p className="discount-calc-note">This affects this preview only. The real usage count remains unchanged.</p></>}</div>
  {result&&<div role="status" className={`discount-calc-result ${result.eligible?'discount-calc-eligible':'discount-calc-ineligible'}`}><div className="discount-calc-result-head"><span>{result.eligible?'Eligible':'Not Eligible'}</span><strong>RM {money(result.amount)}</strong></div><p>{reasons[result.reason]||result.reason}</p><small>Malaysia date: {result.date} · Actual DB usage: {result.actualUsageCount} · Usage count evaluated: {result.evaluationUsageCount}{result.simulation?' (simulation)':''} · No transaction posted</small></div>}
  <div className="dialog-actions"><button type="submit" className="primary" disabled={busy}><Calculator size={18}/>{busy?'Calculating...':'Calculate Discount'}</button></div>
 </form></div>;
}
function DiscountImport({close,onDone,notify}){
 const [csvText,setCsvText]=useState(''),[fileName,setFileName]=useState(''),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[page,setPage]=useState(0),[error,setError]=useState('');
 const pageSize=50;
 async function choose(event){
  const file=event.target.files?.[0];if(!file)return;
  setCsvText('');setFileName(file.name);setPreview(null);setPage(0);setError('');
  if(file.size>1024*1024){setError('CSV file exceeds 1 MiB.');return;}
  try{setCsvText(await file.text());}catch{setError('Unable to read CSV file.');}
 }
 async function template(){setBusy(true);setError('');try{
  const base=import.meta.env.VITE_BACKEND_URL||'http://127.0.0.1:5100';
  const response=await fetch(`${base}/api/v2/discounts/import/template`,{credentials:'include'});
  if(!response.ok)throw new Error('TEMPLATE_UNAVAILABLE');
  const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download='discounts-import-template.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 async function previewCsv(){setBusy(true);setError('');setPreview(null);setPage(0);try{
  setPreview(await request('/discounts/import/preview',{method:'POST',body:{csv:csvText}}));
 }catch(e){setError(e.message==='CSV_ROW_LIMIT'?'Maximum 1,000 discount rows per import. Split the CSV.':e.message);}finally{setBusy(false);}}
 async function importCsv(){if(!preview?.valid||preview.count<=0)return;
  setBusy(true);setError('');try{
   const result=await request('/discounts/import',{method:'POST',body:{csv:csvText}});
   notify(`${result.count} discounts imported successfully (${result.generatedCount??0} codes auto-generated).`);
   await onDone();close();
  }catch(e){setPreview(null);setError(`${e.message}. Please preview the file again before confirming.`);}finally{setBusy(false);}}
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)close();}}><div className="dialog wide voucher-import-dialog discount-import-dialog">
  <div className="dialog-head"><div><p className="eyebrow">DISCOUNTS / IMPORT</p><h2>Import Discounts</h2><p className="muted">CSV Preview → Confirm. Maximum 1,000 rows / 1 MiB. Leave Discount Code empty for unique auto-generated codes. Explicit existing-format codes are supported if unique. Target codes use Product SKU or Category Name separated by |.</p></div><Icon icon={X} title="Close" action={close} disabled={busy}/></div>
  <div className="voucher-import-actions"><button type="button" className="outline" onClick={template} disabled={busy}><FileDown size={17}/>CSV Template</button><label className="voucher-import-file"><Upload size={17}/><span>{fileName||'Choose CSV File'}</span><input type="file" aria-label="Choose Discount CSV" accept=".csv,text/csv" onChange={choose} disabled={busy}/></label><button type="button" className="primary" onClick={previewCsv} disabled={!csvText||busy}><Eye size={17}/>Preview Import</button></div>
  {error&&<p role="alert" className="voucher-import-error">{error}</p>}
  {preview&&<><p role="status" className={preview.valid?'voucher-import-valid':'voucher-import-error'}>{preview.valid?`${preview.count} rows valid and ready for confirmation.`:`Validation failed. No discounts imported. ${preview.rows.filter(r=>r.error).length} row errors.`}</p><div className="table-scroll voucher-import-table"><table><thead><tr><th>Line</th><th>Discount Code</th><th>Discount Name</th><th>Validation</th></tr></thead><tbody>{preview.rows.slice(page*pageSize,(page+1)*pageSize).map((r,i)=><tr key={`${r.line}-${i}`}><td>{r.line}</td><td>{r.code||'AUTO-GENERATED'}</td><td>{r.name||'—'}</td><td className={r.error?'voucher-import-error':'voucher-import-valid'}>{r.error||'VALID'}</td></tr>)}</tbody></table></div><div className="voucher-import-pager"><span>Showing {preview.count? page*pageSize+1:0}–{Math.min((page+1)*pageSize,preview.count)} / {preview.count}</span><Icon icon={ChevronLeft} title="Previous Page" action={()=>setPage(n=>Math.max(0,n-1))} disabled={page===0}/><Icon icon={ChevronRight} title="Next Page" action={()=>setPage(n=>Math.min(Math.ceil(preview.count/pageSize)-1,n+1))} disabled={(page+1)*pageSize>=preview.count}/></div><div className="dialog-actions"><button type="button" className="outline" onClick={close} disabled={busy}>Cancel</button><button type="button" className="primary" onClick={importCsv} disabled={busy||!preview.valid||!preview.count}><Save size={18}/>Confirm Import</button></div></>}
 </div></div>;
}
function DiscountPrintSettings({value,onClose,onSave,busy}){
 const [width,setWidth]=useState(value.widthCm),[height,setHeight]=useState(value.heightCm);
 return <div className="overlay"><form className="dialog" onSubmit={e=>{e.preventDefault();onSave({widthCm:Number(width),heightCm:Number(height)});}}><div className="dialog-head"><div><p className="eyebrow">OWNER SETTINGS</p><h2>Discount Print Size</h2></div><Icon icon={X} title="Close" action={onClose} disabled={busy}/></div><div className="form-two"><Field label="Width (cm)" type="number" min="5" max="30" step="0.01" required value={width} change={setWidth}/><Field label="Height (cm)" type="number" min="3" max="20" step="0.01" required value={height} change={setHeight}/></div><p className="voucher-help">Default 18.55 cm × 8.45 cm. Set matching paper size in printer settings. Changes apply to new prints only.</p><div className="dialog-actions"><Icon icon={X} title="Cancel" action={onClose} disabled={busy}/><button type="submit" className="primary" disabled={busy}><Save size={18}/>Save Print Size</button></div></form></div>;
}
function SelectDiscountDialog({rows,mode,initialId,onClose,onConfirm,busy,settings}){
 const [selected,setSelected]=useState(()=>initialId==null?[]:[String(initialId)]),[search,setSearch]=useState('');
 const visible=rows.filter(d=>`${d.discount_name} ${d.discount_code}`.toLowerCase().includes(search.toLowerCase()));
 const chosen=rows.filter(d=>selected.includes(String(d.id)));
 const addVisible=()=>setSelected(old=>{const ids=new Set(old);for(const d of visible){if(ids.size>=100)break;ids.add(String(d.id));}return [...ids];});
 const clearVisible=()=>setSelected(old=>old.filter(id=>!visible.some(d=>String(d.id)===id)));
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div className="dialog wide voucher-select-dialog"><div className="dialog-head"><div><p className="eyebrow">DISCOUNTS / {mode==='PDF'?'EXPORT PDF':'PRINT'}</p><h2>Select Discounts</h2><p className="muted">Choose the unique discount rule records to include. Each selected record is printed once on its own sheet; printing does not redeem or apply discounts.</p></div><Icon icon={X} title="Close" action={onClose} disabled={busy}/></div><div className="voucher-select-toolbar"><input type="search" aria-label="Search Discounts to Select" placeholder="Search discount name or code..." value={search} onChange={e=>setSearch(e.target.value)} disabled={busy}/><button type="button" className="outline" disabled={busy||!visible.length} onClick={addVisible}>Select Visible</button><button type="button" className="outline" disabled={busy} onClick={clearVisible}>Clear Visible</button></div><div className="voucher-select-list">{visible.map(d=><label key={d.id} className="voucher-select-row"><input type="checkbox" checked={selected.includes(String(d.id))} disabled={busy||(!selected.includes(String(d.id))&&selected.length>=100)} onChange={e=>setSelected(old=>e.target.checked?[...old,String(d.id)]:old.filter(id=>id!==String(d.id)))}/><span><strong>{d.discount_name}</strong><small>{d.discount_code} · {titleType(d)}</small></span><span className="voucher-select-status">{d.status}</span></label>)}{!visible.length&&<p className="voucher-help">No matching discounts.</p>}</div><div className="voucher-select-footer"><strong>{chosen.length} unique discounts selected</strong><span>1 discount per page · {settings.widthCm} cm × {settings.heightCm} cm</span></div><div className="dialog-actions"><Icon icon={X} title="Cancel" action={onClose} disabled={busy}/><button type="button" className="primary" disabled={busy||!chosen.length} onClick={()=>onConfirm(chosen)}>{mode==='PDF'?<FileDown size={18}/>:<Printer size={18}/>} {busy?'Preparing...':mode==='PDF'?'Download Discount PDF':'Print Selected Discounts'}</button></div></div></div>;
}
export default function Discounts({profile,notify}){
 const [items,setItems]=useState([]),[meta,setMeta]=useState({categories:[],products:[]}),[query,setQuery]=useState(''),[status,setStatus]=useState('ALL'),[dialog,setDialog]=useState(undefined),[view,setView]=useState(null),[calculation,setCalculation]=useState(null),[importing,setImporting]=useState(false),[logs,setLogs]=useState(null),[archive,setArchive]=useState(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[page,setPage]=useState(0),[settings,setSettings]=useState({widthCm:'18.55',heightCm:'8.45'}),[printEdit,setPrintEdit]=useState(false),[selectionJob,setSelectionJob]=useState(null),[batchBusy,setBatchBusy]=useState(false);
 const allowed=code=>profile.user.permissions.includes(code);
 const load=useCallback(async()=>{setLoading(true);try{const [list,lookup,print]=await Promise.all([request('/discounts'),request('/discounts/meta'),request('/discounts/print-settings')]);setItems(list.discounts);setMeta(lookup);setSettings(print);}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const filtered=useMemo(()=>items.filter(d=>(status==='ALL'||d.status===status)&&`${d.discount_code} ${d.discount_name} ${d.description||''}`.toLowerCase().includes(query.toLowerCase())),[items,query,status]);
 const maxPage=Math.max(0,Math.ceil(filtered.length/100)-1);const current=Math.min(page,maxPage);
 const counts={total:items.length,active:items.filter(d=>d.status==='ACTIVE').length,scheduled:items.filter(d=>d.start_date&&d.status==='ACTIVE').length,targeted:items.filter(d=>d.eligibility_type!=='ALL').length};
 async function save(d){setBusy(true);try{const result=await request(dialog===null?'/discounts':`/discounts/${dialog.id}`,{method:dialog===null?'POST':'PUT',body:d});notify(dialog===null?(result.count>1?`${result.count} discounts created with unique codes.`:`Discount created: ${result.discountCode}`):'Discount updated.');setDialog(undefined);await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function switchStatus(d){setBusy(true);try{await request(`/discounts/${d.id}/status`,{method:'PATCH',body:{status:d.status==='ACTIVE'?'INACTIVE':'ACTIVE'}});notify('Discount status updated.');await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function archiveNow(){setBusy(true);try{await request(`/discounts/${archive.id}`,{method:'DELETE',body:{}});notify('Discount archived.');setArchive(null);await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function showLogs(){try{const r=await request('/discounts/audit');setLogs(r.logs);}catch(e){notify(e.message,true);}}
 async function exportPdf(selected){setBatchBusy(true);try{
  const blob=await generateDiscountPdf(selected,profile.business?.name||'TPOS V2',settings);
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`discounts-${new Date().toISOString().slice(0,10)}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  notify(`${selected.length} unique discount records exported to PDF.`);setSelectionJob(null);
 }catch(e){notify(e.message,true);}finally{setBatchBusy(false);}}
 async function savePrintSize(size){setBusy(true);try{await request('/discounts/print-settings',{method:'PUT',body:size});setSettings({widthCm:size.widthCm.toFixed(2),heightCm:size.heightCm.toFixed(2)});setPrintEdit(false);notify('Discount print size saved.');}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 function runPrint(selected){let win;try{
  win=window.open('','_blank','width=1000,height=800');if(!win)throw Error('POPUP_BLOCKED');
  win.document.open();win.document.write(buildDiscountPrintHtml(selected,settings,profile.business?.name||'TPOS V2'));win.document.close();win.focus();
  Promise.all([...win.document.images].map(img=>img.decode().catch(()=>{}))).then(()=>{if(!win.closed)win.print();});
  setSelectionJob(null);
 }catch(e){if(win&&!win.closed)win.close();notify(e.message,true);}}
 function onSelectConfirm(selected){if(!selected.length){notify('SELECT_DISCOUNT_FIRST',true);return;}if(selectionJob?.mode==='PDF')exportPdf(selected);else runPrint(selected);}
 return <main className="page discount-page voucher-page"><div className="page-head"><div><p className="eyebrow">PROMOTIONS / DISCOUNTS</p><h1>Discounts</h1><p className="muted">Manage order and item discounts separately from customer vouchers.</p></div><div className="actions">{allowed('discounts.audit')&&<Icon icon={History} title="Discount Activity Log" action={showLogs}/>} {allowed('discounts.export')&&<Icon icon={FileDown} title="Export Discounts PDF" action={()=>setSelectionJob({mode:'PDF',initialId:null})} disabled={busy||!items.length}/>} {profile.user.role==='OWNER'&&allowed('discounts.update')&&<Icon icon={Settings2} title="Owner Discount Print Size" action={()=>setPrintEdit(true)}/>} {allowed('discounts.import')&&<Icon icon={Upload} title="Import Discounts CSV" action={()=>setImporting(true)}/>} {allowed('discounts.create')&&<Icon icon={Plus} title="Create Discount" primary action={()=>setDialog(null)}/>}</div></div>
 <div className="stat-grid"><div className="stat"><BadgePercent size={19}/><span>Total Discounts</span><b>{counts.total}</b></div><div className="stat"><CheckCircle2 size={19}/><span>Active</span><b>{counts.active}</b></div><div className="stat"><CalendarClock size={19}/><span>With Validity</span><b>{counts.scheduled}</b></div><div className="stat"><Layers3 size={19}/><span>Targeted</span><b>{counts.targeted}</b></div></div>
 <div className="table-panel discount-table-panel voucher-table-panel"><div className="tools discount-tools voucher-tools"><div className="search"><Search size={17}/><input value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}} aria-label="Search Discounts" placeholder="Search discount code, name or description..."/></div><select aria-label="Discount Status" value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select><Icon icon={RefreshCw} title="Refresh Discounts" action={()=>refreshPage(load,notify)} disabled={loading}/></div><div className="table-scroll discount-table-scroll voucher-table-scroll"><table><thead><tr>{['#','Discount Code','Name','Type / Scope','Value','Minimum Spend','Valid From','Valid Until','Eligibility','Status','Actions'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{filtered.slice(current*100,(current+1)*100).map((d,i)=><tr key={d.id}><td>{current*100+i+1}</td><td><strong>{d.discount_code}</strong></td><td><strong>{d.discount_name}</strong><small>{d.description||'—'}</small></td><td>{d.discount_type.replaceAll('_',' ')}<small>{d.discount_scope}</small></td><td className="discount-money"><strong>{titleType(d)}</strong></td><td className="discount-money">RM {money(d.minimum_spend)}</td><td>{fmtDate(d.start_date)}</td><td>{fmtDate(d.end_date)}</td><td>{d.eligibility_type}{d.targets.length>0&&<small>{d.targets.length} targets</small>}</td><td><span className={`pill ${d.status==='ACTIVE'?'good':'off'}`}>{d.status}</span></td><td><div className="row-actions discount-row-actions voucher-row-actions"><Icon icon={Eye} title={`View ${d.discount_name}`} action={()=>setView(d)}/>{allowed('discounts.export')&&<Icon icon={Printer} title={`Print ${d.discount_name}`} action={()=>setSelectionJob({mode:'PRINT',initialId:d.id})}/>}{allowed('discounts.calculate')&&<Icon icon={Calculator} title={`Preview Calculation for ${d.discount_name}`} action={()=>setCalculation(d)}/>}{allowed('discounts.update')&&<><Icon icon={Pencil} title={`Edit ${d.discount_name}`} action={()=>setDialog(d)}/><Icon icon={d.status==='ACTIVE'?X:CheckCircle2} title={`${d.status==='ACTIVE'?'Deactivate':'Activate'} ${d.discount_name}`} action={()=>switchStatus(d)} disabled={busy}/></>}{allowed('discounts.delete')&&<Icon icon={Trash2} title={`Archive ${d.discount_name}`} danger action={()=>setArchive(d)}/>}</div></td></tr>)}{!filtered.length&&<tr><td className="empty" colSpan="11">{loading?'Loading discounts...':'No discounts match your search.'}</td></tr>}</tbody></table></div>{filtered.length>100&&<div className="discount-pager"><span>Showing {current*100+1}–{Math.min((current+1)*100,filtered.length)} of {filtered.length}</span><Icon icon={ChevronLeft} title="Previous Page" action={()=>setPage(v=>Math.max(0,v-1))} disabled={current===0}/><Icon icon={ChevronRight} title="Next Page" action={()=>setPage(v=>Math.min(maxPage,v+1))} disabled={current===maxPage}/></div>}</div>
 {selectionJob&&<SelectDiscountDialog rows={items} mode={selectionJob.mode} initialId={selectionJob.initialId} settings={settings} busy={batchBusy} onClose={()=>setSelectionJob(null)} onConfirm={onSelectConfirm}/>} {printEdit&&<DiscountPrintSettings value={settings} busy={busy} onClose={()=>setPrintEdit(false)} onSave={savePrintSize}/>}
 {dialog!==undefined&&<DiscountForm record={dialog} meta={meta} busy={busy} close={()=>setDialog(undefined)} save={save}/>} {view&&<DiscountView discount={view} settings={settings} businessName={profile.business?.name||'TPOS V2'} close={()=>setView(null)} canPrint={allowed('discounts.export')} onPrint={()=>{setSelectionJob({mode:'PRINT',initialId:view.id});setView(null);}}/>} {calculation&&<DiscountCalculationPreview discount={calculation} meta={meta} notify={notify} close={()=>setCalculation(null)}/>} {importing&&<DiscountImport close={()=>setImporting(false)} onDone={load} notify={notify}/>} {archive&&<div className="overlay"><div className="dialog"><div className="dialog-head"><h2>Archive Discount</h2><Icon icon={X} title="Close" action={()=>setArchive(null)}/></div><p>Archive <strong>{archive.discount_name}</strong>? Historical audit records remain available.</p><div className="dialog-actions"><Icon icon={X} title="Cancel" action={()=>setArchive(null)}/><button type="button" className="primary" onClick={archiveNow} disabled={busy}><Trash2 size={18}/>Confirm Archive</button></div></div></div>}
 {logs&&<div className="overlay"><div className="dialog wide discount-log-dialog"><div className="dialog-head"><h2>Discount Activity Log</h2><Icon icon={X} title="Close" action={()=>setLogs(null)}/></div><div className="table-scroll discount-log-table"><table><thead><tr><th>Time (UTC)</th><th>Action</th><th>Discount</th><th>Action By</th></tr></thead><tbody>{logs.map(log=><tr key={log.id}><td>{String(log.created_at).replace('T',' ').slice(0,19)}</td><td>{log.action_type}</td><td><strong>{log.discount_name}</strong><small>{log.discount_code}</small></td><td>{log.user_name}</td></tr>)}{!logs.length&&<tr><td colSpan="4">No discount activity recorded.</td></tr>}</tbody></table></div></div></div>}
 <p className="voucher-help voucher-footer"><Info size={15}/> Discount calculation previews do not post sales, stock movements or voucher redemptions. Actual usage remains dependent on the POS checkout integration.</p>
 </main>;
}
