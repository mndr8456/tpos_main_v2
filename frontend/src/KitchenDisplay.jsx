import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ChefHat,RefreshCw,Clock3,Flame,CheckCircle2,Printer,Volume2,VolumeX,Maximize,Minimize,AlertTriangle,UtensilsCrossed,ShoppingBag,ClipboardList,History,XCircle,CheckCheck} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './KitchenDisplay.css';
const statii=['ALL','PENDING','PREPARING','READY','COMPLETED','CANCELLED'];
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function printTicket(card){
 const win=window.open('','_blank','width=480,height=650');
 if(!win)throw Error('PRINT_POPUP_BLOCKED');
 const items=card.lines.map(l=>`<section class="item"><b>${esc(l.quantity)} × ${esc(l.product_name)}</b>${l.line_notes?`<p>NOTE: ${esc(l.line_notes)}</p>`:''}<small>${esc(l.sku||'')}</small></section>`).join('');
 const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kitchen Ticket #${esc(card.id)}</title><style>@page{size:80mm 210mm;margin:4mm}body{font:15px Arial,sans-serif;width:70mm;margin:0 auto;color:#000}h1{font-size:20px;margin:0 0 5mm;text-align:center}h2{font-size:17px;margin:2mm 0}header{text-align:center;border-bottom:2px dashed #111;padding-bottom:3mm}.item{padding:3mm 0;border-bottom:1px dashed #999}.item p{font-weight:bold;margin:2mm 0}.item small{display:block;font-size:11px}section.meta{margin:3mm 0;border-bottom:2px dashed #111;padding-bottom:3mm}.notes{font-weight:bold;white-space:pre-wrap}footer{text-align:center;margin-top:4mm}@media screen{body{padding:14px}}@media print{body{width:auto}}</style></head><body><header><h1>KITCHEN TICKET</h1><b>${esc(card.station_name)}</b></header><section class="meta"><h2>Ticket #${esc(card.id)} · ${esc(card.source_type)}</h2><strong>${esc(card.order_scope==='DINE_IN'?`DINE IN · ${card.table_number||'-'}`:'TAKE AWAY')}</strong><div>Branch: ${esc(card.branch_name)}</div><div>Sent: ${esc(card.created_at)}</div><div>Kitchen Status: ${esc(card.status)}</div></section>${items}${card.order_notes?`<p class="notes">ORDER NOTES: ${esc(card.order_notes)}</p>`:''}<footer>TPOS V2 · Kitchen Copy</footer></body></html>`;
 win.document.open();win.document.write(html);win.addEventListener('load',()=>{win.focus();win.print();},{once:true});win.document.close();
}
const ageMinutes=serverMinutes=>Math.max(0,Number(serverMinutes)||0);
const ageClass=age=>age>=30?'critical':age>=15?'urgent':age>=8?'warning':'';
function soundAlert(){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;const ctx=new Context();const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(880,ctx.currentTime);gain.gain.setValueAtTime(0.075,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.28);oscillator.connect(gain).connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+0.3);oscillator.onended=()=>void ctx.close();}
const nextStatus={PENDING:'PREPARING',PREPARING:'READY',READY:'COMPLETED'};
const nextLabel={PENDING:'Start Preparing',PREPARING:'Mark Ready',READY:'Complete'};
const tone=state=>state==='READY'?'ready':state==='PREPARING'?'preparing':state==='PENDING'?'pending':state==='COMPLETED'?'completed':'cancelled';
export default function KitchenDisplay({profile,notify}){
 const [meta,setMeta]=useState({branches:[],stations:[]}),[branchId,setBranchId]=useState(''),[stationId,setStationId]=useState(''),[status,setStatus]=useState('ALL'),[history,setHistory]=useState(false);
 const [cards,setCards]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const [sound,setSound]=useState(false),[full,setFull]=useState(false),[audit,setAudit]=useState(null),[auditLoading,setAuditLoading]=useState(false);
 const previousKeys=useRef(null),soundEnabled=useRef(false);
 const mayUpdate=profile.user.permissions.includes('kds.update_status'),mayPrint=profile.user.permissions.includes('kds.print'),mayCancel=profile.user.permissions.includes('kds.cancel'),mayAudit=profile.user.permissions.includes('kds.audit');
 const refreshBoard=useCallback(async()=>{
  if(!branchId){setCards([]);setLoading(false);return;}
  try{
   const params=new URLSearchParams({branchId,status:'ALL',history:history?'1':'0'});if(stationId)params.set('stationId',stationId);
   const data=await request(`/kds/board?${params}`),list=data.cards||[];
   const keys=new Set(list.filter(c=>c.status==='PENDING').map(c=>`${c.id}:${c.station_id}`));
   if(soundEnabled.current&&previousKeys.current&&[...keys].some(k=>!previousKeys.current.has(k)))try{soundAlert();}catch{}
   previousKeys.current=keys;setCards(list);setError('');
  }catch(e){setError(e.message);}
  finally{setLoading(false);}
 },[branchId,stationId,status,history]);
 useEffect(()=>{let alive=true;(async()=>{try{const data=await request('/kds/meta');if(!alive)return;setMeta(data);setBranchId(v=>data.branches.some(x=>String(x.id)===v)?v:String(data.branches[0]?.id||''));}catch(e){if(alive)setError(e.message);}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[]);
 useEffect(()=>{previousKeys.current=null;void refreshBoard();const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void refreshBoard();},10000);return()=>window.clearInterval(timer);},[refreshBoard]);
 useEffect(()=>{const changed=()=>setFull(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',changed);return()=>document.removeEventListener('fullscreenchange',changed);},[]);
 const counts=useMemo(()=>({PENDING:cards.filter(c=>c.status==='PENDING').length,PREPARING:cards.filter(c=>c.status==='PREPARING').length,READY:cards.filter(c=>c.status==='READY').length}),[cards]);
 const visibleCards=useMemo(()=>cards.filter(c=>status==='ALL'||c.status===status),[cards,status]);
 async function updateCard(card){
  const next=nextStatus[card.status];if(!next)return;
  if(card.lines.some(l=>l.status!==card.status))return notify('Update mixed-status items individually before advancing the full ticket.',true);
  setBusy(true);try{await request(`/kds/tickets/${card.id}/stations/${card.station_id}/status`,{method:'PATCH',body:{nextStatus:next,expectedVersions:card.lines.map(l=>({id:Number(l.id),version:l.version}))}});await refreshBoard();}catch(e){notify(e.message,true);await refreshBoard();}finally{setBusy(false);}
 }
 async function updateLine(line){const next=nextStatus[line.status];if(!next)return;setBusy(true);try{await request(`/kds/lines/${line.id}/status`,{method:'PATCH',body:{nextStatus:next,expectedVersion:line.version}});await refreshBoard();}catch(e){notify(e.message,true);await refreshBoard();}finally{setBusy(false);}}
 async function cancelCard(card){if(!mayCancel)return;const reason=window.prompt(`Cancel kitchen ticket #${card.id}? This is audited. Type a reason (at least eight characters):`);if(reason===null)return;if(reason.trim().length<8)return notify('Cancellation reason must contain at least eight characters.',true);if(!window.confirm('Confirm KDS cancellation? If this Waiter order is still unclaimed, it will also be cancelled and its table released.'))return;
  setBusy(true);try{const out=await request(`/kds/tickets/${card.id}/cancel`,{method:'POST',body:{reason:reason.trim()}});await refreshBoard();notify(out.note||'Kitchen ticket cancelled and audited.');}catch(e){notify(e.message,true);}finally{setBusy(false);}
 }
 async function showAudit(card){setAudit(null);setAuditLoading(true);try{const data=await request(`/kds/tickets/${card.id}/audit`);setAudit({id:card.id,events:data.events||[]});}catch(e){notify(e.message,true);}finally{setAuditLoading(false);}}
 async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch(e){notify(e.message,true);}}
 function toggleSound(){const next=!sound;setSound(next);soundEnabled.current=next;if(next)try{soundAlert();}catch{}}
 return <main className="kds-page page" aria-label="Kitchen Display System">
  <header className="kds-header"><div className="kds-heading"><span className="kds-chef"><ChefHat size={30}/></span><div><p className="eyebrow">OPERATIONS / KITCHEN</p><h1>Kitchen Display</h1><p>{profile.business.name} · Real Kitchen Tickets · Refresh every 10 seconds</p></div></div><div className="kds-header-tools"><button type="button" className="outline" title="Refresh KDS" onClick={()=>refreshPage(refreshBoard,notify)} disabled={busy}><RefreshCw size={18}/> Refresh</button><button type="button" className="outline" title={sound?'Mute new tickets':'Enable new ticket sound'} aria-pressed={sound} onClick={toggleSound}>{sound?<Volume2 size={18}/>:<VolumeX size={18}/>} {sound?'Sound On':'Sound Off'}</button><button type="button" className="outline" title="Toggle fullscreen" onClick={toggleFullscreen}>{full?<Minimize size={18}/>:<Maximize size={18}/>} Full Screen</button></div></header>
  <div className="kds-stat-row">{[['PENDING',Clock3],['PREPARING',Flame],['READY',CheckCircle2]].map(([state,Icon])=><div className={`kds-stat kds-${tone(state)}`} key={state}><Icon size={23}/><div><small>{state==='PREPARING'?'Preparing':state==='PENDING'?'Pending':'Ready'}</small><strong>{counts[state]}</strong></div></div>)}</div>
  <section className="kds-filter-bar" aria-label="KDS filters"><label className="field"><span>Branch</span><select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Select branch</option>{meta.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><label className="field"><span>Preparation Station</span><select value={stationId} onChange={e=>setStationId(e.target.value)}><option value="">All Stations</option>{meta.stations.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label className="field"><span>Order Status</span><select value={status} onChange={e=>{setStatus(e.target.value);setHistory(['COMPLETED','CANCELLED'].includes(e.target.value));}}>{statii.map(s=><option key={s} value={s}>{s==='ALL'?'All Orders':s[0]+s.slice(1).toLowerCase()}</option>)}</select></label><label className="kds-history"><input type="checkbox" checked={history} onChange={e=>{setHistory(e.target.checked);setStatus('ALL');}}/><History size={16}/> History</label></section>
  {error&&<div className="kds-error" role="alert"><AlertTriangle size={19}/>{error}</div>}
  <div className="kds-board-meta"><span>{loading?'Loading kitchen tickets…':`${visibleCards.length} station ticket(s)`}</span><small><RefreshCw size={14}/> Automatic 10s refresh · Age alerts 8 / 15 / 30 min</small></div>
  <section className="kds-ticket-grid" aria-label="Kitchen tickets">
   {visibleCards.map(card=>{const age=ageMinutes(card.age_minutes);const same=card.lines.every(l=>l.status===card.status);return <article className={`kds-card kds-card-${tone(card.status)} ${ageClass(age)}`} key={`${card.id}:${card.station_id}`}>
    <div className="kds-card-top"><div><small>#{card.id} · {card.station_name}</small><h2>{card.order_scope==='DINE_IN'?(card.table_number||'DINE IN'):'TAKE AWAY'}</h2></div><span className={`kds-age ${ageClass(age)}`}><Clock3 size={16}/>{age} min</span></div>
    <div className="kds-ticket-sub"><span>{card.source_type==='WAITER'?<UtensilsCrossed size={15}/>:<ShoppingBag size={15}/>} {card.source_type==='WAITER'?`WAITER #${card.waiter_order_id}`:`POS #${card.pos_draft_id}`}</span><span>{card.branch_name}</span></div>
    <div className={`kds-badge kds-${tone(card.status)}`}>{card.status}</div>
    <div className="kds-items">{card.lines.map(l=><div key={l.id} className="kds-item"><div className="kds-item-row"><strong>{l.quantity} × {l.product_name}</strong><span className={`kds-line-status kds-${tone(l.status)}`}>{l.status}</span></div>{l.line_notes&&<p className="kds-note">{l.line_notes}</p>}{mayUpdate&&nextStatus[l.status]&&<button type="button" className="kds-item-action outline" disabled={busy} onClick={()=>updateLine(l)}>{nextLabel[l.status]} (Item)</button>}</div>)}</div>
    {card.order_notes&&<p className="kds-order-note"><ClipboardList size={15}/> {card.order_notes}</p>}
    <div className="kds-card-footer">{mayUpdate&&nextStatus[card.status]&&same&&<button type="button" className="kds-primary" disabled={busy} onClick={()=>updateCard(card)}>{card.status==='PENDING'?<Flame size={17}/>:<CheckCheck size={17}/>} {nextLabel[card.status]}</button>}<div className="kds-more-buttons">{mayPrint&&<button className="outline" type="button" onClick={()=>{try{printTicket(card);}catch(e){notify(e.message,true);}}} title="Print / Reprint station ticket"><Printer size={17}/> Print</button>}{mayAudit&&<button className="outline" type="button" disabled={auditLoading} onClick={()=>showAudit(card)} title="Kitchen ticket activity log"><History size={17}/> Audit</button>}{mayCancel&&['PENDING','PREPARING','READY'].includes(card.status)&&<button type="button" className="outline" disabled={busy} title="Owner/Admin cancel with reason" onClick={()=>cancelCard(card)}><XCircle size={17}/> Cancel</button>}</div></div>
   </article>;})}
  </section>
  {!loading&&visibleCards.length===0&&!error&&<div className="kds-empty"><CheckCircle2 size={38}/><h2>No kitchen tickets</h2><p>No matching tickets for this branch, station and status.</p></div>}
  {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><div className="dialog wide"><div className="dialog-head"><h2>KDS Ticket #{audit.id} — Activity Log</h2><button className="icon-button" title="Close" type="button" onClick={()=>setAudit(null)}><XCircle size={20}/></button></div><div className="table-scroll"><table><thead><tr><th>Date</th><th>Actor</th><th>Action</th><th>From</th><th>To</th><th>Details</th></tr></thead><tbody>{audit.events.map(a=><tr key={a.id}><td>{a.recorded_at}</td><td>{a.actor_name}</td><td>{a.action_type}</td><td>{a.previous_status||'—'}</td><td>{a.new_status||'—'}</td><td>{typeof a.details==='string'?a.details:JSON.stringify(a.details)}</td></tr>)}</tbody></table></div></div></div>}
  <div className="kds-legend"><span><Clock3 size={15}/> Pending</span><span><Flame size={15}/> Preparing</span><span><CheckCircle2 size={15}/> Ready for pickup</span><small>Preparation does not collect payment, adjust stock or post a journal.</small></div>
 </main>;
}
