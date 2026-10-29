import { useCallback, useEffect, useState } from 'react';
import { Activity, BarChart3, Boxes, Building2, Clock3, FolderTree, Package, RefreshCw, ShoppingBag, TrendingUp, Users, UserRoundCheck, ShieldCheck } from 'lucide-react';
import { request } from './api.js';

const dateText=value=>{
 if(!value)return '—';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'—':date.toLocaleString('en-MY',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'});
};
function IconAction({icon:Icon,label,onClick,disabled=false}){
 return <button type="button" className="outline action-icon" title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={19}/></button>;
}
function StatCard({icon:Icon,label,value,caption,unavailable=false}){
 return <article className={`dashboard-stat ${unavailable?'dashboard-stat-pending':''}`}>
  <div className="dashboard-stat-title"><Icon size={19}/><span>{label}</span></div>
  <strong>{unavailable?'—':value}</strong><small>{caption}</small>
 </article>;
}
function PendingPanel({icon:Icon,title,description}){
 return <section className="dashboard-panel dashboard-unavailable" aria-label={title}>
  <div className="dashboard-section-head"><h2><Icon size={19}/>{title}</h2><span className="dashboard-tag">Pending module</span></div>
  <div className="dashboard-empty"><Icon size={32}/><p>Data not available yet</p><span>{description}</span></div>
 </section>;
}
export default function Dashboard({profile,onNavigate}){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  setLoading(true);setError('');
  try{const result=await request('/dashboard/overview');setData(result);}catch(e){setData(null);setError(e.message);}finally{setLoading(false);}
 },[]);
 useEffect(()=>{refresh();},[refresh]);
 return <main className="page dashboard-page">
  <div className="page-head"><div><p className="eyebrow">BUSINESS / OVERVIEW</p><h1>Dashboard</h1><p className="muted">{profile.business.name} · Live tenant data and module readiness</p></div>
   <div className="actions"><IconAction icon={RefreshCw} label="Refresh Dashboard" onClick={refresh} disabled={loading}/></div>
  </div>
  {error&&<div className="notice error" role="alert">Unable to load dashboard: {error}</div>}
  {loading&&!data?<div className="dashboard-loading" role="status">Loading dashboard records...</div>:null}
  {data&&<>
   <div className="dashboard-metadata"><Clock3 size={15}/> Last refreshed: {dateText(data.generatedAt)} <span>·</span> All amounts in MYR when sales data becomes available</div>
   <div className="dashboard-stats">
    <StatCard icon={ShoppingBag} label="Sales Today" caption="Sales module not yet implemented" unavailable/>
    <StatCard icon={TrendingUp} label="Sales (30 Days)" caption="Awaiting validated sales transactions" unavailable/>
    <StatCard icon={Boxes} label="Low Stock Products" caption="Inventory module not yet implemented" unavailable/>
    <StatCard icon={UserRoundCheck} label="Active Users" value={data.users.active} caption={`${data.users.total} total · ${data.users.locked} locked`}/>
    <StatCard icon={FolderTree} label="Categories" value={data.categories.total} caption={`${data.categories.active} active · ${data.categories.inactive} inactive`}/>
    <StatCard icon={Building2} label="Active Branches" value={data.branches.active} caption={`${data.branches.total} total branches`}/>
   </div>
   <div className="dashboard-grid">
    <PendingPanel icon={BarChart3} title="Sales Trend" description="Verified daily sales totals and charts will appear when the Sales / POS Terminal modules are built."/>
    <PendingPanel icon={Package} title="Best Selling Products" description="Rankings require Product and Sales records. No sample rankings are shown."/>
    <PendingPanel icon={Boxes} title="Inventory Watch" description="Stock balances and low stock alerts require the new Inventory module."/>
    <section className="dashboard-panel dashboard-activity">
     <div className="dashboard-section-head"><h2><Activity size={19}/> Recent User Activity</h2><span className="dashboard-tag dashboard-tag-live">Live records</span></div>
     <div className="dashboard-table-wrap"><table><thead><tr><th>Event</th><th>User</th><th>Time</th></tr></thead><tbody>
     {data.recentUserActivity.map(a=><tr key={a.id}><td><strong>{a.event.replaceAll('_',' ')}</strong></td><td>{a.actor}{a.target&&a.target!==a.actor?<small> → {a.target}</small>:null}</td><td>{dateText(a.createdAt)}</td></tr>)}
     {!data.recentUserActivity.length&&<tr><td colSpan={3} className="empty">No user activity recorded yet.</td></tr>}
     </tbody></table></div>
    </section>
   </div>
   <section className="dashboard-shortcuts"><h2><ShieldCheck size={18}/> Quick Access</h2>
    <div className="dashboard-shortcut-actions">
     {profile.user.permissions.includes('users.view')&&<button type="button" className="outline action-icon" title="Open Users" aria-label="Open Users" onClick={()=>onNavigate('users')}><Users size={19}/></button>}
     {profile.user.permissions.includes('categories.view')&&<button type="button" className="outline action-icon" title="Open Categories" aria-label="Open Categories" onClick={()=>onNavigate('categories')}><FolderTree size={19}/></button>}
    </div>
   </section>
  </>}
 </main>;
}
