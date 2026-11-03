import {refreshPage} from './refresh-page.js';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Wallet,CreditCard,QrCode,Landmark,ShieldCheck,RefreshCw,History,Save,ImagePlus,Trash2,Eye,Pencil,LockKeyhole,CheckCircle2,X,AlertTriangle} from 'lucide-react';
import {request,apiOrigin} from './api.js';
import './PaymentMethods.css';

const definitions=[
 {code:'CASH',label:'Cash',group:'STANDARD',icon:Wallet,description:'Cash sales are reconciled with Cash Shifts.'},
 {code:'DEBIT_CARD',label:'Debit Card',group:'STANDARD',icon:CreditCard,description:'Card terminal payments; settlement integration follows POS.'},
 {code:'CREDIT_CARD',label:'Credit Card',group:'STANDARD',icon:CreditCard,description:'Card terminal payments; settlement integration follows POS.'},
 {code:'BANK_TRANSFER',label:'Bank Transfer',group:'STANDARD',icon:Landmark,description:'Bank transfer reference and confirmation will be handled by POS.'},
 {code:'DUITNOW_QR',label:'DuitNow QR',group:'DIGITAL',icon:QrCode,description:'Static QR image and bank/provider API configuration.'},
 {code:'EWALLET',label:'E-Wallet',group:'DIGITAL',icon:QrCode,description:'Provider image and API configuration.'},
 {code:'SARA_MYKASIH',label:'SARA (MyKasih / MyKad)',group:'SARA',icon:ShieldCheck,description:'Only approved MyKasih merchants with authorized terminal integration.'}
];
const blank={isActive:false,providerName:'',providerApiUrl:'',merchantRef:'',terminalRef:'',apiKey:'',clearApiKey:false};
const configOf=r=>({...blank,isActive:!!r.isActive,providerName:r.providerName||'',providerApiUrl:r.providerApiUrl||'',merchantRef:r.merchantRef||'',terminalRef:r.terminalRef||''});
function Action({Icon,label,onClick,disabled=false}){return <button type="button" className="pm-icon-btn" title={label} aria-label={label} disabled={disabled} onClick={onClick}><Icon size={18}/></button>;}
const errorText=e=>({PAYMENT_ENCRYPTION_KEY_NOT_CONFIGURED:'Configure PAYMENT_METHODS_ENCRYPTION_KEY in backend/.env before saving API credentials.',SARA_PROVIDER_INTEGRATION_REQUIRED:'SARA cannot be activated until an official MyKasih integration is verified.',IMAGE_TOO_LARGE_OR_INVALID:'Image must be valid and no larger than 1 MB.',IMAGE_SIGNATURE_MISMATCH:'Image content does not match its file type.'}[e?.message]||e?.message||'Request failed');
function SettingInputs({value,onChange,digital=false,sara=false,hasApiKey=false}){
 const change=(name,v)=>onChange({...value,[name]:v});
 return <div className="pm-form-grid">
  <label className="pm-field"><span>{digital?'Bank / E-Wallet Provider':'Provider / Bank (optional)'}</span><input value={value.providerName} onChange={e=>change('providerName',e.target.value)} maxLength={160} placeholder={digital?'Bank or E-Wallet provider':'Optional provider name'}/></label>
  <label className="pm-field"><span>{sara?'Authorized Merchant ID (future)':'Merchant / Account Reference (optional)'}</span><input value={value.merchantRef} onChange={e=>change('merchantRef',e.target.value)} maxLength={160}/></label>
  <label className="pm-field"><span>{sara?'Authorized Terminal ID (future)':'Terminal / Reference ID (optional)'}</span><input value={value.terminalRef} onChange={e=>change('terminalRef',e.target.value)} maxLength={160}/></label>
  <label className="pm-field"><span>Provider API URL (HTTPS)</span><input value={value.providerApiUrl} onChange={e=>change('providerApiUrl',e.target.value)} type="url" maxLength={500} placeholder="https://api.provider.example"/></label>
  {digital&&<label className="pm-field pm-field-wide"><span>Provider API Key / Secret (optional)</span><input type="password" value={value.apiKey} onChange={e=>change('apiKey',e.target.value)} placeholder={hasApiKey?'Saved securely — enter only to replace':'Requires configured backend encryption key'} autoComplete="off" maxLength={4096}/><small>{hasApiKey?'A key is saved; it is never returned by the server.':'No key saved.'}</small>{hasApiKey&&<span className="pm-check"><input aria-label="Clear saved API key" type="checkbox" checked={value.clearApiKey} onChange={e=>change('clearApiKey',e.target.checked)}/> Clear saved API key</span>}</label>}
 </div>;
}
function ImageEditor({method,branchId,onUploaded,onError,canManage}){
 const [preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{let url=null,cancel=false;setPreview(null);
  if(!method.hasImage)return;
  fetch(`${apiOrigin}/api/v2/payment-methods/${branchId}/${method.methodCode}/image?refresh=${reload}`,{credentials:'include'}).then(r=>{if(!r.ok)throw Error('IMAGE_NOT_FOUND');return r.blob();}).then(blob=>{url=URL.createObjectURL(blob);if(!cancel)setPreview(url);else URL.revokeObjectURL(url);}).catch(()=>{});
  return()=>{cancel=true;if(url)URL.revokeObjectURL(url);};
 },[branchId,method.methodCode,method.hasImage,reload]);
 async function upload(e){const f=e.target.files?.[0];e.target.value='';if(!f)return;
  if(f.size>1048576){onError('Maximum 1 MB image.');return;}
  if(!['image/png','image/jpeg','image/webp'].includes(f.type)){onError('Select PNG, JPG or WebP.');return;}
  setBusy(true);try{const encoded=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(f);});await request(`/payment-methods/${branchId}/${method.methodCode}/image`,{method:'POST',body:{mimeType:f.type,base64:encoded}});await onUploaded();setReload(v=>v+1);}catch(err){onError(errorText(err));}finally{setBusy(false);}}
 async function remove(){setBusy(true);try{await request(`/payment-methods/${branchId}/${method.methodCode}/image`,{method:'DELETE',body:{}});await onUploaded();setReload(v=>v+1);}catch(err){onError(errorText(err));}finally{setBusy(false);}}
 return <div className="pm-upload-box"><p className="pm-input-title">1. Choose File — QR / Provider Image</p>{preview?<img className="pm-upload-preview" src={preview} alt={`${method.methodCode} image`}/>:<div className="pm-upload-empty"><ImagePlus size={24}/><span>No image uploaded</span></div>}
  {canManage&&<div className="pm-upload-actions"><label className="pm-upload-choice"><ImagePlus size={16}/>{busy?'Uploading...':'Choose File'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload}/></label>{method.hasImage&&<Action Icon={Trash2} label="Remove uploaded image" disabled={busy} onClick={remove}/>}</div>}
  <small>PNG, JPEG or WebP · Maximum 1 MB · Tenant-isolated</small>
 </div>;
}
function DigitalPanel({method,branchId,canManage,save,reload,onError,busy}){
 const [draft,setDraft]=useState(()=>configOf(method));
 useEffect(()=>{setDraft(configOf(method));},[method.id,method.isActive,method.providerName,method.providerApiUrl,method.merchantRef,method.terminalRef]);
 const Icon=method.methodCode==='DUITNOW_QR'?QrCode:Wallet;
 return <section className="pm-digital-channel"><div className="pm-channel-top"><div className="pm-channel-heading"><Icon size={19}/><div><strong>{method.methodCode==='DUITNOW_QR'?'DuitNow QR':'E-Wallet'}</strong><small>Provider integration: Not Connected</small></div></div><button type="button" disabled={!canManage||busy} className={`pm-state ${draft.isActive?'pm-on':'pm-off'}`} onClick={()=>{const v={...draft,isActive:!draft.isActive};setDraft(v);save(method,v);}}>{draft.isActive?'ACTIVE':'INACTIVE'}</button></div>
 <div className="pm-digital-columns"><ImageEditor method={method} branchId={branchId} canManage={canManage} onUploaded={reload} onError={onError}/><div className="pm-api-box"><p className="pm-input-title">2. Provider API / Bank Details</p><SettingInputs value={draft} onChange={setDraft} digital hasApiKey={method.hasApiKey}/>{canManage&&<div className="pm-form-footer"><button className="primary" type="button" disabled={busy} onClick={()=>save(method,draft)}><Save size={16}/> Save {method.methodCode==='DUITNOW_QR'?'DuitNow':'E-Wallet'} Settings</button></div>}</div></div>
 </section>;
}
function EditDialog({method,onClose,onSave,busy}){const [form,setForm]=useState(()=>configOf(method));const sara=method.methodCode==='SARA_MYKASIH';return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="dialog pm-edit-dialog" onSubmit={e=>{e.preventDefault();onSave(method,form);}}><div className="dialog-head"><div><p className="eyebrow">PAYMENT METHODS / SETTINGS</p><h2>{definitions.find(d=>d.code===method.methodCode)?.label||method.methodCode}</h2></div><Action Icon={X} label="Close" onClick={onClose} disabled={busy}/></div>
 <div className="pm-edit-status"><label className="pm-check"><input type="checkbox" checked={form.isActive} onChange={e=>setForm(s=>({...s,isActive:e.target.checked}))} disabled={sara}/> Active Payment Method</label>{sara&&<small>SARA requires authorized MyKasih integration. Activation is locked until a verified adapter is available.</small>}</div><SettingInputs value={form} onChange={setForm} sara={sara}/><p className="pm-info">Configuration only. Payment processing, bank responses and POS settlement are not connected.</p><div className="dialog-actions"><Action Icon={X} label="Cancel" onClick={onClose}/><button className="primary" type="submit" disabled={busy}><Save size={17}/>Save Settings</button></div></form></div>;}
