// Inventory Foundation R1 — real tenant/branch opening and append-only balance views.
// No stock receipt, adjustment, sale or accounting posting is generated from this page.
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Boxes,Search,RefreshCw,Plus,History,X,Save,PackageCheck,AlertTriangle,Download,Eye,Calculator} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './Inventory.css';

const Icon=({icon:Glyph,label,onClick,disabled=false,primary=false})=><button type="button" className={`${primary?'primary':'outline'} action-icon`} aria-label={label} title={label} onClick={onClick} disabled={disabled}><Glyph size={18}/></button>;
// Format DECIMAL data as strings to avoid JavaScript floating-point cent loss.
const centsOf=value=>{const m=String(value??'0').match(/^(-?)(\d+)(?:\.(\d+))?$/);if(!m)return null;const fraction=m[3]||'';const scaled=BigInt(m[2])*100n+BigInt((fraction+'00').slice(0,2))+(fraction.length>2&&fraction[2]>='5'?1n:0n);return m[1]? -scaled:scaled;};
const formatCents=cents=>{const negative=cents<0n;const n=negative?-cents:cents;return `${negative?'-':''}${(n/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${(n%100n).toString().padStart(2,'0')}`;};
const decimal=value=>{if(value===null||value===undefined)return '—';const cents=centsOf(value);return cents===null?String(value):formatCents(cents);};
// Inventory inputs and DB now require two decimal places; no silent rounding on save.
const normalizeInputDecimal=value=>{const raw=String(value);if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw))return raw;const [whole,fraction='']=raw.split('.');const significant=fraction.replace(/0+$/,'');return `${whole}.${significant.padEnd(2,'0')}`;};
const exact=value=>value===null||value===undefined?'—':decimal(value);
const formatTime=t=>t?String(t).replace('T',' ').slice(0,19):'—';
const csvValue=value=>{const raw=String(value??'');const escaped=/^[\s]*[=+@-]/.test(raw)?`'${raw}`:raw;return `"${escaped.replaceAll('"','""')}"`;};
function downloadCsv(filename,records){const data='\uFEFF'+records.map(row=>row.map(csvValue).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob([data],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}

function OpeningDialog({branches,products,balances,initialBranchId,initialProductId,onClose,onSave,busy}){
 const [branchId,setBranchId]=useState(String(initialBranchId||branches[0]?.id||''));
 const [productId,setProductId]=useState(String(initialProductId||''));
 const [quantity,setQuantity]=useState('0.00');
 const [unitCost,setUnitCost]=useState('0.00');
 const [reference,setReference]=useState('Opening stock count');
 // Preserve the same idempotency key on network errors and retries.
 const [requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const changed=setter=>value=>{setter(value);setRequestKey(crypto.randomUUID());};
 const opened=new Set(balances.filter(x=>String(x.branch_id)===String(branchId)).map(x=>String(x.product_id)));
 const available=products.filter(p=>!opened.has(String(p.id)));
 const selected=available.find(p=>String(p.id)===productId);
 const validQuantity=/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(quantity);
 const validCost=/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(unitCost);
 const valid=Boolean(branchId&&productId&&validQuantity&&validCost&&reference.trim().length>=4&&!(Number(quantity)===0&&Number(unitCost)!==0));
 const submit=e=>{e.preventDefault();if(!valid)return;onSave({branchId:Number(branchId),productId:Number(productId),quantity,unitCost,reference:reference.trim(),requestKey});};
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="dialog wide inv-modal" onSubmit={submit}>
  <div className="dialog-head"><div><p className="eyebrow">INVENTORY / OPENING STOCK</p><h2>Record Opening Stock</h2></div><Icon icon={X} label="Close" onClick={onClose} disabled={busy}/></div>
  <p className="inv-note"><AlertTriangle size={18}/> Opening Stock can be recorded only once per product and branch. It is not an inventory adjustment and does not post an accounting journal.</p>
  <div className="form-two"><label className="field"><span>Branch</span><select required value={branchId} onChange={e=>{setBranchId(e.target.value);setProductId('');setRequestKey(crypto.randomUUID());}} disabled={busy}>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
   <label className="field"><span>Stock-tracked Product</span><select required value={productId} onChange={e=>changed(setProductId)(e.target.value)} disabled={busy}><option value="">Choose product not initialized</option>{available.map(p=><option key={p.id} value={p.id}>{p.sku} — {p.product_name}</option>)}</select></label>
   <label className="field"><span>Opening Quantity</span><input type="text" inputMode="decimal" required value={quantity} onChange={e=>changed(setQuantity)(e.target.value)} onFocus={e=>{if(e.currentTarget.value==='0.00')e.currentTarget.select();}} onBlur={()=>setQuantity(current=>normalizeInputDecimal(current))} disabled={busy} aria-invalid={!validQuantity}/></label>
   <label className="field"><span>Actual Unit Cost (RM)</span><input type="text" inputMode="decimal" required value={unitCost} onChange={e=>changed(setUnitCost)(e.target.value)} onFocus={e=>{if(e.currentTarget.value==='0.00')e.currentTarget.select();}} onBlur={()=>setUnitCost(current=>normalizeInputDecimal(current))} disabled={busy} aria-invalid={!validCost}/></label></div>
  <label className="field"><span>Opening Stock Reference (min. 4 characters)</span><input required minLength={4} maxLength={120} value={reference} onChange={e=>changed(setReference)(e.target.value)} disabled={busy} placeholder="Example: Opening count 2026-11-02"/></label>
  {selected&&<p className="muted">Selected: {selected.sku} · {selected.product_name}. Reference Purchase Cost is not used to determine the actual opening cost.</p>}
  <p className="inv-note">Opening quantity × actual unit cost determines the initial carrying value. Verify stock count and cost before saving; opening entries cannot be edited or deleted.</p>
  <div className="dialog-actions"><button type="button" className="outline" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="primary" disabled={busy||!valid}><Save size={17}/>{busy?'Saving...':'Save'}</button></div>
 </form></div>;
}
function LedgerDialog({movements,branches,onClose}){
 const nameById=new Map(branches.map(b=>[String(b.id),b.name]));
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog wide inv-ledger-dialog"><div className="dialog-head"><div><p className="eyebrow">INVENTORY / AUDIT</p><h2>Stock Movement Ledger</h2></div><Icon icon={X} label="Close" onClick={onClose}/></div>
  <p className="muted">Recorded movements are append-only. R1 contains physical Opening Stock; sale, receive and adjustment posting are not enabled.</p>
  <div className="table-scroll"><table><thead><tr>{['Time','Branch','Product','Movement','Qty Change','Value Change (RM)','Qty After','Total (RM)','Reference','Recorded By'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{formatTime(m.created_at)}</td><td>{nameById.get(String(m.branch_id))||m.branch_id}</td><td>{m.product_name}</td><td><span className="pill good">{m.movement_type}</span></td><td className="inv-numeric">{exact(m.quantity_delta)}</td><td className="inv-numeric">{decimal(m.value_delta)}</td><td className="inv-numeric">{exact(m.quantity_after)}</td><td className="inv-numeric">{decimal(m.carrying_value_after)}</td><td>{m.reference}</td><td>{m.actor_name}</td></tr>)}{!movements.length&&<tr><td colSpan="10" className="empty">No inventory movements recorded.</td></tr>}</tbody></table></div>
 </div></div>;
}
export default function Inventory({profile,notify}){
 const permitted=code=>profile.user.permissions.includes(code);
 const canOpen=permitted('inventory.opening')&&['OWNER','ADMIN'].includes(String(profile.user.role||'').toUpperCase());
 const canAudit=permitted('inventory.audit');
 const [balances,setBalances]=useState([]),[movements,setMovements]=useState([]),[branches,setBranches]=useState([]),[products,setProducts]=useState([]);
 const [branchFilter,setBranchFilter]=useState('ALL'),[statusFilter,setStatusFilter]=useState('ALL'),[search,setSearch]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[openDialog,setOpenDialog]=useState(null),[ledger,setLedger]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const [result,meta,activity]=await Promise.all([request('/inventory/balances'),request('/inventory/meta'),canAudit?request('/inventory/movements'):Promise.resolve({movements:[]})]);
   setBalances(result.balances||[]);setBranches(meta.branches||[]);setProducts(meta.products||[]);setMovements(activity.movements||[]);
  }catch(e){notify(e.message,true);}finally{setLoading(false);}
 },[profile,notify,canAudit]);
 useEffect(()=>{load();},[load]);
 const branchIds=branchFilter==='ALL'?branches.map(b=>String(b.id)):[branchFilter];
 const balanceLookup=useMemo(()=>new Map(balances.map(x=>[`${x.branch_id}:${x.product_id}`,x])),[balances]);
 const catalogRows=useMemo(()=>{
  // A product without a balance is explicitly UNINITIALIZED rather than silently zero.
  if(!products.length)return balances.filter(x=>branchFilter==='ALL'||String(x.branch_id)===branchFilter).map(x=>({...x,initialized:true,branch_name:branches.find(b=>String(b.id)===String(x.branch_id))?.name||x.branch_id}));
  return branchIds.flatMap(branchId=>products.map(p=>{
   const balance=balanceLookup.get(`${branchId}:${p.id}`);
   return {branch_id:branchId,product_id:String(p.id),sku:p.sku,product_name:p.product_name,quantity_on_hand:balance?.quantity_on_hand??null,average_cost:balance?.average_cost??null,carrying_value:balance?.carrying_value??null,updated_at:balance?.updated_at??null,branch_name:branches.find(b=>String(b.id)===branchId)?.name||branchId,initialized:Boolean(balance),min_stock_qty:p.min_stock_qty??null};
  }));
 },[products,branchIds.join(','),balances,branches,balanceLookup]);
 const filtered=useMemo(()=>catalogRows.filter(r=>{
  const status=r.initialized?(r.min_stock_qty!==null&&Number(r.quantity_on_hand)<=Number(r.min_stock_qty)?'LOW':'INITIALIZED'):'NOT_INITIALIZED';
  const statusOk=statusFilter==='ALL'||(statusFilter==='INITIALIZED'&&r.initialized)||(statusFilter===status);
  return statusOk&&`${r.sku} ${r.product_name} ${r.branch_name}`.toLowerCase().includes(search.trim().toLowerCase());
 }),[catalogRows,statusFilter,search]);
 const countInitialized=catalogRows.filter(x=>x.initialized).length;
 const stockValue=balances.filter(x=>branchFilter==='ALL'||String(x.branch_id)===branchFilter).reduce((total,x)=>total+(centsOf(x.carrying_value)||0n),0n);
 async function saveOpening(body){setBusy(true);try{const result=await request('/inventory/opening',{method:'POST',body});notify(result.idempotent?'Opening Stock already recorded.':'Opening Stock successfully recorded.');setOpenDialog(null);await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 const exportBalances=()=>downloadCsv('tpos-inventory-balances.csv',[['SKU','Product','Branch','Status','QOH','Cost (RM)','Total (RM)'],...filtered.map(r=>[r.sku,r.product_name,r.branch_name,r.initialized?'INITIALIZED':'NOT INITIALIZED',r.initialized?decimal(r.quantity_on_hand):'',r.initialized?decimal(r.average_cost):'',r.initialized?decimal(r.carrying_value):''])]);
 return <main className="page inv-page"><div className="page-head"><div><p className="eyebrow">TRANSACTIONS / INVENTORY</p><h1>Stock / Inventory</h1><p className="muted">Opening Stock, live branch balances and append-only stock movements.</p></div><div className="actions"><Icon icon={RefreshCw} label="Refresh Inventory" onClick={()=>refreshPage(load,notify)} disabled={loading}/><Icon icon={Download} label="Export Visible Balances CSV" onClick={exportBalances} disabled={loading}/>{canAudit&&<Icon icon={History} label="Stock Movement Ledger" onClick={()=>setLedger(true)}/>} {canOpen&&<Icon icon={Plus} label="Record Opening Stock" primary onClick={()=>setOpenDialog({})} disabled={loading||!branches.length||!products.length}/>}</div></div>
 <div className="stat-grid"><div className="stat"><Boxes size={19}/><span>Initialized Product / Branch</span><b>{countInitialized}</b></div><div className="stat"><AlertTriangle size={19}/><span>Not Initialized</span><b>{Math.max(0,catalogRows.length-countInitialized)}</b></div><div className="stat"><Calculator size={19}/><span>Inventory Carrying Value</span><b>RM {formatCents(stockValue)}</b></div><div className="stat"><PackageCheck size={19}/><span>Accounting Posting</span><b className="inv-status-text">Not Connected</b></div></div>
 <div className="table-panel"><div className="tools inv-tools"><div className="search"><Search size={17}/><input value={search} aria-label="Search Inventory Products" placeholder="Search SKU, product or branch..." onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filter Inventory Branch" value={branchFilter} onChange={e=>setBranchFilter(e.target.value)}><option value="ALL">All Branches</option>{branches.map(b=><option key={b.id} value={String(b.id)}>{b.name}</option>)}</select><select aria-label="Filter Inventory Status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">All Stock Status</option><option value="INITIALIZED">Initialized</option><option value="NOT_INITIALIZED">Not Initialized</option><option value="LOW">At / Below Minimum</option></select></div>
 <div className="table-scroll"><table><thead><tr>{['SKU','Product','Branch','Status','QOH','Cost (RM)','Total (RM)','', 'Actions'].map((h,i)=><th key={i} className={i>=4&&i<=6?'inv-numeric':undefined}>{h}</th>)}</tr></thead><tbody>{filtered.map(r=><tr key={`${r.branch_id}:${r.product_id}`}><td><strong>{r.sku}</strong></td><td>{r.product_name}</td><td>{r.branch_name}</td><td><span className={`pill ${r.initialized?'good':'off'}`}>{r.initialized?'INITIALIZED':'NOT INITIALIZED'}</span></td><td className="inv-numeric">{r.initialized?decimal(r.quantity_on_hand):'—'}</td><td className="inv-numeric">{r.initialized?decimal(r.average_cost):'—'}</td><td className="inv-numeric">{r.initialized?decimal(r.carrying_value):'—'}</td><td title={r.updated_at?`Updated: ${formatTime(r.updated_at)}`:undefined}></td><td>{r.initialized&&canAudit?<Icon icon={Eye} label={`View Movement Ledger for ${r.sku}`} onClick={()=>{setLedger(true);}}/>:canOpen&&!r.initialized?<Icon icon={Plus} label={`Open Stock for ${r.sku}`} onClick={()=>setOpenDialog({branchId:String(r.branch_id),productId:String(r.product_id)})}/>:null}</td></tr>)}{!filtered.length&&<tr><td colSpan="9" className="empty">{loading?'Loading inventory...':'No matching stock records.'}</td></tr>}</tbody></table></div></div>
 {canOpen&&openDialog&&<OpeningDialog branches={branches} products={products} balances={balances} initialBranchId={openDialog.branchId} initialProductId={openDialog.productId} busy={busy} onSave={saveOpening} onClose={()=>setOpenDialog(null)}/>} {canAudit&&ledger&&<LedgerDialog movements={movements} branches={branches} onClose={()=>setLedger(false)}/>}
 </main>;
}
