import {useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,ChevronLeft,ChevronRight,Download,FileSpreadsheet,Search,ShieldCheck,Table2,Upload,X} from 'lucide-react';
import {request} from './api.js';
import {referenceCostForProduct} from './product-inventory-sync.js';
import './InventoryBulkOpening.css';

const MAX=1000,CSV_MAX=2*1024*1024;
const HEADERS=['SKU','Product','Branch Code','Opening Qty','Actual Unit Cost (RM)','Reference Purchase Cost (RM)'];
const cleanCsv=v=>{const s=String(v??'');const safe=/^\s*[=+@-]/.test(s)?`'${s}`:s;return `"${safe.replaceAll('"','""')}"`;};
function downloadTemplate(branch,rows,referenceCosts){
 const lines=[HEADERS,...rows.slice(0,MAX).map(r=>[r.sku,r.product_name,branch.code,'',referenceCostForProduct(referenceCosts,r.id)||'',referenceCostForProduct(referenceCosts,r.id)||''])];
 const blob=new Blob(['\uFEFF'+lines.map(l=>l.map(cleanCsv).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`TPOS_Opening_Stock_${branch.code}.csv`;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
const makeRows=(products,balances,branchId,referenceCosts)=>{
 const opened=new Set(balances.filter(b=>String(b.branch_id)===String(branchId)).map(b=>String(b.product_id)));
 return products.filter(p=>!opened.has(String(p.id))).map(p=>({...p,selected:false,quantity:'',unitCost:referenceCostForProduct(referenceCosts,p.id)||'0.00'}));
};
const exactNumber=v=>/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(String(v??'').trim());
const twoDecimals=v=>exactNumber(v)?`${String(v).trim().split('.')[0]}.${(String(v).trim().split('.')[1]||'').padEnd(2,'0')}`:v;
export default function InventoryBulkOpening({branches,products,balances,referenceCosts,initialBranchId,onClose,onCompleted,notify}){
 const [branchId,setBranchId]=useState(String(initialBranchId||branches[0]?.id||''));
 const [mode,setMode]=useState('QUICK');
 const [rows,setRows]=useState(()=>makeRows(products,balances,initialBranchId||branches[0]?.id,referenceCosts));
 const [reference,setReference]=useState('Opening stock count');
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const [csvText,setCsvText]=useState(''),[filename,setFilename]=useState('');
 const [search,setSearch]=useState(''),[page,setPage]=useState(0);
 const [preview,setPreview]=useState(null),[acknowledged,setAcknowledged]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const branch=branches.find(b=>String(b.id)===branchId);
 const touch=()=>{setPreview(null);setAcknowledged(false);setError('');setRequestKey(crypto.randomUUID());};
 const changeBranch=id=>{setBranchId(id);setRows(makeRows(products,balances,id,referenceCosts));setCsvText('');setFilename('');setSearch('');setPage(0);touch();};
 const updateRow=(id,patch)=>{setRows(old=>old.map(r=>String(r.id)===String(id)?{...r,...patch}:r));touch();};
 const eligible=useMemo(()=>rows.filter(r=>`${r.sku} ${r.product_name}`.toLowerCase().includes(search.toLowerCase().trim())),[rows,search]);
 const shown=eligible.slice(page*40,page*40+40);
 const selected=rows.filter(r=>r.selected);
 const validSelection=selected.length>0&&selected.length<=MAX;
 useEffect(()=>setPage(p=>Math.min(p,Math.max(0,Math.ceil(eligible.length/40)-1))),[eligible.length]);
 const switchMode=value=>{setMode(value);touch();};
 const loadCsv=async e=>{
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(file.size>CSV_MAX||!file.name.toLowerCase().endsWith('.csv')){touch();setError('Please choose a CSV file no larger than 2 MiB.');return;}
  const text=await file.text();setCsvText(text);setFilename(file.name);touch();
 };
 const payload=()=>({branchId:Number(branchId),reference:reference.trim(),requestKey,...(mode==='CSV'?{csvText}:{rows:selected.map(r=>({sku:r.sku,quantity:String(r.quantity).trim(),unitCost:String(r.unitCost).trim()}))})});
 async function checkPreview(){
  setError('');setPreview(null);setAcknowledged(false);setBusy(true);
  try{const result=await request('/inventory/opening/bulk/preview',{method:'POST',body:payload()});setPreview(result);if(result.errorCount)notify(`Bulk Opening Stock: ${result.errorCount} row(s) need correction.`,true);}
  catch(err){setError(err.message);notify(err.message,true);}finally{setBusy(false);}
 }
 async function postBatch(){
  if(!preview?.canConfirm||!acknowledged||!preview.previewToken)return;
  setBusy(true);setError('');
  try{
   const result=await request('/inventory/opening/bulk/confirm',{method:'POST',body:{...payload(),previewToken:preview.previewToken,confirmAcknowledged:true}});
   notify(result.idempotent?'Bulk Opening Stock was already recorded.':`Bulk Opening Stock recorded: ${result.count} products.`);
   await onCompleted();onClose();
  }catch(err){setError(err.message);notify(err.message,true);if(/STALE|EXPIRED|CONFLICT/.test(err.message)){setPreview(null);setAcknowledged(false);}}
  finally{setBusy(false);}
 }
 const pages=Math.max(1,Math.ceil(eligible.length/40));
 return <div className="overlay inv-bulk-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <section role="dialog" aria-modal="true" aria-label="Bulk Opening Stock" className="dialog inv-bulk-dialog">
   <header className="dialog-head"><div><p className="eyebrow">STOCK / INVENTORY</p><h2>Bulk Opening Stock</h2></div><button className="outline action-icon" aria-label="Close Bulk Opening Stock" title="Close" disabled={busy} onClick={onClose}><X size={18}/></button></header>
   <p className="inv-note"><ShieldCheck size={18}/> Opening is allowed once per product and branch. Preview does not save anything. All selected rows are posted together or none are saved. No accounting journal is posted.</p>
   <div className="inv-bulk-top">
    <label className="field"><span>Branch *</span><select value={branchId} disabled={busy} onChange={e=>changeBranch(e.target.value)}>{branches.map(b=><option value={b.id} key={b.id}>{b.name} ({b.code})</option>)}</select></label>
    <label className="field"><span>Opening Stock Reference *</span><input maxLength={120} minLength={4} disabled={busy} value={reference} onChange={e=>{setReference(e.target.value);touch();}} placeholder="Opening count document / date"/></label>
   </div>
   <div className="inv-bulk-tabs"><button type="button" className={mode==='QUICK'?'primary':'outline'} disabled={busy} onClick={()=>switchMode('QUICK')}><Table2 size={17}/> Quick Entry</button><button type="button" className={mode==='CSV'?'primary':'outline'} disabled={busy} onClick={()=>switchMode('CSV')}><FileSpreadsheet size={17}/> Import CSV</button></div>
   {mode==='QUICK'?<>
    <div className="inv-bulk-tools"><label className="search"><Search size={17}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} placeholder="Search SKU / product" aria-label="Search Bulk Products"/></label><span className="muted">{selected.length} selected · {rows.length} not initialized</span></div>
    <div className="table-scroll inv-bulk-table"><table><thead><tr><th>Use</th><th>SKU / Product</th><th>Opening Qty</th><th>Actual Unit Cost (RM)</th><th>Reference Cost (RM)</th></tr></thead><tbody>
     {shown.map(r=><tr key={r.id}><td><input type="checkbox" aria-label={`Select ${r.sku}`} checked={r.selected} disabled={busy} onChange={e=>updateRow(r.id,{selected:e.target.checked})}/></td><td><strong>{r.sku}</strong><br/><span>{r.product_name}</span></td><td><input className="inv-bulk-money" inputMode="decimal" placeholder="Leave blank to skip" value={r.quantity} disabled={busy} onChange={e=>updateRow(r.id,{quantity:e.target.value,selected:e.target.value.trim()!==''})} onBlur={()=>{if(exactNumber(r.quantity))setRows(old=>old.map(row=>row.id===r.id?{...row,quantity:twoDecimals(r.quantity)}:row));}} aria-label={`Opening quantity for ${r.sku}`}/></td><td><input className="inv-bulk-money" inputMode="decimal" value={r.unitCost} disabled={busy} onChange={e=>updateRow(r.id,{unitCost:e.target.value})} onBlur={()=>{if(exactNumber(r.unitCost))setRows(old=>old.map(row=>row.id===r.id?{...row,unitCost:twoDecimals(r.unitCost)}:row));}} aria-label={`Actual Unit Cost for ${r.sku}`}/></td><td>{referenceCostForProduct(referenceCosts,r.id)??'—'}</td></tr>)}
     {!shown.length&&<tr><td colSpan="5" className="empty">No uninitialized products match this search.</td></tr>}
    </tbody></table></div>
    <div className="inv-bulk-pagination"><span className="muted">Page {page+1} / {pages} · up to 1,000 products per batch</span><div><button type="button" className="outline" disabled={!page||busy} onClick={()=>setPage(x=>x-1)} aria-label="Previous Page"><ChevronLeft size={17}/></button><button type="button" className="outline" disabled={page>=pages-1||busy} onClick={()=>setPage(x=>x+1)} aria-label="Next Page"><ChevronRight size={17}/></button></div></div>
   </>:<div className="inv-bulk-import">
    <p className="muted">Download the branch-specific template. Fill <b>Opening Qty</b> and verify <b>Actual Unit Cost (RM)</b>. Blank quantities are skipped; explicit 0.00 initializes stock at zero. Leave all other columns unchanged.</p>
    <div className="inv-bulk-import-actions"><button className="outline" type="button" disabled={busy||!branch||!rows.length} onClick={()=>downloadTemplate(branch,rows,referenceCosts)}><Download size={17}/> CSV Template ({Math.min(rows.length,MAX)} products)</button><label className="inv-bulk-file"><Upload size={17}/> Choose CSV<input type="file" accept=".csv,text/csv" onChange={loadCsv} disabled={busy}/></label></div>
    <p className="muted">{filename||'No CSV selected'} · Maximum 1,000 rows / 2 MiB. Preview verifies each SKU against the selected branch.</p>
   </div>}
   <p className="muted inv-bulk-warning"><AlertTriangle size={16}/> Product Reference Purchase Cost is a suggestion only. Confirm the genuine Actual Unit Cost; Moving Weighted Average will be calculated from the posted opening value. An opening quantity of 0.00 must have a 0.00 actual unit cost.</p>
   {error&&<p role="alert" className="inv-bulk-error">{error}</p>}
   {preview&&<div className="inv-bulk-preview"><h3>Server Preview — {preview.canConfirm?'Ready to Confirm':'Errors to Correct'}</h3>
    <div className="inv-bulk-summary"><span><b>{preview.validCount}</b> valid</span><span><b>{preview.errorCount}</b> errors</span><span><b>{preview.totals.quantity}</b> total qty</span><span><b>RM {preview.totals.value}</b> total value</span></div>
    {preview.errors?.length>0&&<div className="inv-bulk-errors"><strong>Row Errors</strong>{preview.errors.slice(0,50).map((r,i)=><p key={i}>Row {r.line} · {r.sku||'—'}: {r.errors.join(', ')}</p>)}{preview.errors.length>50&&<p>Additional {preview.errors.length-50} rows require correction.</p>}</div>}
    {preview.rows?.length>0&&<div className="table-scroll inv-bulk-preview-table"><table><thead><tr><th>SKU / Product</th><th>Qty</th><th>Actual Cost (RM)</th><th>Opening Value (RM)</th></tr></thead><tbody>{preview.rows.map(r=><tr key={r.sku}><td>{r.sku} — {r.productName}</td><td>{r.quantity}</td><td>{r.actualUnitCost}</td><td>{r.openingValue}</td></tr>)}</tbody></table></div>}
    {preview.canConfirm&&<label className="inv-bulk-ack"><input type="checkbox" checked={acknowledged} disabled={busy} onChange={e=>setAcknowledged(e.target.checked)}/> I have checked the branch, physical opening quantities and actual unit costs. I understand these entries cannot be edited or deleted.</label>}
   </div>}
   <div className="dialog-actions inv-bulk-actions"><button className="outline" type="button" disabled={busy} onClick={onClose}>Cancel</button><button className="outline" type="button" disabled={busy||!branch||reference.trim().length<4||(mode==='QUICK'?!validSelection:!csvText)} onClick={checkPreview}><Search size={17}/>{busy?'Checking...':'Preview'}</button><button className="primary" type="button" disabled={busy||!preview?.canConfirm||!acknowledged} onClick={postBatch}><CheckCircle2 size={17}/>{busy?'Posting...':`Confirm ${preview?.validCount||0} Opening Stocks`}</button></div>
  </section>
 </div>;
}