function AuditDialog({logs,onClose}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog wide pm-audit-dialog"><div className="dialog-head"><h2>Payment Methods Activity Log</h2><Action Icon={X} label="Close" onClick={onClose}/></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Branch</th><th>Method</th><th>Action</th><th>Action By</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{l.recorded_at}</td><td>{l.branch_name}</td><td>{l.method_code}</td><td>{l.action_type.replaceAll('_',' ')}</td><td>{l.actor_name}</td></tr>)}{!logs.length&&<tr><td colSpan="5">No changes recorded.</td></tr>}</tbody></table></div></div></div>;}
export default function PaymentMethods({profile,notify}){
 const [data,setData]=useState({branches:[],methods:[],canManage:false}),[branch,setBranch]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[editing,setEditing]=useState(null),[logs,setLogs]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{const next=await request('/payment-methods');setData(next);setBranch(v=>next.branches.some(b=>String(b.id)===v)?v:String(next.branches[0]?.id||''));}catch(e){notify(errorText(e),true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const methods=useMemo(()=>data.methods.filter(m=>m.branchId===branch),[data.methods,branch]);
 const byCode=code=>methods.find(m=>m.methodCode===code);
 async function save(method,draft){setBusy(true);try{await request(`/payment-methods/${branch}/${method.methodCode}`,{method:'PUT',body:{...draft,isActive:Boolean(draft.isActive),apiKey:draft.apiKey||undefined,clearApiKey:Boolean(draft.clearApiKey)}});notify('Payment settings saved. Provider integration remains not connected.');setEditing(null);await load();}catch(e){notify(errorText(e),true);}finally{setBusy(false);}}
 async function showAudit(){try{const result=await request('/payment-methods/audit');setLogs(result.logs);}catch(e){notify(errorText(e),true);}}
 const standard=definitions.filter(d=>d.group==='STANDARD');
 return <main className="page pm-page"><div className="page-head"><div><p className="eyebrow">FINANCE / PAYMENT SETTINGS</p><h1>Payment Methods</h1><p className="muted">Branch payment options, digital QR images and provider configuration.</p></div><div className="actions"><Action Icon={RefreshCw} label="Refresh Payment Methods" onClick={()=>refreshPage(load,notify)} disabled={loading}/>{profile.user.permissions.includes('payment_methods.audit')&&<Action Icon={History} label="Payment Activity Log" onClick={showAudit}/>}</div></div>
 <div className="pm-topbar"><label className="pm-field"><span>Branch</span><select value={branch} onChange={e=>setBranch(e.target.value)}>{data.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><div className="pm-top-note"><ShieldCheck size={18}/> Configuration only — POS payments are not connected.</div></div>
 <section className="pm-card"><h2>Standard Payment Methods</h2><p className="muted">Only OWNER/ADMIN can change activation and provider settings.</p><div className="pm-method-grid">{standard.map(def=>{const m=byCode(def.code);if(!m)return null;const Icon=def.icon;return <div className="pm-standard" key={def.code}><div className="pm-method-top"><Icon size={21}/><span className={`pm-pill ${m.isActive?'active':''}`}>{m.isActive?'ACTIVE':'INACTIVE'}</span></div><strong>{def.label}</strong><small>{def.description}</small><div className="pm-standard-footer"><span>Settlement: Pending POS</span>{data.canManage&&<Action Icon={Pencil} label={`Edit ${def.label}`} onClick={()=>setEditing(m)}/>}</div></div>;})}</div></section>
 <section className="pm-card"><h2>DuitNow QR & E-Wallet</h2><p className="muted">Both channels are managed in this one form. Each has its own Active/Inactive control, image and provider API.</p><p className="pm-info"><AlertTriangle size={17}/> Static QR images cannot confirm payment. An API address/key alone does not activate live transactions.</p>{['DUITNOW_QR','EWALLET'].map(code=>{const m=byCode(code);return m?<DigitalPanel key={`${branch}:${code}`} method={m} branchId={branch} canManage={data.canManage} busy={busy} save={save} reload={load} onError={m=>notify(m,true)}/>:null;})}</section>
 <section className="pm-card pm-sara"><div className="pm-sara-top"><div><h2>SARA (MyKasih / MyKad)</h2><p className="muted">Government assistance payments for approved merchants and eligible products only.</p></div><span className="pm-pill">INACTIVE — OFFICIAL INTEGRATION REQUIRED</span></div><p className="pm-info">MyKad authentication and product eligibility are verified through the authorized MyKasih channel; no payment can be approved or posted here.</p>{data.canManage&&byCode('SARA_MYKASIH')&&<button className="outline" type="button" onClick={()=>setEditing(byCode('SARA_MYKASIH'))}><Pencil size={16}/> Configure Merchant Details</button>}</section>
 {editing&&<EditDialog method={editing} onClose={()=>setEditing(null)} onSave={save} busy={busy}/>} {logs&&<AuditDialog logs={logs} onClose={()=>setLogs(null)}/>}</main>;
}
