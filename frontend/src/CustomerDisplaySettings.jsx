import {useCallback,useEffect,useState} from 'react';
import {MonitorPlay,Upload,RefreshCw,Trash2,Save,Eye,Image,Video} from 'lucide-react';
import {request,apiUrl} from './api.js';
import './CustomerDisplaySettings.css';

const allowed=new Set(['image/png','image/jpeg','image/webp','video/mp4']);
const initial={welcomeMessage:'Welcome!',successEnglish:'Thank You, Please Come Again!',successMalay:'Terima kasih, sila datang lagi!',mediaIntervalSeconds:8,cashChangeSeconds:5,successSeconds:12,promotionsEnabled:true};
const fileBase64=file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Cannot read promotional file.'));reader.readAsDataURL(file);});
export default function CustomerDisplaySettings({profile,notify}){
 const canManage=profile.user.role==='OWNER'&&profile.user.permissions.includes('customer_display.manage');
 const [settings,setSettings]=useState(initial),[media,setMedia]=useState([]),[busy,setBusy]=useState(false),[file,setFile]=useState(null),[title,setTitle]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{setLoading(true);try{const result=await request('/customer-display/settings');setSettings(result.settings);setMedia(result.media);}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const set=(key,value)=>setSettings(previous=>({...previous,[key]:value}));
 const invoke=async(fn,message)=>{setBusy(true);try{await fn();await load();notify(message);}catch(e){notify(e.message,true);}finally{setBusy(false);}};
 async function saveSettings(event){event.preventDefault();await invoke(()=>request('/customer-display/settings',{method:'PUT',body:settings}),'Customer Display settings saved.');}
 async function upload(event){event.preventDefault();if(!file)return;
  if(!allowed.has(file.type)||file.size>(file.type==='video/mp4'?12:3)*1024*1024)return notify('Use PNG/JPEG/WebP up to 3 MB or MP4 up to 12 MB.',true);
  await invoke(async()=>{await request('/customer-display/media/upload',{method:'POST',body:{title:title.trim()||file.name.slice(0,120),mimeType:file.type,base64:await fileBase64(file)}});setFile(null);setTitle('');},'Promotional media uploaded.');
 }
 async function edit(item,changes){await invoke(()=>request(`/customer-display/media/${item.id}`,{method:'PATCH',body:{title:item.title,sortOrder:Number(item.sort_order),active:!!item.is_active,...changes}}),'Promotion updated.');}
 async function remove(item){if(!window.confirm(`Delete promotional media "${item.title}"?`))return;await invoke(()=>request(`/customer-display/media/${item.id}`,{method:'DELETE',body:{}}),'Promotion removed.');}
 return <main className="page cd-settings-page">
  <header className="page-head"><div><p className="eyebrow">SETTINGS / CUSTOMER-FACING SCREEN</p><h1>Customer Display</h1><p className="muted">Manage the bilingual success message and the image / MP4 slideshow shown on paired cashier displays.</p></div><button className="outline" onClick={load} disabled={busy||loading} title="Refresh Customer Display settings"><RefreshCw size={17}/> Refresh</button></header>
  <div className="cd-settings-layout">
   <section className="table-panel cd-settings-panel">
    <div className="cd-settings-heading"><MonitorPlay size={22}/><div><h2>Display Messages</h2><p className="muted">OWNER-controlled tenant settings</p></div></div>
    <form onSubmit={saveSettings} className="cd-settings-form">
     <label className="field"><span>Welcome Message</span><input maxLength="180" value={settings.welcomeMessage} onChange={e=>set('welcomeMessage',e.target.value)} disabled={!canManage||busy} required/></label>
     <label className="field"><span>Payment Success — English</span><textarea maxLength="240" value={settings.successEnglish} rows={2} onChange={e=>set('successEnglish',e.target.value)} disabled={!canManage||busy} required/></label>
     <label className="field"><span>Payment Success — Bahasa Melayu</span><textarea maxLength="240" value={settings.successMalay} rows={2} onChange={e=>set('successMalay',e.target.value)} disabled={!canManage||busy} required/></label>
     <div className="cd-settings-numbers">
      <label className="field"><span>Slide Duration (seconds)</span><input type="number" min="5" max="60" value={settings.mediaIntervalSeconds} onChange={e=>set('mediaIntervalSeconds',Number(e.target.value))} disabled={!canManage||busy} required/></label>
      <label className="field"><span>Show Cash Change (seconds)</span><input type="number" min="3" max="15" value={settings.cashChangeSeconds} onChange={e=>set('cashChangeSeconds',Number(e.target.value))} disabled={!canManage||busy} required/></label>
      <label className="field"><span>Thank You Duration (seconds)</span><input type="number" min="5" max="45" value={settings.successSeconds} onChange={e=>set('successSeconds',Number(e.target.value))} disabled={!canManage||busy} required/></label>
     </div>
     <label className="cd-settings-toggle"><input type="checkbox" checked={settings.promotionsEnabled} onChange={e=>set('promotionsEnabled',e.target.checked)} disabled={!canManage||busy}/> Enable Promotions</label>
     {canManage&&<button className="primary" disabled={busy||loading} type="submit"><Save size={17}/> Save Settings</button>}
     {!canManage&&<p className="muted">Owner permission is required to edit Customer Display messages and promotions.</p>}
    </form>
   </section>
   <section className="table-panel cd-settings-panel">
    <div className="cd-settings-heading"><Image size={22}/><div><h2>Promotion Playlist</h2><p className="muted">Up to 12 images or videos per tenant · MP4 plays muted on Customer Display</p></div></div>
    {canManage&&<form className="cd-settings-form cd-upload-form" onSubmit={upload}>
     <label className="field"><span>Promotion Title</span><input maxLength="120" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Weekend Special"/></label>
     <label className="field"><span>Choose Image / MP4 Video</span><input type="file" accept="image/png,image/jpeg,image/webp,video/mp4" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
     {file&&<small>{file.name} · {(file.size/1024/1024).toFixed(2)} MB</small>}
     <button className="outline" disabled={busy||!file||media.length>=12}><Upload size={17}/> Upload Promotion</button>
    </form>}
    <div className="cd-media-list">{media.map(item=><article className="cd-media-row" key={item.id}>
      <div className="cd-media-thumb">{item.media_type==='VIDEO'?<Video size={26}/>:<img src={apiUrl(`/customer-display/media/${item.id}`)} alt="Promotion preview" loading="lazy"/>}</div>
      <div className="cd-media-details"><strong>{item.title}</strong><small>{item.media_type} · {item.is_active?'Active':'Hidden'} · Position {item.sort_order}</small></div>
      {canManage&&<div className="cd-media-actions"><button className="outline" type="button" disabled={busy||Number(item.sort_order)===0} title="Move up" onClick={()=>edit(item,{sortOrder:Math.max(0,Number(item.sort_order)-2)})}>↑</button><button className="outline" type="button" disabled={busy} title="Move down" onClick={()=>edit(item,{sortOrder:Math.min(999,Number(item.sort_order)+2)})}>↓</button><button className="outline" type="button" disabled={busy} onClick={()=>edit(item,{active:!item.is_active})} title={item.is_active?'Hide':'Show'}><Eye size={17}/></button><button className="outline" type="button" disabled={busy} onClick={()=>remove(item)} title="Delete"><Trash2 size={17}/></button></div>}
     </article>)}{!media.length&&<p className="muted">No promotion files yet. The Customer Display will use the welcome panel until you upload an image or video.</p>}</div>
    <p className="muted">The playlist is shared across this tenant. Paired screens are still isolated by branch and cashier; promotional media never carries receipt or customer information.</p>
   </section>
  </div>
 </main>;
}
