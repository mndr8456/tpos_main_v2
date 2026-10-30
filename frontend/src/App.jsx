import { useCallback,useEffect,useMemo,useState } from 'react';
import { Menu,Users,Shield,LogOut,Plus,Search,LockKeyhole,UnlockKeyhole,RefreshCw,Download,History,Upload,Pencil,KeyRound, X,Building2,Eye,EyeOff,LayoutDashboard } from 'lucide-react';
import { request } from './api.js';
import UsersImport from './UsersImport.jsx';
import Categories from './Categories.jsx';
import Dashboard from './Dashboard.jsx';
import { Tags,Truck,Package } from 'lucide-react';
import Suppliers from './Suppliers.jsx';
import Products from './Products.jsx';
import Discounts from './Discounts.jsx';
import Vouchers from './Vouchers.jsx';
import { BadgePercent,Ticket } from 'lucide-react';

const types=['RESTAURANT','GROCERY','RETAIL','MINI_MARKET','CAFE','FOOD_TRUCK','STREET_FOOD'];
const regFields=[['businessName','Registered Business Name'],['ssmRegistrationNumber','SSM Registration Number'],['ssmOldRegistrationNumber','Old SSM (optional)'],['tin','TIN (optional)'],['sstSalesTaxNumber','SST Number Sales Tax (optional)'],['sstServiceTaxNumber','SST Number Service Tax (optional)'],['phone','Business Phone (optional)'],['addressLine1','Address Line 1'],['addressLine2','Address Line 2 (optional)'],['city','City'],['postcode','Postcode'],['state','State'],['ownerName','Owner Full Name'],['ownerEmail','Owner Email'],['ownerPassword','Owner Password']];
const initialReg={businessType:'RESTAURANT'};
const landingPage=profile=>profile?.user?.permissions?.includes('dashboard.view')?'dashboard':profile?.user?.permissions?.includes('users.view')?'users':profile?.user?.permissions?.includes('categories.view')?'categories':'account';
const initialUser={fullName:'',username:'',email:'',phone:'',role:'CASHIER',branchId:'1',password:'',status:'ACTIVE'};
function Field({label,value,onChange,type='text',required=false,placeholder='',...rest}){
 return <label className="field"><span>{label}</span><input type={type} value={value ?? ''} onChange={e=>onChange(e.target.value)} required={required} placeholder={placeholder} {...rest}/></label>;
}
function Notice({error,message,onClose}){return (error||message)?<div className={`notice ${error?'error':'success'}`} role="status">{error||message}<button type="button" onClick={onClose} aria-label="Dismiss">×</button></div>:null;}
function AuthView({onAuth}){
 // The registration page is intentionally available only at /register, not as a login tab.
 const isRegistration=window.location.pathname.replace(/\/+$/,'')==='/register';
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[reveal,setReveal]=useState(false);
 const [form,setForm]=useState(initialReg),[registrationKey,setRegistrationKey]=useState('');
 const [error,setError]=useState(''),[message,setMessage]=useState(()=>!isRegistration&&new URLSearchParams(window.location.search).get('registered')==='1'?'Registered Successfull':'');
 const [busy,setBusy]=useState(false);
 const update=(key,val)=>setForm(p=>({...p,[key]:val}));
 async function submit(e){e.preventDefault();setBusy(true);setError('');setMessage('');try{
  if(!isRegistration){const r=await request('/auth/login',{method:'POST',body:{email,password}});onAuth(r);}
  else {
   await request('/tenants/register',{method:'POST',body:form,headers:{'X-Registration-Key':registrationKey}});
   window.location.replace('/login?registered=1');
  }
 }catch(e){setError(e.message);}finally{setBusy(false);}}
 return <main className={`auth-layout ${isRegistration ? 'auth-register' : 'auth-login'}`}><section className="welcome"><div className="brand">TPOS <span>V2</span></div><p className="eyebrow">CLEAN REBUILD • FOUNDATION R1</p><h1>One workspace.<br/>Every business.</h1><p>A new tenant-isolated foundation, starting with Users, access controls and an auditable login.</p><div className="welcome-points"><span>Central tenant directory</span><span>Branch-based user access</span><span>Account lockout and audit trail</span></div></section>
  <section className="auth-panel">
   <Notice error={error} message={message} onClose={()=>{setError('');setMessage('');}}/>
   <form onSubmit={submit} className="auth-form"><h2>{isRegistration?'New business registration':'Welcome back'}</h2><p className="muted">{isRegistration?'A new tenant database will be created for this business. Administrator authorization is required.':'Sign in using your email. The tenant is detected automatically.'}</p>
   {!isRegistration?<><Field label="Email" type="email" value={email} onChange={setEmail} required autoComplete="username"/><label className="field"><span>Password</span><div className="password-input"><input type={reveal?'text':'password'} required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/><button type="button" onClick={()=>setReveal(v=>!v)} aria-label="Show or hide password">{reveal?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label></>:
   <><Field label="Administrator Registration Key" type="password" required value={registrationKey} onChange={setRegistrationKey} autoComplete="off"/><label className="field"><span>Business Type</span><select value={form.businessType} onChange={e=>update('businessType',e.target.value)}>{types.map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label><div className="form-two">{regFields.map(([key,label])=><Field key={key} label={label} type={key==='ownerEmail'?'email':key==='ownerPassword'?'password':'text'} required={!label.includes('(optional)')} value={form[key]} onChange={v=>update(key,v)} placeholder={key==='ownerPassword'?'12+ chars with letters and numbers':''}/>)}</div></>}
   <button className="primary" disabled={busy} type="submit">{busy?'Working...':isRegistration?'Create Business & Owner':'Sign In'}</button>
   {isRegistration&&<a className="outline" href="/login">Back to Sign In</a>}
   </form>
   <footer className="auth-footer">© 2026 TPOS V2 — MNII Alpha Ent</footer>
  </section></main>;
}
function exportUsersCsv(users){
 const headers=['ID','Full Name','Username','Email','Phone','Role','Status','Branch','Last Login'];
 const props=['id','full_name','username','email','phone','role_code','status','branch_name','last_login_at'];
 const esc=v=>{const text=String(v??'');const safe=/^[=+@-]/.test(text)?`'${text}`:text;return `"${safe.replaceAll('\"','\"\"')}"`;};
 const data=[headers,...users.map(u=>props.map(k=>u[k]))].map(row=>row.map(esc).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+data],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='tpos-users.csv';a.click();URL.revokeObjectURL(url);
}
const formatted=v=>v?String(v).replace('T',' ').slice(0,19):'—';
function UserForm({original,meta,onCancel,onSave,busy}){
 const editing=Boolean(original);
 const [form,setForm]=useState(original?{fullName:original.full_name,username:original.username,email:original.email,phone:original.phone||'',role:original.role_code,branchId:original.branch_id||meta.branches[0]?.id||'1',status:original.status,password:''}:{...initialUser,branchId:meta.branches[0]?.id||'1',role:meta.roles.some(r=>r.code==='CASHIER')?'CASHIER':(meta.roles[0]?.code||'CASHIER')});
 const update=(key,v)=>setForm(s=>({...s,[key]:v}));
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}><form className="dialog" onSubmit={e=>{e.preventDefault();onSave(form);}}><div className="dialog-head"><h2>{editing?'Edit User':'Add User'}</h2><button type="button" className="icon-button" onClick={onCancel}><X size={20}/></button></div>
 <div className="form-two"><Field label="Full Name" required value={form.fullName} onChange={v=>update('fullName',v)}/><Field label="Username" required value={form.username} onChange={v=>update('username',v)} placeholder="letters, digits, . _ -"/>
 <Field label="Email" required type="email" value={form.email} onChange={v=>update('email',v)}/><Field label="Phone (optional)" value={form.phone} onChange={v=>update('phone',v)}/>
 <label className="field"><span>Role</span><select value={form.role} onChange={e=>update('role',e.target.value)}>{meta.roles.map(r=><option value={r.code} key={r.code}>{r.name}</option>)}</select></label>
 <label className="field"><span>Branch</span><select value={form.branchId} onChange={e=>update('branchId',e.target.value)}>{meta.branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
 {!editing?<Field label="Temporary Password (12+ characters, letters + numbers)" required type="password" value={form.password} onChange={v=>update('password',v)}/>:<label className="field"><span>Status</span><select value={form.status} onChange={e=>update('status',e.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>}</div>
 <div className="dialog-actions"><button type="button" className="outline" onClick={onCancel}>Cancel</button><button className="primary" type="submit" disabled={busy}>{busy?'Saving...':editing?'Save Changes':'Create User'}</button></div></form></div>;
}
function EmailEditor({original,self,busy,onCancel,onSave}){
 const [email,setEmail]=useState(original.email);
 const [currentPassword,setCurrentPassword]=useState('');
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}><form className="dialog" onSubmit={e=>{e.preventDefault();onSave({email,currentPassword:self?currentPassword:undefined});}}>
  <div className="dialog-head"><h2>Change Email</h2><button type="button" className="icon-button" aria-label="Close" onClick={onCancel}><X size={20}/></button></div>
  <p className="muted">{original.full_name} — Login email. {self?'You will need to sign in again after this change.':'This user will need to sign in again after this change.'}</p>
  <Field label="Email" required type="email" value={email} onChange={setEmail}/>
  {self&&<Field label="Current Password" required type="password" autoComplete="current-password" value={currentPassword} onChange={setCurrentPassword}/>}
  <div className="dialog-actions"><button type="button" className="outline" onClick={onCancel}>Cancel</button><button type="submit" className="primary" disabled={busy}>{busy?'Saving...':'Save Email'}</button></div>
 </form></div>;
}
function UsersView({profile,notify,onAccountEmailChanged}){
 const [users,setUsers]=useState([]),[meta,setMeta]=useState({roles:[],branches:[]}),[query,setQuery]=useState(''),[filter,setFilter]=useState('ALL'),[editing,setEditing]=useState(undefined),[emailEditing,setEmailEditing]=useState(null),[showImport,setShowImport]=useState(false),[showAudit,setShowAudit]=useState(false),[logs,setLogs]=useState([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false);
 const canManage=profile.user.permissions.includes('users.manage');
 const canEditOthersEmail=['OWNER','ADMIN','HR'].includes(profile.user.role);
 const canAudit=profile.user.permissions.includes('users.audit');
 const load=useCallback(async()=>{setLoading(true);try{const [a,b]=await Promise.all([request('/users'),request('/users/meta')]);setUsers(a.users);setMeta(b);}catch(e){notify(e.message,true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const filtered=useMemo(()=>users.filter(u=>{
  const words=`${u.full_name} ${u.username} ${u.email} ${u.role_code} ${u.branch_name||''}`.toLowerCase();
  const locked=u.locked_until && new Date(u.locked_until.replace(' ','T')+'Z').getTime()>Date.now();
  return words.includes(query.toLowerCase()) && (filter==='ALL'||(filter==='LOCKED'?locked:u.status===filter));
 }),[users,query,filter]);
 const counts={total:users.length,active:users.filter(u=>u.status==='ACTIVE').length,inactive:users.filter(u=>u.status==='INACTIVE').length,locked:users.filter(u=>u.locked_until&&new Date(u.locked_until.replace(' ','T')+'Z').getTime()>Date.now()).length};
 async function save(form){setBusy(true);try{
  const edited=editing && editing!=='new';
  const body={fullName:form.fullName,username:form.username,email:form.email,phone:form.phone,role:form.role,branchId:form.branchId,status:form.status,password:form.password};
  if(edited){delete body.password;await request(`/users/${editing.id}`,{method:'PUT',body});}
  else {delete body.status;await request('/users',{method:'POST',body});}
  setEditing(undefined);notify(edited?'User updated.':'User created.');await load();
 }catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function saveEmail({email,currentPassword}){setBusy(true);try{
  const self=String(emailEditing.id)===String(profile.user.id);
  const payload={email,...(self?{currentPassword}:{})};
  const result=await request(`/users/${emailEditing.id}/email`,{method:'PATCH',body:payload});
  setEmailEditing(null);
  if(result.mustSignInAgain){onAccountEmailChanged();return;}
  notify(result.message==='EMAIL_UNCHANGED'?'Email unchanged.':'Email updated. The user must sign in again.');
  await load();
 }catch(e){notify(e.message,true);}finally{setBusy(false);}}
 async function unlock(user){if(!window.confirm(`Unlock ${user.full_name}?`))return;try{await request(`/users/${user.id}/unlock`,{method:'POST',body:{}});notify('Account unlocked.');await load();}catch(e){notify(e.message,true);}}
 async function resetPassword(user){const value=window.prompt(`Enter a new temporary password for ${user.full_name} (12+ characters, letters and numbers):`);if(value===null)return;try{await request(`/users/${user.id}/password-reset`,{method:'POST',body:{password:value}});notify('Password reset. User must change it at next sign-in.');}catch(e){notify(e.message,true);}}
 async function audit(){try{const result=await request('/users/audit/logs');setLogs(result.logs);setShowAudit(true);}catch(e){notify(e.message,true);}}
 return <div className="page"><div className="page-head"><div><p className="eyebrow">PEOPLE / ACCESS MANAGEMENT</p><h1>Users</h1><p className="muted">Manage identities, roles, branch access and security.</p></div><div className="actions">{canAudit&&<button className="outline action-icon" aria-label="Activity Log" title="Activity Log" onClick={audit}><History size={19}/></button>}{canManage&&<button className="outline action-icon" aria-label="Import Users" title="Import Users" onClick={()=>setShowImport(true)}><Upload size={19}/></button>}<button className="outline action-icon" aria-label="Export Users CSV" title="Export Users CSV" onClick={()=>exportUsersCsv(filtered)}><Download size={19}/></button>{canManage&&<button className="primary action-icon" aria-label="Add User" title="Add User" onClick={()=>setEditing('new')}><Plus size={19}/></button>}</div></div>
 <div className="stat-grid"><div className="stat"><Users size={19}/><span>Total Users</span><b>{counts.total}</b></div><div className="stat"><Shield size={19}/><span>Active</span><b>{counts.active}</b></div><div className="stat"><LockKeyhole size={19}/><span>Locked Accounts</span><b>{counts.locked}</b></div><div className="stat"><span>Inactive</span><b>{counts.inactive}</b></div></div>
 <div className="table-panel"><div className="tools"><div className="search"><Search size={17}/><input aria-label="Search users" placeholder="Search users, email or role..." value={query} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="Filter users" value={filter} onChange={e=>setFilter(e.target.value)}><option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="LOCKED">Locked</option></select><button className="icon-button" title="Refresh" onClick={load} disabled={loading}><RefreshCw size={18}/></button></div>
 <div className="table-scroll"><table><thead><tr>{['#','User','Username','Role','Branch','Status','Last Login','Security','Actions'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{filtered.map((u,index)=>{
  const locked=u.locked_until&&new Date(u.locked_until.replace(' ','T')+'Z').getTime()>Date.now();
  return <tr key={u.id}><td>{index+1}</td><td><strong>{u.full_name}</strong><small>{u.email}</small></td><td>{u.username}</td><td>{u.role_code}</td><td>{u.branch_name||'—'}</td><td><span className={`pill ${u.status==='ACTIVE'?'good':'off'}`}>{u.status}</span></td><td>{formatted(u.last_login_at)}</td><td>{locked?<span className="pill warn">LOCKED</span>:u.must_change_password?<span className="pill warn">PASSWORD CHANGE</span>:<span className="pill good">NORMAL</span>}</td><td><div className="row-actions">{canManage&&u.role_code!=='OWNER'&&String(profile.user.id)!==String(u.id)&&<><button aria-label={`Edit ${u.full_name}`} title="Edit User" onClick={()=>setEditing(u)}><Pencil size={16}/></button><button aria-label={`Reset password for ${u.full_name}`} title="Reset Password" onClick={()=>resetPassword(u)}><KeyRound size={16}/></button></>}{(String(profile.user.id)===String(u.id)||(canEditOthersEmail&&u.role_code!=='OWNER'&&!canManage))&&<button aria-label={`Change email for ${u.full_name}`} title="Change Email" onClick={()=>setEmailEditing(u)}><Pencil size={16}/></button>}{canManage&&locked&&<button aria-label={`Unlock ${u.full_name}`} title="Unlock User" onClick={()=>unlock(u)}><UnlockKeyhole size={16}/></button>}</div></td></tr>;
 })}{!filtered.length&&<tr><td colSpan={9} className="empty">{loading?'Loading users...':'No users match your search.'}</td></tr>}</tbody></table></div></div>
 {emailEditing&&<EmailEditor original={{...emailEditing,email:emailEditing.email,full_name:emailEditing.full_name}} self={String(emailEditing.id)===String(profile.user.id)} busy={busy} onCancel={()=>setEmailEditing(null)} onSave={saveEmail}/>}
 {showImport&&<UsersImport onClose={()=>setShowImport(false)} onImported={async created=>{setShowImport(false);notify(`${created} user(s) imported successfully.`);await load();}}/>}
 {editing&&<UserForm original={editing==='new'?null:editing} meta={meta} busy={busy} onCancel={()=>setEditing(undefined)} onSave={save}/>}
 {showAudit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAudit(false);}}><div className="dialog wide"><div className="dialog-head"><h2>User Activity Log</h2><button className="icon-button" onClick={()=>setShowAudit(false)}><X size={20}/></button></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Event</th><th>Actor</th><th>User</th></tr></thead><tbody>{logs.map((x,i)=><tr key={i}><td>{formatted(x.created_at)}</td><td>{x.event_type}</td><td>{x.actor_user_id??'—'}</td><td>{x.target_user_id??'—'}</td></tr>)}{!logs.length&&<tr><td colSpan={4}>No activity yet.</td></tr>}</tbody></table></div></div></div>}
 </div>;
}
function PasswordView({onDone,notify}){
 const [current,setCurrent]=useState(''),[next,setNext]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){e.preventDefault();setBusy(true);try{await request('/auth/change-password',{method:'POST',body:{currentPassword:current,newPassword:next}});notify('Password updated. Please sign in again.');onDone();}catch(e){notify(e.message,true);}finally{setBusy(false);}}
 return <div className="page"><div className="table-panel narrow"><h2>Change your password</h2><p className="muted">A new password is required before you can access other modules.</p><form className="auth-form" onSubmit={submit}><Field type="password" label="Current Password" required value={current} onChange={setCurrent}/><Field type="password" label="New Password (12+ characters, letters and numbers)" required value={next} onChange={setNext}/><button disabled={busy} type="submit" className="primary">Change Password</button></form></div></div>;
}
export function App(){
 const [profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[sidebar,setSidebar]=useState(false),[notice,setNotice]=useState({error:'',message:''}),[page,setPage]=useState('dashboard'),[selfEmailEdit,setSelfEmailEdit]=useState(false),[selfEmailBusy,setSelfEmailBusy]=useState(false);
 const notify=useCallback((message,error=false)=>setNotice(error?{error:message,message:''}:{error:'',message}),[]);
 useEffect(()=>{request('/auth/me').then(p=>{setProfile(p);setPage(landingPage(p));}).catch(()=>{}).finally(()=>setLoading(false));},[]);
 // Keep the menu open until the hamburger is clicked again, outside is clicked, or Escape is pressed.
 useEffect(()=>{
  if(!sidebar)return;
  const onEscape=e=>{if(e.key==='Escape')setSidebar(false);};
  window.addEventListener('keydown',onEscape);
  return ()=>window.removeEventListener('keydown',onEscape);
 },[sidebar]);
 async function signOut(){try{await request('/auth/logout',{method:'POST',body:{}});}catch{}setProfile(null);setSidebar(false);}
 if(loading)return <div className="loading">Loading TPOS...</div>;
 if(!profile)return <AuthView onAuth={p=>{setProfile(p);setPage(landingPage(p));setSidebar(false);setNotice({error:'',message:''});}}/>;
 const canViewDashboard=profile.user.permissions.includes('dashboard.view');
 const hasView=profile.user.permissions.includes('users.view');
 const canViewCategories=profile.user.permissions.includes('categories.view');
 const canViewSuppliers=profile.user.permissions.includes('suppliers.view');
 const canViewProducts=profile.user.permissions.includes('products.view');
 const canViewDiscounts=profile.user.permissions.includes('discounts.view');
 const canViewVouchers=profile.user.permissions.includes('vouchers.view');
 return <div className="workspace">
 {sidebar&&<button type="button" className="sidebar-scrim" aria-label="Close navigation" onClick={()=>setSidebar(false)} tabIndex={-1}/>}
 <aside id="workspace-navigation" aria-label="Workspace navigation" className={sidebar?'sidebar open':'sidebar'}><div className="side-brand">TPOS <span>V2</span></div><p className="side-label">WORKSPACE</p>{canViewDashboard&&<button className={page==='dashboard'?'nav active':'nav'} onClick={()=>{setPage('dashboard');setSidebar(false);}}><LayoutDashboard size={18}/> Dashboard</button>}<button className={page==='users'?'nav active':'nav'} onClick={()=>{setPage('users');setSidebar(false);}} disabled={!hasView}><Users size={18}/> Users</button><button className={page==='categories'?'nav active':'nav'} onClick={()=>{setPage('categories');setSidebar(false);}} disabled={!canViewCategories}><Tags size={18}/> Categories</button>{canViewSuppliers&&<button className={page==='suppliers'?'nav active':'nav'} onClick={()=>{setPage('suppliers');setSidebar(false);}}><Truck size={18}/> Suppliers</button>}{canViewProducts&&<button className={page==='products'?'nav active':'nav'} onClick={()=>{setPage('products');setSidebar(false);}}><Package size={18}/> Products</button>}{canViewDiscounts&&<button className={page==='discounts'?'nav active':'nav'} onClick={()=>{setPage('discounts');setSidebar(false);}}><BadgePercent size={18}/> Discounts</button>}{canViewVouchers&&<button className={page==='vouchers'?'nav active':'nav'} onClick={()=>{setPage('vouchers');setSidebar(false);}}><Ticket size={18}/> Vouchers</button>}</aside>
 <div className="main-column"><header className="topbar"><div className="top-left"><button type="button" className="icon-button" aria-label={sidebar?"Close navigation":"Open navigation"} title={sidebar?"Close navigation":"Open navigation"} aria-controls="workspace-navigation" aria-expanded={sidebar} onClick={()=>setSidebar(current=>!current)}><Menu size={21}/></button><div className="workspace-name"><Building2 size={18}/><div><b>{profile.business.name}</b><small>{profile.user.role} / {profile.business.type||'Business'}</small></div></div></div><div className="top-right"><span>{profile.user.fullName}</span><button className="outline action-icon" title="Sign Out" aria-label="Sign Out" onClick={signOut}><LogOut size={19}/></button></div></header>
  <Notice error={notice.error} message={notice.message} onClose={()=>setNotice({error:'',message:''})}/>
  {profile.user.mustChangePassword?<PasswordView onDone={()=>setProfile(null)} notify={notify}/>:page==='dashboard'&&canViewDashboard?<Dashboard profile={profile} onNavigate={next=>{setPage(next);setSidebar(false);}}/>:page==='categories'&&canViewCategories?<Categories profile={profile} notify={notify}/>:page==='suppliers'&&canViewSuppliers?<Suppliers profile={profile} notify={notify}/>:page==='products'&&canViewProducts?<Products profile={profile} notify={notify}/>:page==='discounts'&&canViewDiscounts?<Discounts profile={profile} notify={notify}/>:page==='vouchers'&&canViewVouchers?<Vouchers profile={profile} notify={notify}/>:hasView?<UsersView profile={profile} notify={notify} onAccountEmailChanged={()=>{setProfile(null);setSidebar(false);notify('Email changed. Sign in again using the new email.');}}/>:<main className="page"><h1>My Account</h1><p>Your account is active. User management requires explicit permission.</p><p>Login Email: {profile.user.email}</p><button className="outline" onClick={()=>setSelfEmailEdit(true)}>Change Email</button>{selfEmailEdit&&<EmailEditor original={{id:profile.user.id,email:profile.user.email,full_name:profile.user.fullName}} self={true} busy={selfEmailBusy} onCancel={()=>setSelfEmailEdit(false)} onSave={async data=>{setSelfEmailBusy(true);try{const result=await request(`/users/${profile.user.id}/email`,{method:'PATCH',body:data});setSelfEmailEdit(false);if(result.mustSignInAgain){setProfile(null);notify('Email changed. Sign in again using the new email.');}else notify('Email unchanged.');}catch(e){notify(e.message,true);}finally{setSelfEmailBusy(false);}}}/>}</main>}
 <footer className="app-footer">© 2026 TPOS V2 — MNII Alpha Ent</footer>
 </div></div>;
}
