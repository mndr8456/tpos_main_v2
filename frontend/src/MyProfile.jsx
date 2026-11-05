import {useState} from 'react';
import {Mail,KeyRound,UserRound,ShieldCheck} from 'lucide-react';
import {request} from './api.js';

export default function MyProfile({profile,notify,onSignInRequired}){
 const [email,setEmail]=useState(profile.user.email||'');
 const [emailPassword,setEmailPassword]=useState('');
 const [currentPassword,setCurrentPassword]=useState('');
 const [nextPassword,setNextPassword]=useState('');
 const [confirmPassword,setConfirmPassword]=useState('');
 const [busy,setBusy]=useState(false);
 const sameEmail=email.trim().toLowerCase()===(profile.user.email||'').toLowerCase();
 const passwordReady=nextPassword.length>=12&&nextPassword.length<=128&&nextPassword===confirmPassword&&currentPassword.length>0;
 async function updateEmail(e){
  e.preventDefault();if(sameEmail||busy)return;
  setBusy(true);
  try{
   const r=await request(`/users/${profile.user.id}/email`,{method:'PATCH',body:{email:email.trim(),currentPassword:emailPassword}});
   if(r.mustSignInAgain){onSignInRequired('Email updated. Sign in again using your new email.');return;}
   notify(r.message==='EMAIL_UNCHANGED'?'Email unchanged.':'Email updated.');setEmailPassword('');
  }catch(error){notify(error.message,true);}finally{setBusy(false);}
 }
 async function updatePassword(e){
  e.preventDefault();if(!passwordReady||busy)return;
  setBusy(true);
  try{
   await request('/auth/change-password',{method:'POST',body:{currentPassword,newPassword:nextPassword}});
   onSignInRequired('Password changed. Sign in again with your new password.');
  }catch(error){notify(error.message,true);}finally{setBusy(false);}
 }
 return <main className="page my-profile-page">
  <div className="page-head"><div><p className="eyebrow">ACCOUNT / PROFILE</p><h1>My Profile</h1><p className="muted">Change your own login email or password. Other staff accounts are not accessible here.</p></div></div>
  <div className="my-profile-heading"><UserRound size={20}/><div><strong>{profile.user.fullName}</strong><span>{profile.user.role} · {profile.business.name}</span></div></div>
  <div className="my-profile-grid">
   <form className="table-panel my-profile-panel" onSubmit={updateEmail}>
    <h2><Mail size={20}/> Change Email</h2>
    <label className="field"><span>Login Email</span><input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></label>
    <label className="field"><span>Current Password *</span><input type="password" required autoComplete="current-password" value={emailPassword} onChange={e=>setEmailPassword(e.target.value)} disabled={busy}/></label>
    <p className="muted">You must sign in again after changing your email.</p>
    <button className="primary" type="submit" disabled={busy||sameEmail||!emailPassword.trim()}>Save Email</button>
   </form>
   <form className="table-panel my-profile-panel" onSubmit={updatePassword}>
    <h2><KeyRound size={20}/> Change Password</h2>
    <label className="field"><span>Current Password *</span><input type="password" required autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} disabled={busy}/></label>
    <label className="field"><span>New Password *</span><input type="password" required autoComplete="new-password" minLength={12} maxLength={128} value={nextPassword} onChange={e=>setNextPassword(e.target.value)} disabled={busy}/></label>
    <label className="field"><span>Confirm New Password *</span><input type="password" required autoComplete="new-password" minLength={12} maxLength={128} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} disabled={busy}/></label>
    <p className="muted"><ShieldCheck size={15}/> Minimum 12 characters. You will sign in again after saving.</p>
    <button className="primary" type="submit" disabled={busy||!passwordReady}>Change Password</button>
   </form>
  </div>
 </main>;
}
