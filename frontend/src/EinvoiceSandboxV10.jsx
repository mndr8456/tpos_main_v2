import {useState} from 'react';
import {request} from './api.js';

// Deliberately manual workflow. No automatic submit or retry.
export default function EinvoiceSandboxV10({notify,canManage,enabled,environment,verified}){
 const [saleId,setSaleId]=useState('');
 const [preview,setPreview]=useState(null);
 const [status,setStatus]=useState(null);
 const [busy,setBusy]=useState(false);
 const [agree,setAgree]=useState(false);
 const allowed=canManage&&enabled&&environment==='SANDBOX'&&verified;
 const valid=/^[1-9]\d*$/.test(saleId);
 async function run(action){
  if(!valid||busy)return;
  setBusy(true);
  try{
   const path=`/einvoice/sandbox-v10/${action}/${encodeURIComponent(saleId)}`;
   const result=await request(path,action==='submit'?{method:'POST',body:{confirm:true,expectedHash:preview?.hash}}:action==='refresh'?{method:'POST',body:{}}:undefined);
   if(action==='preview'){setPreview(result);setAgree(false);if(result.existing)setStatus({document:result.existing});}
   else if(action==='status'||action==='refresh')setStatus(result);
   else {setPreview(null);setAgree(false);setStatus({document:{status:result.status,uuid:result.uuid,submissionUID:result.submissionUID,errorCode:result.errorCode}});}
   notify(action==='submit'?'Sandbox submission request completed. Check MyInvois validation status.':action==='preview'?'Sandbox v1.0 preflight finished.':'Status retrieved.');
  }catch(e){notify(e.message,true);if(action==='submit'){setPreview(null);setAgree(false);}}finally{setBusy(false);}
 }
 return <section className="einvoice-settings-card" style={{marginTop:16}}>
  <h2>Sandbox Invoice v1.0</h2>
  <p className="einvoice-muted">Manual submission only. Requires a PAID receipt, submitted Buyer Request, and fully reconciled C4.3 evidence including a verified product mapping. This phase supports reconciled discount/voucher sales; ordinary sales and unresolved service charge treatment are not eligible yet.</p>
  <div className="einvoice-settings-grid"><label><span>Sale ID</span><input value={saleId} onChange={e=>{setSaleId(e.target.value.trim());setPreview(null);setStatus(null);setAgree(false);}} placeholder="Enter numeric Sale ID" inputMode="numeric"/></label><div style={{display:'flex',alignItems:'end',gap:8,flexWrap:'wrap'}}><button type="button" className="outline" disabled={!allowed||!valid||busy} onClick={()=>run('preview')}>Preflight v1.0</button><button type="button" className="outline" disabled={!allowed||!valid||busy} onClick={()=>run('status')}>View Status</button><button type="button" className="outline" disabled={!allowed||!valid||busy||!status?.document?.uuid} onClick={()=>run('refresh')}>Refresh LHDN</button></div></div>
  {!allowed&&<p className="einvoice-muted">Enable and verify the Sandbox connection first. Production submission is disabled.</p>}
  {preview&&<div style={{marginTop:16}}><strong>Preflight: {preview.ready?'READY FOR SANDBOX TEST':'NOT READY'}</strong><p className="einvoice-muted">{preview.code||'Local checks only. MyInvois performs the authoritative validation.'}</p>{preview.ready&&<><p>Invoice: {preview.codeNumber} · Version: {preview.version} · Size: {preview.bytes} bytes</p><p style={{overflowWrap:'anywhere'}}>SHA-256: {preview.hash}</p><label style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0'}}><input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)}/> I confirm this test invoice should be submitted to MyInvois Sandbox.</label><button className="primary" type="button" disabled={!agree||!allowed||busy} onClick={()=>run('submit')}>Submit to Sandbox</button></>}</div>}
  {status?.document&&<div style={{marginTop:16}}><strong>Document Status: {status.document.status}</strong><p className="einvoice-muted">Submission accepted does not mean validated.</p><div style={{overflowWrap:'anywhere'}}>Submission UID: {status.document.submissionUID||'—'}<p>Document UUID: {status.document.uuid||'—'}</p><p>Result: {status.document.errorCode||'—'}</p></div></div>}
 </section>;
}
