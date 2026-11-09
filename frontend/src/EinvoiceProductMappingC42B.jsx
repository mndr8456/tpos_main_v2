import {useEffect,useState} from 'react';
import {request} from './api.js';
import './EinvoiceProductMappingC42B.css';
const classifications=Array.from({length:45},(_,i)=>String(i+1).padStart(3,'0'));
const descriptions={"001": "Breastfeeding equipment", "002": "Child care centres and kindergartens fees", "003": "Computer, smartphone or tablet", "004": "Consolidated e-Invoice", "005": "Construction materials", "006": "Disbursement", "007": "Donation", "008": "e-Commerce - e-Invoice to buyer / purchaser", "009": "e-Commerce - Self-billed e-Invoice", "010": "Education fees", "011": "Goods on consignment (Consignor)", "012": "Goods on consignment (Consignee)", "013": "Gym membership", "014": "Insurance - Education and medical benefits", "015": "Insurance - Takaful or life insurance", "016": "Interest and financing expenses", "017": "Internet subscription", "018": "Land and building", "019": "Medical examination for learning disabilities", "020": "Medical examination or vaccination expenses", "021": "Medical expenses for serious diseases", "022": "Others", "023": "Petroleum operations", "024": "Private retirement scheme or deferred annuity scheme", "025": "Motor vehicle", "026": "Subscription of books / journals / magazines / newspapers", "027": "Reimbursement", "028": "Rental of motor vehicle", "029": "EV charging facilities", "030": "Repair and maintenance", "031": "Research and development", "032": "Foreign income", "033": "Self-billed - Betting and gaming", "034": "Self-billed - Importation of goods", "035": "Self-billed - Importation of services", "036": "Self-billed - Others", "037": "Self-billed - Monetary payment to agents, dealers or distributors", "038": "Sports equipment and sports facilities", "039": "Supporting equipment for disabled person", "040": "Voluntary contribution to approved provident fund", "041": "Dental examination or treatment", "042": "Fertility treatment", "043": "Treatment and home care nursing", "044": "Vouchers, gift cards, loyalty points, etc", "045": "Self-billed - Non-monetary payment to agents, dealers or distributors"};
export default function EinvoiceProductMappingC42B({notify,canManage}){
 const [ownerAllowed,setOwnerAllowed]=useState(false),[items,setItems]=useState([]),[search,setSearch]=useState(''),[busy,setBusy]=useState(''),[drafts,setDrafts]=useState({});
 const [taxSync,setTaxSync]=useState(null),[taxAck,setTaxAck]=useState(false);
 const [page,setPage]=useState(1),[pageSize,setPageSize]=useState(25),[statusFilter,setStatusFilter]=useState('all'),[total,setTotal]=useState(0),[counts,setCounts]=useState({}),[checked,setChecked]=useState([]),[preview,setPreview]=useState(null),[ack,setAck]=useState(false);
 async function load(term=search,nextPage=page,nextStatus=statusFilter,nextPageSize=pageSize){
  try{const qs=new URLSearchParams({search:term,page:String(nextPage),pageSize:String(nextPageSize),status:nextStatus});
   const result=await request('/einvoice/product-mappings?'+qs);setItems(result.items||[]);setTotal(Number(result.total||0));setCounts(result.counts||{});setOwnerAllowed(Boolean(result.canManage));
  }catch(e){notify(e.message,true);}}
 useEffect(()=>{void load('',1,'all',25);},[]);
 function changeFilter(value){setStatusFilter(value);setPage(1);setChecked([]);setPreview(null);void load(search,1,value,pageSize);}
 function changeSearch(value){setSearch(value);setPage(1);setChecked([]);setPreview(null);void load(value,1,statusFilter,pageSize);}
 function changePage(value){setPage(value);setChecked([]);setPreview(null);void load(search,value,statusFilter,pageSize);}
 function toggleCheck(id){setPreview(null);setChecked(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
 const eligibleItems=items.filter(p=>p.eligible);
 async function bulkPreview(scope){
  if(!canManage||!ownerAllowed)return;
  if(scope==='selected'&&!checked.length){notify('Select eligible products first.',true);return;}
  setBusy('preview');setPreview(null);setAck(false);
  try{const body=scope==='selected'?{scope,productIds:checked}:{scope,search};
   const data=await request('/einvoice/product-mappings/bulk-preview',{method:'POST',body});setPreview(data);
  }catch(e){notify(e.message,true);}finally{setBusy('');}
 }
 async function bulkConfirm(){
  if(!preview||!ack||!preview.ready)return;
  setBusy('bulk-confirm');try{
   const result=await request('/einvoice/product-mappings/bulk-confirm',{method:'POST',body:{candidates:preview.candidates,previewDigest:preview.previewDigest,previewToken:preview.previewToken,acknowledge:true}});
   notify(`${result.confirmed} product mappings confirmed by Owner.`);setPreview(null);setChecked([]);setAck(false);await load();
  }catch(e){notify(e.message,true);setPreview(null);setAck(false);}finally{setBusy('');}
 }
 async function previewProductTaxSync(){
  if(!canManage||!ownerAllowed)return;
  setBusy('tax-sync-preview');setTaxSync(null);setTaxAck(false);
  try{const data=await request('/einvoice/product-mappings/tax-sync-preview',{method:'POST',body:{search}});setTaxSync(data);}
  catch(e){notify(e.message,true);}finally{setBusy('');}
 }
 async function confirmProductTaxSync(){
  if(!taxSync?.candidates?.length||!taxAck||!!busy)return;
  setBusy('tax-sync-confirm');try{
   const result=await request('/einvoice/product-mappings/tax-sync-confirm',{method:'POST',body:{candidates:taxSync.candidates,previewDigest:taxSync.previewDigest,previewToken:taxSync.previewToken,acknowledge:true}});
   notify(`${result.updated} Product Master tax codes synchronized; ${result.reverified} Owner Verified mappings reconfirmed with audit.`);
   setTaxSync(null);setTaxAck(false);setPreview(null);setChecked([]);await load();
  }catch(e){notify(e.message,true);setTaxSync(null);setTaxAck(false);}finally{setBusy('');}
 }
 function update(id,patch){setDrafts(d=>({...d,[id]:{...(d[id]||{}),...patch}}));}
 async function confirm(item){if(!canManage||!ownerAllowed)return;setBusy(item.id);try{
  const selected=drafts[item.id]||{};
  const classificationCode=selected.classificationCode??item.classificationCode??item.suggestedClassificationCode;
  const unitCode=selected.unitCode??item.unitCode??item.suggestedUnitCode;
  const taxTypeCode=selected.taxTypeCode??item.taxTypeCode??item.expectedTaxTypeCode;
  if(!classificationCode||!unitCode){notify('Choose a classification and unit before confirming.',true);return;}
  await request('/einvoice/product-mappings/'+item.id,{method:'PUT',body:{classificationCode,unitCode,taxTypeCode}});
  setDrafts(current=>{const next={...current};delete next[item.id];return next;});
  notify('Product e-Invoice mapping confirmed by Owner.');setChecked([]);setPreview(null);await load();
 }catch(e){notify(e.message,true);}finally{setBusy('');}}
 const editable=Boolean(canManage&&ownerAllowed);
 return <section className="einvoice-settings-card einvoice-mapping-card" aria-labelledby="einvoice-mapping-title" style={{marginTop:16}}>
  <div className="einvoice-settings-section einvoice-mapping-section">
   <h2 id="einvoice-mapping-title">Verified Product e-Invoice Mapping (C4.2B)</h2>
   <p className="einvoice-muted">Owner confirmation is required. Product Master defaults do not count as verification. Mapping changes affect future checkouts only; historical evidence is immutable. MyInvois submission remains disabled.</p>
   <div className="einvoice-mapping-summary"><span>Total: {counts.total??0}</span><span>Eligible: {counts.eligible??0}</span><span>Review required: {counts.review??0}</span><span>Confirmed: {counts.confirmed??0}</span></div>
   <div className="einvoice-mapping-toolbar">
    <label className="einvoice-mapping-search"><span>Search SKU or Product</span><input type="search" value={search} maxLength={80} onChange={e=>changeSearch(e.target.value)} placeholder="Search product"/></label>
    <label className="einvoice-mapping-option">Status<select value={statusFilter} onChange={e=>changeFilter(e.target.value)}><option value="all">All statuses</option><option value="eligible">Eligible</option><option value="unconfirmed">Unconfirmed</option><option value="confirmed">Confirmed</option><option value="reconfirmation">Reconfirmation required</option><option value="review">Review required</option></select></label>
    <label className="einvoice-mapping-option">Per page<select value={pageSize} onChange={e=>{const n=Number(e.target.value);setPageSize(n);setPage(1);setChecked([]);setPreview(null);void load(search,1,statusFilter,n);}}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
    <span className="einvoice-mapping-count">{items.length} of {total} shown</span>
   </div>
   {editable&&<div className="einvoice-mapping-preview" style={{marginBottom:16}}>
    <h3>Product Master MyInvois Tax Synchronization — Owner Review</h3>
    <p>For active products with mismatched tax codes only. The backend derives the proposed code from JKDM (SALES_TAX → 01, SERVICE_TAX → 02, NONE → 06). A previous Owner Verified Mapping is re-confirmed with a new audit revision, never silently overwritten. No previous sale or MyInvois submission is changed.</p>
    <button type="button" className="outline" disabled={!!busy} onClick={previewProductTaxSync}>Scan &amp; Preview Tax Mismatches (max 500 per batch)</button>
    {taxSync&&<div role="region" aria-label="Product Tax Synchronization Preview">
     <p><strong>{taxSync.eligibleTotal} eligible</strong> · {taxSync.aligned} already aligned · {taxSync.blocked.length} require individual review · {taxSync.remainingEligible} eligible in later batches.</p>
     <div className="einvoice-mapping-preview-lines">{taxSync.candidates.map(c=><div key={c.productId}>{c.sku} — {c.productName}: {c.from} → {c.to} ({c.verifiedMappingAction})</div>)}
      {taxSync.blocked.map(c=><div key={c.productId}>{c.sku}: {c.reason}</div>)}</div>
     <label className="einvoice-mapping-ack"><input type="checkbox" checked={taxAck} onChange={e=>setTaxAck(e.target.checked)}/> I am the OWNER. I have reviewed the proposed Product Master changes and any new mapping revisions.</label>
     <div className="einvoice-mapping-bulk-actions"><button type="button" className="outline" disabled={!!busy} onClick={()=>{setTaxSync(null);setTaxAck(false);}}>Cancel</button>
      <button type="button" className="primary" disabled={!!busy||!taxAck||!taxSync.candidates.length} onClick={confirmProductTaxSync}>{busy==='tax-sync-confirm'?'Confirming...':`Confirm Tax Synchronization (${taxSync.candidates.length})`}</button></div>
    </div>}
   </div>}
   {editable&&<div className="einvoice-mapping-bulk-actions">
    <label><input type="checkbox" checked={eligibleItems.length>0&&eligibleItems.every(p=>checked.includes(p.id))} onChange={e=>{setPreview(null);setChecked(v=>e.target.checked?[...new Set([...v,...eligibleItems.map(p=>p.id)])]:v.filter(id=>!eligibleItems.some(p=>p.id===id)));}}/> Select eligible on page</label>
    <span>{checked.length} selected</span>
    <button type="button" className="outline" disabled={!!busy||!checked.length} onClick={()=>bulkPreview('selected')}>Review Selected Mapping</button>
    <button type="button" className="outline" disabled={!!busy} onClick={()=>bulkPreview('allEligible')}>Review All Eligible Matching Search (max 500)</button>
   </div>}
   {preview&&<div className="einvoice-mapping-preview" role="region" aria-label="Bulk mapping preview">
    <h3>Bulk Mapping Preview — No Changes Saved</h3><p>Batch confirmation uses saved Product Master suggestions only. Any dropdown edits must be confirmed individually.</p>
    <p>{preview.selected} examined · {preview.ready} eligible · {preview.rejected.length} rejected · {preview.remainingEligible||0} remaining in later batches</p>
    <div className="einvoice-mapping-preview-lines">{preview.candidates.map(c=><div key={c.productId}>Product {c.productId}: {c.classificationCode} / {c.unitCode} / {c.taxTypeCode}</div>)}
     {preview.rejected.map(r=><div key={r.productId}>Product {r.sku}: {r.reason}</div>)}</div>
    <label className="einvoice-mapping-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I am the OWNER and have reviewed all {preview.ready} eligible mappings for confirmation.</label>
    <div className="einvoice-mapping-bulk-actions"><button type="button" className="outline" onClick={()=>{setPreview(null);setAck(false);}} disabled={!!busy}>Cancel</button><button type="button" className="primary" disabled={!ack||!preview.ready||!!busy} onClick={bulkConfirm}>{busy==='bulk-confirm'?'Confirming...':`Confirm ${preview.ready} Selected Mappings`}</button></div>
   </div>}
   <div className="einvoice-mapping-list">
    {items.map(p=>{
     const d=drafts[p.id]||{};
     const status=p.confirmed?'Confirmed':p.revision?'Reconfirmation required':'Unconfirmed';
     const selectedClassification=d.classificationCode??p.classificationCode??p.suggestedClassificationCode??'';
     const selectedUnit=d.unitCode??p.unitCode??p.suggestedUnitCode??'';
     const selectedTax=d.taxTypeCode??p.taxTypeCode??p.expectedTaxTypeCode??'';
     const usingSuggestion=!p.confirmed&&!p.revision;
     const taxMismatch=Boolean(p.taxTypeMismatch);
     const dirty=Object.keys(d).length>0;
     return <article className="einvoice-mapping-product" key={p.id}>
      {editable&&<label className="einvoice-mapping-select"><input type="checkbox" checked={checked.includes(p.id)} disabled={!p.eligible||!!busy} onChange={()=>toggleCheck(p.id)}/> Select for Bulk Confirmation {p.eligible?'':'(not eligible)'}</label>}
      <div className="einvoice-mapping-product-head">
       <div className="einvoice-mapping-identity"><strong>{p.name}</strong><span>{p.sku}</span></div>
       <div className="einvoice-mapping-meta"><span className="einvoice-mapping-jkdm">JKDM: {p.jkdmTaxType}</span><span className={'einvoice-mapping-status '+(p.confirmed&&!dirty?'is-confirmed':'is-pending')}>{dirty?'Changes not confirmed':status}</span></div>
      </div>
      {usingSuggestion&&<p className="einvoice-mapping-suggestion">Suggested from Product Master only — not Owner Verified. Review every field before Confirm Mapping.</p>}
      {taxMismatch&&<p className="einvoice-mapping-warning">Product Master MyInvois Tax Type does not match JKDM Type. The Tax Type selector follows JKDM; review the Product tax configuration before confirming.</p>}
      <div className="einvoice-mapping-fields">
       <label className="einvoice-mapping-field"><span>LHDN Classification</span><select aria-label={'Classification for '+p.name} disabled={!editable||!!busy} value={selectedClassification} onChange={e=>update(p.id,{classificationCode:e.target.value})}><option value="">Choose classification</option>{classifications.map(code=><option key={code} value={code}>{code} — {descriptions[code]||'See official MyInvois code list'}</option>)}</select></label>
       <label className="einvoice-mapping-field"><span>UBL Unit</span><select aria-label={'UBL unit for '+p.name} disabled={!editable||!!busy} value={selectedUnit} onChange={e=>update(p.id,{unitCode:e.target.value})}><option value="">Choose unit</option><option value="EA">EA — Each</option><option value="SET">SET — Set</option><option value="KGM">KGM — Kilogram</option><option value="LTR">LTR — Litre</option><option value="C62">C62 — One</option></select></label>
       <label className="einvoice-mapping-field"><span>MyInvois Tax Type</span><select aria-label={'Tax type for '+p.name} disabled={!editable||!!busy} value={selectedTax} onChange={e=>update(p.id,{taxTypeCode:e.target.value})}><option value="">Choose tax type</option><option value="01">01 — Sales Tax</option><option value="02">02 — Service Tax</option><option value="06">06 — Not Applicable</option></select></label>
      </div>
      {editable&&<div className="einvoice-mapping-product-foot"><button type="button" className="outline einvoice-mapping-confirm" disabled={!!busy||!selectedClassification||!selectedUnit||!selectedTax} onClick={()=>confirm(p)}>{busy===p.id?'Saving...':p.confirmed&&!dirty?'Reconfirm':'Confirm Mapping'}</button></div>}
     </article>;
    })}
    {!items.length&&<p className="einvoice-mapping-empty">No products found.</p>}
   </div>
   <div className="einvoice-mapping-pagination"><span>Page {page} of {Math.max(1,Math.ceil(total/pageSize))}</span><button type="button" className="outline" disabled={page<=1||!!busy} onClick={()=>changePage(page-1)}>Previous</button><button type="button" className="outline" disabled={page*pageSize>=total||!!busy} onClick={()=>changePage(page+1)}>Next</button></div>
   <p className="einvoice-muted einvoice-mapping-note">Confirm each product only after checking the official MyInvois classification list. Tax type must agree with the product's configured JKDM tax type. Supported unit codes in this phase: EA, SET, KGM, LTR, C62.</p>
  </div>
 </section>;
}
