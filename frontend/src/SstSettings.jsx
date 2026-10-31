import {useCallback,useEffect,useState} from 'react';
import {RefreshCw,Save,History,ShieldCheck,ReceiptText,X,Info} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import {formatSstTaxRate} from './sst-rate-format.js';
import './SstSettings.css';
const types=[{type:'SALES_TAX',heading:'SST Sales Tax',registration:'Sales Tax Registration Number',note:'Sales Tax is generally a single-stage tax on taxable locally manufactured or imported goods. Retailers must not add Sales Tax again merely because stock was purchased with tax.'},{type:'SERVICE_TAX',heading:'SST Service Tax',registration:'Service Tax Registration Number',note:'Service Tax applies only to taxable services supplied by a registered person. Verify the correct rate and eligibility for your business with JKDM.'}];
const empty={isEnabled:false,registrationNumber:'',taxRate:'0.00'};
const displayForm=data=>({...empty,...data,taxRate:formatSstTaxRate(data?.taxRate)});
function TaxCard({definition,data,canManage,busy,onSave}){
 const [form,setForm]=useState(()=>displayForm(data));
 useEffect(()=>setForm(displayForm(data)),[data]);
 const update=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 return <article className="sst-card"><div className="sst-card-head"><div><h2>{definition.heading}</h2><p className="sst-card-subtitle">Owner-managed registration and tax activation</p></div><span className={`sst-status ${form.isEnabled?'enabled':'disabled'}`}>{form.isEnabled?'ON':'OFF'}</span></div>
 <label className="sst-switch-row"><span><strong>Enable Tax</strong><small>{form.isEnabled?'Tax applies only to matching Product Master items.':'POS tax amount is RM 0.00.'}</small></span><input aria-label={`Enable ${definition.heading}`} type="checkbox" checked={form.isEnabled} disabled={!canManage||busy} onChange={e=>update('isEnabled',e.target.checked)}/></label>
 <div className="sst-fields"><label><span>{definition.registration}</span><input value={form.registrationNumber} onChange={e=>update('registrationNumber',e.target.value)} maxLength={80} placeholder="Enter your registered SST number" readOnly={!canManage}/></label><label><span>Tax Rate (%)</span><input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={e=>update('taxRate',e.target.value)} onBlur={()=>update('taxRate',formatSstTaxRate(form.taxRate))} readOnly={!canManage}/></label></div>
 <p className="sst-explainer"><Info size={15}/>{definition.note}</p>
 {canManage&&<div className="sst-card-actions"><button className="primary" type="button" disabled={busy} onClick={()=>onSave(definition.type,{...form,taxRate:formatSstTaxRate(form.taxRate)})}><Save size={17}/> Save {definition.heading}</button></div>}</article>;
}
function AuditDialog({logs,onClose}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className="dialog wide sst-dialog"><div className="dialog-head"><h2>GST / SST Settings Activity Log</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Tax</th><th>Action By</th><th>Change</th></tr></thead><tbody>{logs.map(row=><tr key={row.id}><td>{row.recorded_at}</td><td>{row.tax_type.replaceAll('_',' ')}</td><td>{row.actor_name}</td><td>{row.previous_data?.isEnabled?'ON':'OFF'} → {row.next_data?.isEnabled?'ON':'OFF'} · {row.next_data?.taxRate}%</td></tr>)}{logs.length===0&&<tr><td colSpan="4">No changes recorded.</td></tr>}</tbody></table></div></section></div>;}
export default function SstSettings({profile,notify}){
 const [data,setData]=useState({settings:[],canManage:false});const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(true);const [audit,setAudit]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{setData(await request('/sst-settings'));}catch(error){notify(error.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{void load();},[load]);
 async function save(taxType,form){setBusy(true);try{await request(`/sst-settings/${taxType}`,{method:'PUT',body:{isEnabled:Boolean(form.isEnabled),registrationNumber:form.registrationNumber.trim(),taxRate:String(form.taxRate)}});notify('SST settings saved. POS tax quotation will use the updated configuration.');await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function openAudit(){try{const result=await request('/sst-settings/audit');setAudit(result.logs);}catch(e){notify(e.message,true);}}
 const canAudit=profile.user.permissions.includes('sst_settings.audit');
 return <main className="page sst-settings-page"><div className="page-head"><div><p className="eyebrow">FINANCE / TAX SETTINGS</p><h1>GST / SST Settings</h1><p className="muted">Tenant-wide Sales Tax and Service Tax settings, using the registration numbers from your business registration.</p></div><div className="actions"><button className="outline action-icon" type="button" title="Refresh SST Settings" aria-label="Refresh SST Settings" disabled={loading||busy} onClick={()=>refreshPage(load,notify)}><RefreshCw size={18}/></button>{canAudit&&<button className="outline action-icon" title="SST Activity Log" aria-label="SST Activity Log" onClick={openAudit}><History size={18}/></button>}</div></div>
 <div className="sst-guidance"><ShieldCheck size={19}/><div><strong>Separate from LHDN e-Invoice and Service Charge</strong><p>Enable only after verifying JKDM registration and the applicable tax rate. Product Master determines which items are taxable. The POS uses these switches automatically; it does not impose tax when a switch is OFF. GST is not currently configured as an active tax regime.</p></div></div>
 <div className="sst-cards">{types.map(d=><TaxCard key={d.type} definition={d} data={data.settings.find(s=>s.type===d.type)} canManage={data.canManage} busy={busy} onSave={save}/>)}</div>
 <p className="sst-footnote"><ReceiptText size={17}/> Example rates shown in screenshots are illustrative. Consult current JKDM/MySST rules for applicable rates. Saving settings does not register a business with JKDM.</p>
 {audit&&<AuditDialog logs={audit} onClose={()=>setAudit(null)}/>}</main>;
}
