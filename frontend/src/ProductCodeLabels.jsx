import {useMemo,useState} from 'react';
import {X,Printer,CheckSquare,Square,Search} from 'lucide-react';
import {
 PRODUCT_LABEL_PRINT_LIMIT,PRODUCT_LABELS_PER_PAGE,
 productLabelIssue,createProductLabel,buildProductLabelPrintHtml
} from './product-code-labels.js';
import './ProductCodeLabels.css';

export default function ProductCodeLabels({products,businessName,onClose,notify,singleProduct=null}){
 const [selection,setSelection]=useState(()=>new Set(singleProduct?[String(singleProduct.id)]:products.map(p=>String(p.id))));
 const [search,setSearch]=useState('');
 const [error,setError]=useState('');
 const searched=useMemo(()=>products.filter(p=>`${p.sku} ${p.barcode||''} ${p.product_name}`.toLocaleLowerCase('en').includes(search.toLocaleLowerCase('en'))),[products,search]);
 const chosen=useMemo(()=>products.filter(p=>selection.has(String(p.id))),[products,selection]);
 const invalid=useMemo(()=>chosen.filter(p=>productLabelIssue(p)),[chosen]);
 const printReady=chosen.length>0&&chosen.length<=PRODUCT_LABEL_PRINT_LIMIT&&invalid.length===0;
 const firstLabels=useMemo(()=>chosen.slice(0,PRODUCT_LABELS_PER_PAGE).map(p=>{
  try{return {label:createProductLabel(p),error:null};}catch(e){return {label:{sku:String(p.sku??''),barcode:String(p.barcode??''),name:String(p.product_name??'')},error:e.message};}
 }),[chosen]);
 function toggle(id){setSelection(current=>{const next=new Set(current);if(next.has(String(id)))next.delete(String(id));else next.add(String(id));return next;});setError('');}
 function selectMatches(printableOnly=false){
  setSelection(current=>{
   const next=new Set(current);
   for(const product of searched){if(printableOnly&&productLabelIssue(product))next.delete(String(product.id));else next.add(String(product.id));}
   return next;
  });setError('');
 }
 function clearSelection(){setSelection(new Set());setError('');}
 function printLabels(){
  if(!printReady){setError(invalid.length?`Please remove or correct ${invalid.length} product(s) with missing/invalid SKU or barcode.`:'Select 1 to 1,000 valid products.');return;}
  // Open synchronously from the click so Chrome permits the dedicated print window.
  const win=window.open('','_blank','width=1100,height=850');
  if(!win){setError('POPUP_BLOCKED: Allow pop-ups for TPOS and try again.');return;}
  try{
   const html=buildProductLabelPrintHtml(chosen,businessName);
   win.document.open();win.document.write(html);win.document.close();
   // Wait for embedded QR and Code128 SVGs to decode; never print blank codes.
   Promise.all(Array.from(win.document.images,image=>image.decode?image.decode():Promise.resolve()))
    .then(()=>{
     if(win.closed)return;
     const failed=Array.from(win.document.images).some(image=>!image.naturalWidth);
     if(failed){setError('CODE_IMAGE_FAILED: Check the new print window before printing.');return;}
     win.focus();win.print();
    }).catch(()=>setError('CODE_IMAGE_FAILED: Check the new print window before printing.'));
  }catch(e){if(!win.closed)win.close();setError(e.message);notify?.(e.message,true);}
 }
 return <div className="overlay" role="presentation"><div className="dialog wide product-code-dialog" role="dialog" aria-modal="true" aria-label="Generate Product Barcode and QR Codes">
  <div className="dialog-head"><div><p className="eyebrow">PRODUCT / LABEL PRINTING</p><h2>Generate Barcode & QR Codes</h2><p className="muted">A4 Portrait · 3 columns × 4 rows · 12 labels per page. QR = SKU; Code 128 Barcode = Product Barcode.</p></div><button type="button" className="outline product-code-close" onClick={onClose} title="Close" aria-label="Close Product Label Printing"><X size={19}/></button></div>
  <div className="product-code-summary"><span><b>{chosen.length}</b> selected</span><span><b>{Math.ceil(chosen.length/PRODUCT_LABELS_PER_PAGE)}</b> A4 page(s)</span><span><b>{invalid.length}</b> missing/invalid codes</span><span>Maximum {PRODUCT_LABEL_PRINT_LIMIT} labels per print job</span></div>
  <div className="product-code-layout">
   <div className="product-code-select"><div className="product-code-search"><Search size={16}/><input aria-label="Search Product Labels" placeholder="Search SKU, barcode or product..." value={search} onChange={e=>setSearch(e.target.value)}/></div>
    <div className="product-code-selection-actions"><button className="outline" type="button" onClick={()=>selectMatches()}><CheckSquare size={15}/> Select matching</button><button className="outline" type="button" onClick={()=>selectMatches(true)}>Select valid only</button><button className="outline" type="button" onClick={clearSelection}><Square size={15}/> Clear</button></div>
    <div className="product-code-select-list" role="group" aria-label="Products to print">
     {searched.slice(0,200).map(p=><label className="product-code-select-item" key={p.id}>
      <input type="checkbox" checked={selection.has(String(p.id))} onChange={()=>toggle(p.id)}/>
      <span><strong>{p.sku} — {p.product_name}</strong><small>Barcode: {p.barcode||'NOT SET'}</small>{productLabelIssue(p)&&<small className="product-code-invalid">{productLabelIssue(p)}</small>}</span>
     </label>)}
     {!searched.length&&<div className="product-code-no-results">No products match the search.</div>}
    </div>
    {searched.length>200&&<p className="muted product-code-limit-note">Showing the first 200 matching rows. “Select matching” selects all {searched.length} matching products, including those not shown.</p>}
   </div>
   <div className="product-code-preview-panel"><h3>A4 Label Preview</h3><p className="muted">First {Math.min(chosen.length,PRODUCT_LABELS_PER_PAGE)} selected label(s). All selected labels are included in printing.</p>
    <div className="product-code-preview-grid">{firstLabels.map(({label,error:issue},i)=><div className="product-code-preview-label" key={`${label.sku}-${i}`}>
     {issue?<div className="product-code-preview-error">{issue}</div>:<><img src={label.qr} alt={`QR code for ${label.sku}`}/><span>SKU: {label.sku}</span><img className="product-code-preview-barcode" src={label.code128} alt={`Barcode for ${label.barcode}`}/><small>{label.barcode}</small><strong>{label.name}</strong></>}
    </div>)}{!firstLabels.length&&<div className="product-code-no-results">Select products to preview their QR and barcode labels.</div>}</div>
   </div>
  </div>
  {invalid.length>0&&<p className="product-code-warning">{invalid.length} selected product(s) have missing or unsupported SKU/barcode. Set their Product Barcode, or click “Select valid only” to exclude invalid matching products. The system will not silently substitute SKU for a missing barcode.</p>}
  {chosen.length>PRODUCT_LABEL_PRINT_LIMIT&&<p className="product-code-warning">Choose at most {PRODUCT_LABEL_PRINT_LIMIT} products per print job. Narrow the search or deselect some products.</p>}
  {error&&<p className="product-code-warning" role="alert">{error}</p>}
  <div className="dialog-actions product-code-footer"><button type="button" className="outline" onClick={onClose}>Cancel</button><button type="button" className="primary" onClick={printLabels} disabled={!printReady}><Printer size={17}/> Print A4 / Save PDF ({chosen.length})</button></div>
  <p className="muted product-code-print-note">Use Chrome Print Preview with A4, Portrait, Scale 100% and Headers/Footers off. Labels are read-only and generated locally without changing Product Master.</p>
 </div></div>;
}
