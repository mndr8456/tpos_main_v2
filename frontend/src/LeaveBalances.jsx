import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {RefreshCw,Search,Eye,Pencil,Power,History,Plus,Save,FileDown,Upload,FileText,FileSpreadsheet,Sparkles,Lock,Layers,CalendarDays,ArrowRightLeft,Clock3,Calculator} from 'lucide-react';
import {request,apiUrl} from './api.js';
import {refreshPage} from './refresh-page.js';
import {createLeaveBalancesPdf,downloadLeaveBalancesPdf} from './leave-balances-pdf.js';
import './LeaveBalances.css';
const blank={staff_profile_id:'',leave_type_id:'',balance_year:String(new Date().getFullYear()),entitlement_days:'0.00',carried_forward_days:'0.00',adjustment_days:'0.00',used_days:'0.00',pending_days:'0.00',expired_days:'0.00',adjustment_notes:'',status:'active'};
const number=v=>Number(v||0).toFixed(2);
const icon=(label,Icon,click,disabled=false)=><button className="outline action-icon" type="button" title={label} aria-label={label} onClick={click} disabled={disabled}><Icon size={17}/></button>;
const numberSort=(a,b)=>{const x=String(a||'').match(/^(.*?)(\d+)$/),y=String(b||'').match(/^(.*?)(\d+)$/);if(!x||!y)return String(a).localeCompare(String(b));return x[1].localeCompare(y[1])||Number(x[2])-Number(y[2])||String(a).localeCompare(String(b));};
const order=(a,b)=>Number(b.balance_year)-Number(a.balance_year)||numberSort(a.staff_no,b.staff_no)||Number(a.sort_order)-Number(b.sort_order)||String(a.leave_code).localeCompare(String(b.leave_code))||Number(a.id)-Number(b.id);
const amountKeys=['entitlement_days','carried_forward_days','adjustment_days','used_days','pending_days','expired_days'];
function rawBalance(f){return amountKeys.reduce((total,k,i)=>total+(i<3?1:-1)*(Number(f[k])||0),0);}
function balanceCalc(f){return Math.max(0,rawBalance(f));}
function Field({label,value,onChange,children,required=false,disabled=false}){return <label className="field"><span>{label}</span>{children||<input value={value??''} required={required} disabled={disabled} onChange={e=>onChange(e.target.value)}/>}</label>;}
function BalanceForm({mode,item,meta,busy,onClose,onSave}){
 const readOnly=mode==='view',edit=mode==='edit';
 const [f,setF]=useState(()=>item?{...blank,...Object.fromEntries(Object.entries(item).filter(([k])=>k in blank).map(([k,v])=>[k,String(v??'')]))}:{...blank});
 const change=(key,val)=>setF(prev=>({...prev,[key]:val,...(key==='leave_type_id'&&!edit?{entitlement_days:String(meta.leaveTypes.find(t=>String(t.id)===String(val))?.default_entitlement_days||'0.00')}: {})}));
 const chosenStaff=meta.staff.find(s=>String(s.id)===String(f.staff_profile_id));const chosenType=meta.leaveTypes.find(t=>String(t.id)===String(f.leave_type_id));
 const submit=e=>{e.preventDefault();onSave({...f,staff_profile_id:Number(f.staff_profile_id),leave_type_id:Number(f.leave_type_id),balance_year:Number(f.balance_year)},item?.id);};
 return <div className="overlay"><form className="dialog wide lb-dialog" onSubmit={submit}>
  <p className="eyebrow">HR / LEAVE BALANCES</p><h2>{readOnly?'View Leave Balance':edit?'Edit Leave Balance':'Add Leave Balance'}</h2>
  <p className="muted">One balance for each Staff, Leave Type and Year. HR changes are audited.</p>
  <section className="lb-section"><h3>Staff and Leave Type</h3><div className="form-two">
   <Field label="Staff *"><select required disabled={readOnly||edit} value={f.staff_profile_id} onChange={e=>change('staff_profile_id',e.target.value)}><option value="">Select staff</option>{meta.staff.filter(s=>edit||readOnly||(s.status==='active'&&s.user_status==='ACTIVE'&&['Active','Probation'].includes(s.employment_status))).map(s=><option key={s.id} value={s.id}>{s.staff_no} — {s.full_name}</option>)}</select></Field>
   <Field label="Leave Type *"><select required disabled={readOnly||edit} value={f.leave_type_id} onChange={e=>change('leave_type_id',e.target.value)}><option value="">Select Leave Type</option>{meta.leaveTypes.filter(t=>edit||readOnly||t.status==='active').map(t=><option key={t.id} value={t.id}>{t.leave_code} — {t.leave_name}</option>)}</select></Field>
   <Field label="Balance Year *"><input type="number" required min="2000" max="2100" disabled={readOnly||edit} value={f.balance_year} onChange={e=>change('balance_year',e.target.value)}/></Field>
   <Field label="Default Entitlement"><input value={chosenType?`${number(chosenType.default_entitlement_days)} days`:'—'} disabled readOnly/></Field>
  </div><div className="lb-hint">{chosenStaff?`${chosenStaff.staff_no} · ${chosenStaff.full_name} · ${chosenStaff.department||'No Department'}`:'Select an active staff profile.'} · One record per Staff / Leave Type / Year.</div></section>
  <section className="lb-section"><h3>Balance Calculation</h3><p className="muted">Entitlement + Carry Forward + Adjustment − Used − Pending − Expired.</p>
   <div className="form-two">{[
    ['entitlement_days','Entitlement Days'],['carried_forward_days','Carried Forward Days'],['adjustment_days','Adjustment Days (+/−)'],['used_days','Used Days'],['pending_days','Pending Days'],['expired_days','Expired Days']
   ].map(([k,label])=><Field key={k} label={label}><input type="number" inputMode="decimal" step="0.50" min={k==='adjustment_days'?-3660:0} max="3660" value={f[k]} disabled={readOnly} onChange={e=>change(k,e.target.value)}/></Field>)}</div>
   <div className="lb-calculated"><small>Calculated Remaining Balance — Read Only</small><strong>{number(balanceCalc(f))} days</strong>{rawBalance(f)<0&&<span className="lb-error" role="alert">Exceeds available entitlement. Saving is blocked until the amount is corrected.</span>}<span>Final values are calculated and validated by the server.</span></div>
  </section>
  <section className="lb-section"><h3>Adjustment Notes & Record Status</h3><Field label="Adjustment Notes"><textarea rows={3} disabled={readOnly} value={f.adjustment_notes} onChange={e=>change('adjustment_notes',e.target.value)} placeholder="Reason for opening allocation, carried forward, history or adjustment..."/></Field>
   <Field label="Record Status"><select disabled={readOnly} value={f.status} onChange={e=>change('status',e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
   {item?.last_recalculated_at&&<p className="muted">Last Recalculated: {item.last_recalculated_at}</p>}
  </section>
  <div className="dialog-actions"><button type="button" className="outline" onClick={onClose}>Close</button>{!readOnly&&<button type="submit" className="primary" disabled={busy}><Save size={17}/>{busy?'Saving...':'Save'}</button>}</div>
 </form></div>;
}
function ImportModal({notify,onClose,onDone}){
 const input=useRef(null),[csv,setCsv]=useState(''),[filename,setFilename]=useState(''),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false);
 const template=async()=>{try{const response=await fetch(apiUrl('/leave-balances/import/template'),{credentials:'include',cache:'no-store'});if(!response.ok)throw Error('CSV_TEMPLATE_UNAVAILABLE');const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='leave-balances-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}catch(e){notify(e.message,true);}};
 const upload=async file=>{if(!file)return;setFilename(file.name);setCsv(await file.text());setPreview(null);};
 const submit=async confirm=>{setBusy(true);try{const data=await request(`/leave-balances/import/${confirm?'confirm':'preview'}`,{method:'POST',body:{csv}});if(confirm){notify(`${data.count} Leave Balances imported.`);onDone();}else setPreview(data);}catch(e){notify(e.message,true);if(!confirm)setPreview(null);}finally{setBusy(false);}};
 return <div className="overlay"><div className="dialog wide lb-dialog"><p className="eyebrow">HR / IMPORT</p><h2>Import Leave Balances CSV</h2><p className="muted">Maximum 1,000 rows · 0.50-day steps · Existing balances cannot be overwritten. Preview before Confirm; all-or-nothing.</p>
  <div className="lb-import-actions"><button type="button" className="outline" onClick={template}><FileDown size={17}/> CSV Template</button><button type="button" className="outline" onClick={()=>input.current?.click()}><Upload size={17}/> Choose File</button><input ref={input} type="file" hidden accept=".csv,text/csv" onChange={e=>upload(e.target.files?.[0])}/><span className="muted">{filename||'No file chosen'}</span><button type="button" className="outline" disabled={!csv||busy} onClick={()=>submit(false)}>Preview</button></div>
  {preview&&<div className="lb-preview"><b>Rows: {preview.total} · Valid: {preview.valid} · Errors: {preview.invalid}</b>{preview.rows.filter(r=>r.errors?.length).slice(0,30).map(r=><p key={r.row} className="lb-error">Row {r.row} ({r.staffNo} / {r.leaveCode}): {r.errors.join('; ')}</p>)}{preview.invalid===0&&<p>All rows are valid and ready for Confirm.</p>}</div>}
  <div className="dialog-actions"><button type="button" className="outline" onClick={onClose}>Close</button><button type="button" className="primary" onClick={()=>submit(true)} disabled={!preview?.canConfirm||busy}>Confirm Import</button></div>
 </div></div>;
}
export default function LeaveBalances({profile,notify}){
 const permission=profile.user.permissions,canManage=permission.includes('leave_balances.manage'),canCreate=permission.includes('leave_balances.create'),canUpdate=permission.includes('leave_balances.update'),canGenerate=permission.includes('leave_balances.generate')&&canManage,canImport=permission.includes('leave_balances.import')&&canManage,canExport=permission.includes('leave_balances.export')&&canManage,canAudit=permission.includes('leave_balances.audit')&&canManage;
 const [records,setRecords]=useState([]),[meta,setMeta]=useState({staff:[],leaveTypes:[]}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[modal,setModal]=useState(null),[importing,setImporting]=useState(false),[generating,setGenerating]=useState(false),[generateYear,setGenerateYear]=useState(String(new Date().getFullYear())),[activity,setActivity]=useState(null);
 const [search,setSearch]=useState(''),[staff,setStaff]=useState(''),[leaveType,setLeaveType]=useState(''),[year,setYear]=useState(''),[department,setDepartment]=useState(''),[status,setStatus]=useState(''),[limit,setLimit]=useState('100');
 const load=useCallback(async()=>{setLoading(true);try{const [list,lookup]=await Promise.all([request('/leave-balances?limit=1000'),request('/leave-balances/meta')]);setRecords(list.items||[]);setMeta(lookup);return true;}catch(e){notify(e.message,true);return false;}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const filtered=useMemo(()=>records.filter(r=>{const term=search.trim().toLowerCase();return (!term||[r.staff_no,r.full_name,r.department,r.leave_code,r.leave_name].some(v=>String(v||'').toLowerCase().includes(term)))&&(!staff||String(r.staff_profile_id)===staff)&&(!leaveType||String(r.leave_type_id)===leaveType)&&(!year||String(r.balance_year)===year)&&(!department||r.department===department)&&(!status||r.status===status);}).sort(order),[records,search,staff,leaveType,year,department,status]);
 const visible=filtered.slice(0,Number(limit));
 const sum=k=>filtered.reduce((t,r)=>t+Number(r[k]||0),0);
 const stats=[['Total Records',String(filtered.length),Layers],['Entitlement',number(sum('entitlement_days')),CalendarDays],['Carry Forward',number(sum('carried_forward_days')),ArrowRightLeft],['Used',number(sum('used_days')),Calculator],['Pending',number(sum('pending_days')),Clock3],['Remaining',number(sum('remaining_days')),FileText]];
 const save=async(payload,id)=>{setBusy(true);try{await request(id?`/leave-balances/${id}`:'/leave-balances',{method:id?'PUT':'POST',body:payload});setModal(null);notify('Leave Balance saved.');await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}};
 const setRecordStatus=async row=>{const next=row.status==='active'?'inactive':'active';const reason=window.prompt(`Reason to ${next==='active'?'reactivate':'deactivate'} the leave balance (minimum 4 characters):`);if(reason===null)return;try{await request(`/leave-balances/${row.id}/status`,{method:'PATCH',body:{status:next,reason}});await load();notify('Leave Balance status updated.');}catch(e){notify(e.message,true);}};
 const generate=async()=>{setBusy(true);try{const result=await request('/leave-balances/generate',{method:'POST',body:{year:Number(generateYear)}});setGenerating(false);notify(`${result.count} missing Leave Balances generated for ${generateYear}.`);await load();}catch(e){notify(e.message,true);}finally{setBusy(false);}};
 const showAudit=async row=>{try{const data=await request(`/leave-balances/${row.id}/audit`);setActivity({row,logs:data.logs||[]});}catch(e){notify(e.message,true);}};
 const exportPdf=async()=>{setBusy(true);try{const blob=await createLeaveBalancesPdf(visible,{businessName:profile.business?.name||'TPOS V2'});downloadLeaveBalancesPdf(blob,'Leave Balances.pdf');}catch(e){notify(e.message,true);}finally{setBusy(false);}};
 const departments=[...new Set(meta.staff.map(s=>s.department).filter(Boolean))].sort();
 const years=[...new Set(records.map(r=>Number(r.balance_year)))].sort((a,b)=>b-a);
 return <main className="page lb-page"><div className="page-head"><div><p className="eyebrow">HR / LEAVE BALANCES</p><h1>Leave Balances</h1><p className="muted">Manage annual staff entitlement, usage and remaining balance.</p></div><div className="actions">
  {icon('Refresh Leave Balances',RefreshCw,()=>refreshPage(load,notify),loading)}
  {canExport&&icon('Export PDF A4 Landscape',FileDown,exportPdf,busy)}
  {canImport&&icon('Import CSV',Upload,()=>setImporting(true),busy)}
  {canGenerate&&icon('Generate Missing Balances',Sparkles,()=>setGenerating(true),busy)}
  {canCreate&&icon('Add Leave Balance',Plus,()=>setModal({mode:'add'}),busy)}
 </div></div>
 <div className="stat-grid lb-stats">{stats.map(([label,value,Icon])=><div className="stat" key={label}><Icon size={18}/><span>{label}</span><b>{value}</b></div>)}</div>
 <div className="table-panel"><div className="lb-filter">
  <label className="lb-search"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search staff, department or leave type..." aria-label="Search Leave Balances"/></label>
  <select value={staff} onChange={e=>setStaff(e.target.value)} aria-label="Staff Filter"><option value="">All Staff</option>{meta.staff.map(s=><option value={s.id} key={s.id}>{s.staff_no} — {s.full_name}</option>)}</select>
  <select value={leaveType} onChange={e=>setLeaveType(e.target.value)} aria-label="Leave Type Filter"><option value="">All Leave Types</option>{meta.leaveTypes.map(t=><option value={t.id} key={t.id}>{t.leave_code} — {t.leave_name}</option>)}</select>
  <select value={year} onChange={e=>setYear(e.target.value)} aria-label="Balance Year Filter"><option value="">All Years</option>{years.map(y=><option key={y}>{y}</option>)}</select>
  <select value={department} onChange={e=>setDepartment(e.target.value)} aria-label="Department Filter"><option value="">All Departments</option>{departments.map(d=><option key={d}>{d}</option>)}</select>
  <select value={status} onChange={e=>setStatus(e.target.value)} aria-label="Status Filter"><option value="">All Record Status</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
  <select value={limit} onChange={e=>setLimit(e.target.value)} aria-label="Rows Filter">{[25,50,100,200,500,1000].map(n=><option value={n} key={n}>{n} rows</option>)}</select>
 </div><div className="table-scroll"><table className="lb-table"><thead><tr>{['Staff','Leave Type','Year','Entitlement','Carry Forward','Adjustment','Used','Pending','Expired','Remaining','Status','Actions'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>
  {visible.map(r=><tr key={r.id}><td><b>{r.full_name}</b><small>{r.staff_no} · {r.department||'—'}</small></td><td><b>{r.leave_code}</b><small>{r.leave_name}</small></td><td>{r.balance_year}</td>{amountKeys.map(k=><td key={k} className="lb-number">{k==='adjustment_days'&&Number(r[k])>0?'+':''}{number(r[k])}</td>)}<td className="lb-number"><b>{number(r.remaining_days)}</b></td><td><span className={`pill ${r.status==='active'?'good':''}`}>{r.status==='active'?'Active':'Inactive'}</span></td><td><div className="row-actions">{icon('View Leave Balance',Eye,()=>setModal({mode:'view',item:r}))}{canUpdate&&icon('Edit Leave Balance',Pencil,()=>setModal({mode:'edit',item:r}))}{canManage&&icon('Recalculate (available after Leave Requests integration)',RefreshCw,()=>{},true)}{canUpdate&&icon(r.status==='active'?'Deactivate Leave Balance':'Reactivate Leave Balance',Power,()=>setRecordStatus(r))}{canAudit&&icon('Leave Balance Activity Log',History,()=>showAudit(r))}</div></td></tr>)}
  {!visible.length&&<tr><td className="empty" colSpan={12}>No Leave Balances match the selected filters. Generate missing balances or adjust filters.</td></tr>}
 </tbody></table></div></div>
 {modal&&<BalanceForm key={`${modal.mode}-${modal.item?.id||'new'}`} mode={modal.mode} item={modal.item} meta={meta} busy={busy} onClose={()=>setModal(null)} onSave={save}/>}
 {importing&&<ImportModal notify={notify} onClose={()=>setImporting(false)} onDone={()=>{setImporting(false);load();}}/>}
 {generating&&<div className="overlay"><div className="dialog lb-dialog"><p className="eyebrow">HR / GENERATE</p><h2>Generate Leave Balances</h2><p className="muted">Only active staff and active Leave Types. Existing balances will not be overwritten.</p><Field label="Balance Year *"><input type="number" value={generateYear} min="2000" max="2100" onChange={e=>setGenerateYear(e.target.value)}/></Field><p className="lb-hint">Recalculate is locked until the Leave Requests module is integrated.</p><div className="dialog-actions"><button className="outline" onClick={()=>setGenerating(false)}>Close</button><button className="primary" disabled={busy} onClick={generate}><Sparkles size={17}/> Generate</button></div></div></div>}
 {activity&&<div className="overlay"><div className="dialog wide lb-dialog"><p className="eyebrow">HR / AUDIT</p><h2>Leave Balance Activity Log — {activity.row.staff_no} · {activity.row.leave_code}</h2><div className="table-scroll"><table><thead><tr>{['Date','Action','Actor','Reason'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{activity.logs.map(l=><tr key={l.id}><td>{l.recorded_at}</td><td>{l.action_type.replaceAll('_',' ')}</td><td>{l.actor_name}</td><td>{l.reason}</td></tr>)}{!activity.logs.length&&<tr><td colSpan={4}>No activity recorded.</td></tr>}</tbody></table></div><div className="dialog-actions"><button className="outline" onClick={()=>setActivity(null)}>Close</button></div></div></div>}
 </main>;
}
