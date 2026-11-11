import EinvoiceSandboxV10 from './EinvoiceSandboxV10.jsx';
import EinvoiceProductMappingC42B from './EinvoiceProductMappingC42B.jsx';
import {useCallback,useEffect,useState} from 'react';
import {FileCheck2,RefreshCw,History,Save,Plug,X,ShieldCheck} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './EinvoiceSettings.css';
const OAUTH_MESSAGES={
 EINVOICE_OAUTH_INVALID_CLIENT:'MyInvois rejected the Client ID / Client Secret (invalid_client). Confirm both are from the Sandbox ERP registration, not Production.',
 EINVOICE_OAUTH_INVALID_REQUEST:'MyInvois rejected the OAuth request format (invalid_request). Check the integration setup.',
 EINVOICE_OAUTH_INVALID_GRANT:'MyInvois rejected the OAuth grant (invalid_grant). Check the ERP registration.',
 EINVOICE_OAUTH_UNAUTHORISED_CLIENT:'This ERP client is not authorized to log in to MyInvois (unauthorised_client). Check its status in the Sandbox portal.',
 EINVOICE_OAUTH_UNSUPPORTED_GRANT_TYPE:'MyInvois rejected the grant type (unsupported_grant_type).',
 EINVOICE_OAUTH_INVALID_SCOPE:'MyInvois rejected the requested scope (invalid_scope).',
 EINVOICE_OAUTH_ACCESS_FORBIDDEN:'MyInvois returned HTTP 403. Confirm the ERP system and credentials are registered in Sandbox.',
 EINVOICE_CREDENTIAL_REJECTED:'MyInvois rejected OAuth authentication (HTTP 400/401). Check the Sandbox ERP Client ID, actual Client Secret and system status.',
 EINVOICE_OAUTH_RATE_LIMITED:'MyInvois rate limit reached (HTTP 429). Avoid repeated Test Connection attempts.',
 EINVOICE_OAUTH_SERVICE_UNAVAILABLE:'MyInvois service unavailable (HTTP 5xx). Do not repeatedly retry.'
};
const URLS={SANDBOX:'https://preprod-api.myinvois.hasil.gov.my',PRODUCTION:'https://api.myinvois.hasil.gov.my'};
export default function EinvoiceSettings({notify}){
 const [data,setData]=useState(null),[enabled,setEnabled]=useState(false),[environment,setEnvironment]=useState('SANDBOX'),[clientId,setClientId]=useState(''),[clientSecret,setClientSecret]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[audit,setAudit]=useState(null);
 const load=useCallback(async()=>{setLoading(true);try{const r=await request('/einvoice-settings');setData(r);setEnabled(r.enabled);setEnvironment(r.environment);setClientId('');setClientSecret('');}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{void load();},[load]);
 async function save(e){e.preventDefault();if(!data?.canManage)return;setBusy(true);try{
  const replacingCredentials=!!(clientId||clientSecret);
  const connectionVerified=!!data.verified?.[environment];
  // A new credential pair must be saved while disabled, then tested with MyInvois OAuth.
  // Never auto-enable an unverified connection or weaken the backend's guard.
  if(enabled&&!replacingCredentials&&!connectionVerified){notify('Test Connection is required before enabling MyInvois. Save credentials while OFF, then test the connection.',true);return;}
  const stagedCredentials=replacingCredentials&&enabled;
  const body={enabled:stagedCredentials?false:enabled,environment};
  if(replacingCredentials){body.clientId=clientId;body.clientSecret=clientSecret;}
  await request('/einvoice-settings',{method:'PUT',body});
  if(stagedCredentials){notify('Credentials saved securely. MyInvois remains OFF until Test Connection succeeds.');}
  else if(replacingCredentials){notify('Credentials saved securely. Run Test Connection before enabling MyInvois.');}
  else{notify('MyInvois Settings saved successfully.');}
  await load();
 }catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function test(){if(!data?.canManage)return;setBusy(true);try{if(clientId||clientSecret){notify('Save credentials first. Then run Test Connection.',true);return;}const r=await request('/einvoice-settings/test',{method:'POST',body:{environment}});notify(r.connected?'MyInvois OAuth connection verified.':'Connection not verified.');await load();}catch(e){notify(OAUTH_MESSAGES[e.message]||e.message,true);await load();}finally{setBusy(false);}}
 async function showAudit(){try{const r=await request('/einvoice-settings/audit');setAudit(r.logs);}catch(e){notify(e.message,true);}}
 const can=data?.canManage&&!busy&&!loading,verified=data?.verified?.[environment],configured=data?.hasCredentials?.[environment];
 return <main className="page einvoice-settings-page"><div className="einvoice-settings-top"><div><span className="eyebrow">SETTINGS / E-INVOICE LHDN</span><h1><FileCheck2 size={26}/> e-Invoice LHDN</h1><p>Official MyInvois connection settings.</p></div><div className="einvoice-settings-actions"><button type="button" className="outline action-icon" title="Refresh" aria-label="Refresh" onClick={()=>refreshPage(load,notify)}><RefreshCw size={18}/></button><button type="button" className="outline action-icon" title="Activity Log" aria-label="Activity Log" onClick={showAudit}><History size={18}/></button></div></div>
 {data&&<form className="einvoice-settings-card" onSubmit={save}><div className="einvoice-settings-section"><h2>MyInvois Integration</h2><label className="einvoice-switch"><span><strong>Enable MyInvois</strong><small>Default OFF — normal receipts, no QR, no LHDN submission.</small></span><select value={enabled?'ON':'OFF'} onChange={e=>setEnabled(e.target.value==='ON')} disabled={!can}><option value="OFF">OFF</option><option value="ON">ON</option></select></label></div>
 <div className="einvoice-settings-section"><h2>API Environment</h2><div className="einvoice-settings-grid"><label><span>Environment</span><select value={environment} disabled={!can} onChange={e=>setEnvironment(e.target.value)}><option value="SANDBOX">Sandbox (Testing)</option><option value="PRODUCTION">Production (Live)</option></select></label><label><span>Official API URL (Read-only)</span><input disabled readOnly value={URLS[environment]}/></label></div></div>
 <div className="einvoice-settings-section"><h2>Supplier Information</h2><p className="einvoice-muted">From Company Profile — read-only.</p><div className="einvoice-settings-grid"><label><span>Business Name</span><input disabled value={data.company?.businessName||''}/></label><label><span>Company TIN</span><input disabled value={data.company?.tin||''}/></label><label><span>Business Registration No.</span><input disabled value={data.company?.registrationNumber||''}/></label></div></div>
 <div className="einvoice-settings-section"><h2>MyInvois API Credentials</h2><p className="einvoice-muted">Credentials are stored encrypted per tenant and environment. Saved secrets are never returned to the browser.</p><div className="einvoice-settings-grid"><label><span>Client ID</span><input disabled={!can} autoComplete="off" value={clientId} onChange={e=>setClientId(e.target.value)} placeholder={configured?'Configured — enter new ID to replace':'Enter MyInvois Client ID'}/></label><label><span>Client Secret</span><input disabled={!can} autoComplete="new-password" type="password" value={clientSecret} onChange={e=>setClientSecret(e.target.value)} placeholder={configured?'Configured — enter new secret to replace':'Enter MyInvois Client Secret'}/></label></div><div className="einvoice-status"><ShieldCheck size={18}/><span>{verified?'Connection verified':configured?'Credentials saved — Test Connection required':'No credentials configured'}</span></div></div>
 {data.canManage&&<div className="einvoice-settings-bottom"><button className="outline" type="button" disabled={!can||!configured||!!clientId||!!clientSecret} onClick={test}><Plug size={17}/> Test Connection</button><button className="primary" disabled={!can||!!(clientId&&!clientSecret)||!!(!clientId&&clientSecret)} type="submit"><Save size={17}/> {busy?'Saving...':'Save'}</button></div>}</form>}
 {data&&<EinvoiceProductMappingC42B notify={notify} canManage={data.canManage}/>}
 {data&&<EinvoiceSandboxV10 notify={notify} canManage={data.canManage} enabled={data.enabled} environment={data.environment} verified={data.verified?.SANDBOX}/>}
 {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><section className="dialog wide"><div className="dialog-head"><h2>e-Invoice Activity Log</h2><button type="button" className="icon-button" aria-label="Close" title="Close" onClick={()=>setAudit(null)}><X size={18}/></button></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Action By</th><th>Event</th><th>Environment</th><th>Details</th></tr></thead><tbody>{audit.map(r=><tr key={r.id}><td>{r.recordedAt}</td><td>{r.actorName}</td><td>{r.actionType}</td><td>{r.environment}</td><td>{r.details}</td></tr>)}{!audit.length&&<tr><td colSpan="5">No changes recorded.</td></tr>}</tbody></table></div></section></div>}
 </main>;
}
