import {useCallback,useEffect,useState} from 'react';
import {RefreshCw,History,Save,ReceiptText,Info,X} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './ServiceChargeSettings.css';
const blank={isEnabled:false,chargeRate:'0.00',applyDineIn:true,applyTakeAway:false};
export default function ServiceChargeSettings({profile,notify}){
 const [form,setForm]=useState(blank);
 const [canManage,setCanManage]=useState(false);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(false);
 const [audit,setAudit]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{const result=await request('/service-charge');setForm(result.settings);setCanManage(Boolean(result.canManage));}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{void load();},[load]);
 const change=(key,value)=>setForm(old=>({...old,[key]:value}));
 async function save(e){e.preventDefault();if(!canManage)return;setBusy(true);try{
  const normalized={...form,chargeRate:Number(form.chargeRate).toFixed(2)};
  await request('/service-charge',{method:'PUT',body:normalized});
  notify('Service Charge settings saved. POS will use these settings for new quotations.');
  await load();
 }catch(error){notify(error.message,true);}finally{setBusy(false);}}
 async function openAudit(){try{const {logs}=await request('/service-charge/audit');setAudit(logs);}catch(e){notify(e.message,true);}}
 return <main className="page service-charge-page"><div className="page-head"><div><p className="eyebrow">OPERATIONS / BUSINESS SETTINGS</p><h1>Service Charge Settings</h1><p className="muted">Optional business charge. Independent of JKDM Sales Tax and Service Tax.</p></div><div className="actions"><button className="outline action-icon" type="button" title="Refresh Service Charge" aria-label="Refresh Service Charge" onClick={()=>refreshPage(load,notify)} disabled={loading||busy}><RefreshCw size={18}/></button>{profile.user.permissions.includes('service_charge.audit')&&<button className="outline action-icon" type="button" title="Service Charge Activity Log" aria-label="Service Charge Activity Log" onClick={openAudit}><History size={18}/></button>}</div></div>
 <div className="service-charge-info"><Info size={19}/><p><strong>Service Charge is not SST.</strong> The merchant chooses the percentage and order types. It is shown as a separate line in POS and is not added to the JKDM Service Tax base for ordinary F&amp;B orders. By default, it is OFF.</p></div>
 <form className="service-charge-card" onSubmit={save}><div className="service-charge-title"><h2>Merchant Service Charge</h2><span className={form.isEnabled?'service-charge-on':'service-charge-off'}>{form.isEnabled?'ON':'OFF'}</span></div>
 <label className="service-charge-toggle"><span><strong>Enable Service Charge</strong><small>Do not enable unless your business intends to levy this separate charge.</small></span><input type="checkbox" checked={form.isEnabled} onChange={e=>change('isEnabled',e.target.checked)} disabled={!canManage||busy}/></label>
 <label className="service-charge-field"><span>Service Charge Rate (%)</span><input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={form.chargeRate} onChange={e=>change('chargeRate',e.target.value)} onBlur={()=>{if(Number.isFinite(Number(form.chargeRate)))change('chargeRate',Number(form.chargeRate).toFixed(2));}} disabled={!canManage||busy}/></label>
 <fieldset className="service-charge-scopes" disabled={!canManage||busy}><legend>Apply to Order Types</legend><label><input type="checkbox" checked={form.applyDineIn} onChange={e=>change('applyDineIn',e.target.checked)}/> Dine In</label><label><input type="checkbox" checked={form.applyTakeAway} onChange={e=>change('applyTakeAway',e.target.checked)}/> Take Away</label><small>Default: Dine In selected, Take Away not selected. Dine In order/table workflow in POS is still under integration.</small></fieldset>
 <div className="service-charge-footer"><span><ReceiptText size={17}/> Service Charge is calculated after Discount/Voucher, separately from SST, then included before BNM rounding.</span>{canManage&&<button type="submit" className="primary" disabled={busy||loading}><Save size={17}/>{busy?'Saving…':'Save Settings'}</button>}</div></form>
 {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><section className="dialog wide service-charge-log"><div className="dialog-head"><h2>Service Charge Activity Log</h2><button type="button" className="icon-button" aria-label="Close" onClick={()=>setAudit(null)}><X size={19}/></button></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Action By</th><th>Rate</th><th>Status</th></tr></thead><tbody>{audit.map(item=><tr key={item.id}><td>{item.recorded_at}</td><td>{item.actor_name}</td><td>{item.next_data?.chargeRate}%</td><td>{item.next_data?.isEnabled?'ON':'OFF'}</td></tr>)}{!audit.length&&<tr><td colSpan="4">No changes recorded.</td></tr>}</tbody></table></div></section></div>}</main>;
}
