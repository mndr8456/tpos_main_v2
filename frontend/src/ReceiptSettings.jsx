import {useCallback,useEffect,useState} from 'react';
import {ReceiptText,RefreshCw,History,Save,X,Info} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './ReceiptSettings.css';
const fields=[['businessName','Business Name'],['ssmNumber','SSM / Business Registration Number'],['ssmOldNumber','Old SSM Number'],['addressLine1','Address 1'],['addressLine2','Address 2'],['addressLine3','Address 3'],['postcode','Postcode'],['city','City'],['state','State'],['country','Country']];
const present=value=>String(value||'').trim();
export default function ReceiptSettings({notify}){
 const [data,setData]=useState(null),[footer,setFooter]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[audit,setAudit]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{const result=await request('/receipt-settings');setData(result);setFooter(result.footerMessage);}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{void load();},[load]);
 async function save(e){e.preventDefault();if(!data?.canManage||busy)return;
  setBusy(true);try{const result=await request('/receipt-settings',{method:'PUT',body:{footerMessage:footer.trim()}});setData(previous=>({...previous,footerMessage:result.footerMessage}));setFooter(result.footerMessage);notify(result.changed?'Receipt Settings saved successfully.':'No changes to save.');}
  catch(e){notify(e.message,true);}finally{setBusy(false);}
 }
 async function showAudit(){try{const result=await request('/receipt-settings/audit');setAudit(result.logs);}catch(e){notify(e.message,true);}}
 const company=data?.company||{};
 const ssmLine=company.ssmNumber?`${company.ssmNumber}${company.ssmOldNumber?`(${company.ssmOldNumber})`:''}`:(company.ssmOldNumber||'');
 const lines=[company.addressLine1,company.addressLine2,company.addressLine3,[company.postcode,company.city].filter(present).join(' '),[company.state,company.country].filter(present).join(', ')].filter(present);
 return <main className="page receipt-settings-page">
  <div className="receipt-settings-top"><div><span className="eyebrow">SETTINGS / RECEIPT SETTINGS</span><h1><ReceiptText size={26}/> Receipt Settings</h1><p>Receipt header from Company Profile and an editable footer message.</p></div><div className="receipt-settings-actions"><button type="button" className="outline action-icon" title="Refresh" aria-label="Refresh" disabled={loading||busy} onClick={()=>refreshPage(load,notify)}><RefreshCw size={18}/></button><button type="button" className="outline action-icon" title="Activity Log" aria-label="Activity Log" onClick={showAudit}><History size={18}/></button></div></div>
  {loading&&!data?<p>Loading Receipt Settings...</p>:data&&<div className="receipt-settings-layout"><form className="receipt-settings-card" onSubmit={save}>
   <div className="receipt-settings-section-head"><h2>Receipt Header</h2><span>Read-only</span></div>
   <p className="receipt-settings-help">Automatically retrieved from Settings / Company Profile. Edit the source information in Company Profile.</p>
   <div className="receipt-settings-grid">{fields.map(([key,label])=><label key={key}><span>{label}</span><input value={company[key]||''} disabled readOnly/></label>)}</div>
   <div className="receipt-settings-note"><Info size={17}/><span>Company identity and address cannot be edited here. Existing receipt numbers, payments, tax details and print layout remain unchanged.</span></div>
   <div className="receipt-settings-section-head"><h2>Receipt Footer</h2><span>{data.canManage?'Owner / Admin editable':'Read-only'}</span></div>
   <label className="receipt-settings-footer-field"><span>Footer Message</span><textarea rows={3} value={footer} onChange={e=>setFooter(e.target.value)} disabled={!data.canManage||busy} maxLength={500} required placeholder="Thank you."/><small>{footer.length}/500 characters</small></label>
   <div className="receipt-settings-bottom"><p>Footer changes apply to new sales only. Previously posted receipts retain their original footer snapshot.</p>{data.canManage&&<button className="primary" type="submit" disabled={loading||busy||!footer.trim()||footer.trim()===data.footerMessage}><Save size={17}/>{busy?'Saving...':'Save'}</button>}</div>
  </form><section className="receipt-settings-preview-card"><h2>Live Receipt Preview</h2><p>Illustrative preview only — not a posted transaction.</p><div className="receipt-settings-paper"><strong className="receipt-settings-business">{company.businessName}</strong>{ssmLine&&<div className="receipt-settings-ssm">{ssmLine}</div>}{lines.map((line,i)=><div key={i}>{line}</div>)}<h3>RECEIPT</h3><div className="receipt-settings-preview-row"><span>Receipt No.</span><span>PREVIEW</span></div><div className="receipt-settings-preview-row"><span>Items / Payments / Taxes</span><span>—</span></div><div className="receipt-settings-preview-footer">{footer||' '}</div></div><small>MyInvois QR is not part of Receipt Settings R1. It will be controlled by the future e-Invoice ON/OFF setting.</small></section></div>}
  {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><section className="dialog wide receipt-settings-audit"><div className="dialog-head"><h2>Receipt Settings Activity Log</h2><button type="button" className="icon-button" title="Close" aria-label="Close" onClick={()=>setAudit(null)}><X size={19}/></button></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Action By</th><th>Previous Footer</th><th>New Footer</th></tr></thead><tbody>{audit.map(row=><tr key={row.id}><td>{row.recordedAt}</td><td>{row.actorName}</td><td className="receipt-settings-audit-text">{row.previousFooter}</td><td className="receipt-settings-audit-text">{row.nextFooter}</td></tr>)}{!audit.length&&<tr><td colSpan="4">No changes recorded.</td></tr>}</tbody></table></div></section></div>}
 </main>;
}
