import {Fragment,useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,History,ShieldCheck,LockKeyhole,Save,Search,Check,AlertTriangle,X,RotateCcw} from 'lucide-react';
import {request} from './api.js';
import './RolePermissions.css';

const ACTIONS=[['create','C','Create'],['read','R','Read'],['update','U','Update'],['delete','D','Delete']];
const ACTION_LABELS={create:'Create',read:'Read',update:'Update',delete:'Delete'};
const editKey=(role,permission)=>`${role}::${permission}`;
const prettify=code=>code.replace(/_/g,' ').replaceAll('.',' · ').replace(/\b\w/g,c=>c.toUpperCase());
const IconButton=({label,Icon,onClick,disabled})=><button className="outline action-icon" type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}><Icon size={18}/></button>;

export default function RolePermissions({profile,notify}){
 const [snapshot,setSnapshot]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [moduleFilter,setModuleFilter]=useState('ALL'),[roleFilter,setRoleFilter]=useState('ALL'),[search,setSearch]=useState(''),[actionFilter,setActionFilter]=useState('ALL');
 const [draft,setDraft]=useState({}),[saveDialog,setSaveDialog]=useState(false),[reason,setReason]=useState('');
 const [audit,setAudit]=useState(null),[auditBusy,setAuditBusy]=useState(false);
 const load=useCallback(async()=>{setLoading(true);try{const result=await request('/role-permissions');setSnapshot(result);setDraft({});setError('');}catch(e){setError(e.message);notify?.(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const canManage=Boolean(snapshot?.canManage);
 const roleLocked=(code)=>code==='OWNER'||!canManage||(snapshot?.actorRole==='ADMIN'&&code==='ADMIN');
 const roles=(snapshot?.roles||[]).filter(r=>roleFilter==='ALL'||r.code===roleFilter);
 const rows=useMemo(()=>{
  const terms=search.trim().toLowerCase();
  const result=[];
  for(const module of snapshot?.modules||[]){
   if(moduleFilter!=='ALL'&&module.key!==moduleFilter)continue;
   const actions=[];
   if(actionFilter!=='SPECIAL')for(const [action,short,label] of ACTIONS){
    const code=module.crud?.[action]||null;
    if(terms&&!`${module.name} ${module.key} ${label} ${code||''}`.toLowerCase().includes(terms))continue;
    actions.push({kind:'crud',action,short,label,code});
   }
   if(actionFilter!=='CRUD')for(const special of module.special||[]){
    if(terms&&!`${module.name} ${module.key} ${special.name} ${special.code}`.toLowerCase().includes(terms))continue;
    actions.push({kind:'special',action:'special',short:'•',label:prettify(special.name),code:special.code});
   }
   if(actions.length)result.push({...module,actions});
  }
  return result;
 },[snapshot,moduleFilter,actionFilter,search]);
 const existing=(role,code)=>Boolean(snapshot?.grants?.[role]?.includes(code));
 const checked=(role,code)=>Object.hasOwn(draft,editKey(role,code))?draft[editKey(role,code)]:existing(role,code);
 const toggle=(role,code,next)=>setDraft(previous=>{const update={...previous};const k=editKey(role,code);if(next===existing(role,code))delete update[k];else update[k]=next;return update;});
 const pending=Object.entries(draft).map(([k,allowed])=>{const [role,permission]=k.split('::');return {role,permission,allowed};});
 const discard=()=>{setDraft({});setSaveDialog(false);setReason('');setError('');};
 const refresh=()=>{if(pending.length){setError('Discard unsaved changes before Refresh.');return;}notify?.('');void load();};
 const openAudit=async()=>{setAuditBusy(true);try{const result=await request('/role-permissions/audit?limit=150');setAudit(result.logs||[]);}catch(e){setError(e.message);notify?.(e.message,true);}finally{setAuditBusy(false);}};
 const save=async()=>{if(busy||reason.trim().length<4||reason.trim().length>500||!pending.length)return;
  setBusy(true);try{
   const revisions={};for(const r of [...new Set(pending.map(p=>p.role))])revisions[r]=snapshot.revisions[r];
   const result=await request('/role-permissions',{method:'PUT',body:{changes:pending,revisions,reason:reason.trim()}});
   setSaveDialog(false);setReason('');await load();notify?.(`${result.changedCount} permission change(s) saved. New access takes effect on the next API request.`);
  }catch(e){setError(e.message);notify?.(e.message,true);if(e.message==='ROLE_PERMISSION_STALE_RELOAD_REQUIRED'){setSaveDialog(false);setReason('');await load();}}
  finally{setBusy(false);}
 };
 const totalGrants=Object.values(snapshot?.grants||{}).reduce((a,b)=>a+b.length,0);
 return <main className="page rp-page">
  <div className="page-head"><div><p className="eyebrow">SETTINGS / ROLE PERMISSION</p><h1>Role Permission</h1><p className="muted">Manage role access with a full Create, Read, Update and Delete permission matrix.</p></div><div className="actions">
   <IconButton label="Refresh Role Permissions" Icon={RefreshCw} onClick={refresh} disabled={loading||busy}/>
   <IconButton label="Role Permission Activity Log" Icon={History} onClick={openAudit} disabled={loading||auditBusy||!snapshot?.grants?.[snapshot?.actorRole]?.includes('role_permissions.audit')}/>
  </div></div>
  <div className="stat-grid rp-stats">
   {[["Total Roles",snapshot?.roles?.length??'—'],["Modules",snapshot?.moduleCount??'—'],["Permissions",snapshot?.permissionCount??'—'],["Granted",snapshot?totalGrants:'—']].map(([name,value])=><div className="stat" key={name}><span>{name}</span><b>{value}</b></div>)}
  </div>
  <div className="table-panel rp-panel">
   <div className="rp-heading"><div><h2>Permission Matrix</h2><p className="muted">All existing V2 modules are included. OWNER permissions are locked. Special actions remain separate from CRUD.</p></div><span className="rp-count">{pending.length} unsaved changes</span></div>
   <div className="rp-filters">
    <label className="rp-search"><Search size={17}/><input aria-label="Search Permission" placeholder="Search module, permission or action..." value={search} onChange={e=>setSearch(e.target.value)}/></label>
    <select aria-label="Module Filter" value={moduleFilter} onChange={e=>setModuleFilter(e.target.value)}><option value="ALL">All Modules</option>{(snapshot?.modules||[]).map(m=><option value={m.key} key={m.key}>{m.name}{m.planned?' (Planned)':''}</option>)}</select>
    <select aria-label="Role Filter" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option value="ALL">All Roles</option>{(snapshot?.roles||[]).map(r=><option key={r.code} value={r.code}>{r.code}</option>)}</select>
    <select aria-label="Action Filter" value={actionFilter} onChange={e=>setActionFilter(e.target.value)}><option value="ALL">CRUD + Special</option><option value="CRUD">CRUD Only</option><option value="SPECIAL">Special Actions Only</option></select>
   </div>
   <div className="rp-legend"><span><strong>C</strong> Create</span><span><strong>R</strong> Read</span><span><strong>U</strong> Update</span><span><strong>D</strong> Delete</span><span><LockKeyhole size={14}/> OWNER locked</span><span><AlertTriangle size={14}/> — Not implemented</span></div>
   {error&&<div className="rp-error" role="alert">{error}</div>}
   {loading?<div className="empty">Loading role permissions...</div>:!snapshot?<div className="empty">Role Permission data could not be loaded.</div>:
    <div className="table-scroll rp-scroll"><table className="rp-table">
     <thead><tr><th className="rp-action-header">MODULE / ACTION</th>{roles.map(r=><th key={r.code} className="rp-role-header">{r.code}{r.code==='OWNER'&&<LockKeyhole size={12} aria-label="Locked"/>}</th>)}</tr></thead>
     <tbody>{rows.map(module=><Fragment key={module.key}>
      <tr className="rp-module-row" key={module.key}><td colSpan={1+roles.length}><strong>{module.name}</strong>{module.planned&&<small>Planned — no API</small>}<small>{module.key}</small></td></tr>
      {module.actions.map(action=><tr key={`${module.key}:${action.kind}:${action.code||action.action}`}><td className="rp-action-cell"><div className="rp-cell-content"><span className={action.kind==='special'?'rp-special-marker':'rp-crud-marker'}>{action.short}</span><div><b>{action.label}</b><small>{action.code||'Not implemented'}</small></div></div></td>
      {roles.map(role=><td className="rp-check-cell" key={role.code}>{action.code&&!module.planned?<label title={role.code==='OWNER'?'OWNER is locked':roleLocked(role.code)?'You cannot edit this role':`${action.label}: ${role.code}`}><input type="checkbox" aria-label={`${module.name} ${action.label} ${role.code}`} checked={checked(role.code,action.code)} disabled={roleLocked(role.code)||busy} onChange={e=>toggle(role.code,action.code,e.target.checked)}/></label>:<label title="No endpoint is implemented for this operation"><input type="checkbox" aria-label={`${module.name} ${action.label} ${role.code} not implemented`} checked={false} disabled readOnly/></label>}</td>)}
      </tr>)}
     </Fragment>)}{!rows.length&&<tr><td className="empty" colSpan={roles.length+1}>No matching modules or permissions.</td></tr>}</tbody>
    </table></div>}
   <div className="rp-note"><ShieldCheck size={17}/><span>Saving updates server-side grants and audit records. It does not bypass self-only access, branch restrictions or business approval rules. Changes to an active user's permissions take effect on their next authenticated API request.</span></div>
   <div className="dialog-actions rp-actions"><button className="outline" type="button" onClick={discard} disabled={!pending.length||busy}><RotateCcw size={16}/> Discard</button><button className="primary" type="button" onClick={()=>{setSaveDialog(true);setError('');}} disabled={!pending.length||busy||!canManage}><Save size={16}/> Save Changes ({pending.length})</button></div>
  </div>
  {saveDialog&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setSaveDialog(false);}}><div className="dialog wide rp-dialog" role="dialog" aria-modal="true" aria-labelledby="rp-save-title"><p className="eyebrow">SETTINGS / ROLE PERMISSION</p><div className="rp-dialog-title"><h2 id="rp-save-title">Confirm Permission Changes</h2><button className="outline action-icon" type="button" aria-label="Close" disabled={busy} onClick={()=>setSaveDialog(false)}><X size={18}/></button></div><p className="muted">Review your changes before saving. Each change will be recorded in Activity Log.</p>
   <div className="rp-review-list">{pending.map(change=><div className="rp-review-item" key={`${change.role}:${change.permission}`}><span><strong>{change.role}</strong><small>{change.permission}</small></span><span className={change.allowed?'rp-grant':'rp-revoke'}>{change.allowed?'Grant':'Revoke'}</span></div>)}</div>
   <label className="field"><span>Change Reason *</span><textarea rows={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Explain why these role permissions are changing..." required/></label><div className="rp-reason-length">Required · 4–500 characters · {reason.trim().length}/500</div>
   <div className="dialog-actions"><button className="outline" type="button" disabled={busy} onClick={()=>setSaveDialog(false)}>Cancel</button><button className="primary" type="button" disabled={busy||reason.trim().length<4||reason.trim().length>500} onClick={save}><Check size={17}/> {busy?'Saving...':'Confirm & Save'}</button></div>
  </div></div>}
  {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><div className="dialog wide rp-audit-dialog" role="dialog" aria-modal="true" aria-label="Role Permission Activity Log"><p className="eyebrow">SETTINGS / AUDIT</p><h2>Role Permission Activity Log</h2><div className="table-scroll"><table><thead><tr>{['Date','Actor','Role','Permission','Change','Details'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{a.recorded_at}</td><td>{a.actor_name}</td><td>{a.role_code}</td><td>{a.permission_code}</td><td>{a.new_allowed?'Granted':'Revoked'}</td><td className="rp-audit-reason">{a.change_reason}</td></tr>)}{!audit.length&&<tr><td colSpan={6}>No Role Permission changes have been recorded.</td></tr>}</tbody></table></div><div className="dialog-actions"><button className="outline" type="button" onClick={()=>setAudit(null)}>Close</button></div></div></div>}
 </main>;
}
