import {useCallback,useEffect,useState} from 'react';
import {Building2,RefreshCw,Save,History,Info,X} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './CompanyProfile.css';
const identityFields=[['businessName','Business Name'],['businessType','Business Type'],['ssmRegistrationNumber','SSM / Business Registration Number'],['ssmOldRegistrationNumber','Old SSM Number'],['tradingName','Trading Name']];
const businessTypes=['RESTAURANT','GROCERY','RETAIL','MINI_MARKET','CAFE','FOOD_TRUCK','STREET_FOOD'];
const fields=[
 ['phone','Business Phone'],['email','Contact Email'],['addressLine1','Address 1'],
 ['addressLine2','Address 2'],['addressLine3','Address 3'],['postcode','Postcode'],
 ['city','City'],['state','State'],['country','Country (ISO 2-letter code)'],['tin','TIN (LHDN)']
];
export default function CompanyProfile({notify}){
 const [profile,setProfile]=useState(null),[form,setForm]=useState(null),[canManage,setCanManage]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[audit,setAudit]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{const data=await request('/company-profile');setProfile(data.profile);setForm(data.profile);setCanManage(data.canManage);}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{void load();},[load]);
 async function save(e){e.preventDefault();if(!form||!canManage)return;
  setBusy(true);try{const body=Object.fromEntries([...identityFields,...fields].map(([key])=>[key,String(form[key]||'').trim()]));
   const data=await request('/company-profile',{method:'PUT',body});setProfile(data.profile);setForm(data.profile);notify('Company Profile saved successfully.');
  }catch(e){notify(e.message,true);}finally{setBusy(false);}
 }
 async function showAudit(){try{const data=await request('/company-profile/audit');setAudit(data.logs);}catch(e){notify(e.message,true);}}
 return <main className="page company-profile-page">
  <div className="company-profile-top"><div><span className="eyebrow">SETTINGS / COMPANY PROFILE</span><h1><Building2 size={26}/> Company Profile</h1><p>Tenant company information used by receipt settings and future MyInvois integration.</p></div><div className="company-profile-actions"><button type="button" className="outline action-icon" title="Refresh" aria-label="Refresh" disabled={loading||busy} onClick={()=>refreshPage(load,notify)}><RefreshCw size={18}/></button><button type="button" className="outline action-icon" title="Activity Log" aria-label="Activity Log" onClick={showAudit}><History size={18}/></button></div></div>
  {loading&&!profile?<p>Loading Company Profile...</p>:form&&<form onSubmit={save} className="company-profile-card">
   <div className="company-profile-section-head"><h2>Business Identity</h2><span>{canManage?'Owner / Admin editable':'Read-only'}</span></div>
   <div className="company-profile-grid">
    {identityFields.map(([key,label])=><label key={key}><span>{label}</span>{key==='businessType'?<select value={form[key]||''} onChange={e=>setForm(prev=>({...prev,[key]:e.target.value}))} disabled={!canManage||busy}>{businessTypes.map(t=><option value={t} key={t}>{t.replaceAll('_',' ')}</option>)}</select>:<input value={form[key]||''} onChange={e=>setForm(prev=>({...prev,[key]:e.target.value}))} readOnly={!canManage||busy} maxLength={key==='businessName'||key==='tradingName'?220:100} required={['businessName','ssmRegistrationNumber'].includes(key)}/>}</label>)}
   </div>
   <div className="company-profile-notice"><Info size={17}/><span>Identity edits are recorded in Activity Log. Business Name and Business Type are synchronized with Central DB. SSM / Business Registration Number refers to one legal registration; SST numbers remain in GST / SST Settings. Changing Business Type may affect POS behavior.</span></div>
   <div className="company-profile-section-head"><h2>Address, Contact &amp; LHDN TIN</h2><span>{canManage?'Owner / Admin editable':'Read-only'}</span></div>
   <div className="company-profile-grid">{fields.map(([key,label])=><label key={key}><span>{label}</span><input name={key} value={form[key]||''} onChange={e=>setForm(prev=>({...prev,[key]:e.target.value}))} readOnly={!canManage||busy} maxLength={key==='email'?254:key==='phone'?40:key==='tin'?80:key==='country'?2:key==='postcode'?20:['city','state'].includes(key)?120:255} required={['email','addressLine1','postcode','city','state','country'].includes(key)} placeholder={key==='country'?'MY':undefined}/></label>)}</div>
   <div className="company-profile-footer"><p>Company TIN is stored in Company Registration and will be used for future MyInvois. This page does not enable MyInvois or change POS receipts.</p>{canManage&&<button type="submit" className="primary" disabled={busy||loading||JSON.stringify(profile)===JSON.stringify(form)}><Save size={17}/>{busy?'Saving...':'Save'}</button>}</div>
  </form>}
  {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><section className="dialog wide company-profile-audit"><div className="dialog-head"><h2>Company Profile Activity Log</h2><button type="button" className="icon-button" aria-label="Close" onClick={()=>setAudit(null)}><X size={19}/></button></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Action By</th><th>Changed Fields</th></tr></thead><tbody>{audit.map(row=>{const prev=typeof row.previousData==='string'?JSON.parse(row.previousData):row.previousData;const next=typeof row.nextData==='string'?JSON.parse(row.nextData):row.nextData;return <tr key={row.id}><td>{row.recordedAt}</td><td>{row.actorName}</td><td>{Object.keys(next||{}).filter(k=>prev?.[k]!==next[k]).join(', ')||'No changes'}</td></tr>;})}{!audit.length&&<tr><td colSpan="3">No changes recorded.</td></tr>}</tbody></table></div></section></div>}
 </main>;
}
