import { useRef, useState } from 'react';
import { Check, Download, FileUp, X } from 'lucide-react';
import { request } from './api.js';

const MAX_BYTES=256*1024;
const template='\uFEFFfull_name,username,email,phone_no,role,status,temporary_password,branch_code\r\n';
const descriptions={CSV_COLUMN_COUNT:'Wrong number of columns',USER_VALIDATION_ERROR:'Check name, username, email, phone or temporary password',OWNER_PROTECTED:'Owner cannot be imported',USER_ROLE_INVALID:'Unknown role',USER_STATUS_INVALID:'Status must be ACTIVE or INACTIVE',BRANCH_CODE_INVALID:'Invalid branch code',INVALID_BRANCH:'Branch not found or inactive',BRANCH_CODE_REQUIRED:'Enter branch_code when multiple branches exist',BRANCH_ACCESS_DENIED:'You cannot manage this branch',CSV_DUPLICATE_IDENTITY:'Duplicate email or username in CSV',EMAIL_ALREADY_REGISTERED:'Email already registered',USERNAME_ALREADY_REGISTERED:'Username already registered'};
function downloadTemplate(){
 const url=URL.createObjectURL(new Blob([template],{type:'text/csv;charset=utf-8'}));
 const anchor=document.createElement('a');anchor.href=url;anchor.download='users-import-template.csv';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function UsersImport({onClose,onImported}){
 const [fileName,setFileName]=useState(''),[csv,setCsv]=useState(''),[preview,setPreview]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const committing=useRef(false);
 async function choose(e){
  const file=e.target.files?.[0];setPreview(null);setError('');setCsv('');setFileName(file?.name||'');
  if(!file)return;
  if(!file.name.toLowerCase().endsWith('.csv')){setError('Choose a CSV file (.csv).');return;}
  if(file.size>MAX_BYTES){setError('CSV file must be 256 KB or smaller.');return;}
  try{setCsv(await file.text());}catch{setError('Could not read CSV file.');}
 }
 async function previewImport(){
  if(!csv||busy)return;
  setBusy(true);setError('');setPreview(null);
  try{setPreview(await request('/users/import/preview',{method:'POST',body:{csv}}));}
  catch(e){setError(e.message);}
  finally{setBusy(false);}
 }
 async function confirmImport(){
  if(!preview?.valid||busy||committing.current)return;
  committing.current=true;setBusy(true);setError('');
  try{
   const result=await request('/users/import',{method:'POST',body:{csv}});
   setCsv('');setPreview(null);onImported(result.created);
  }catch(e){
   setError(`${e.message}. Check Users before trying again if the connection was interrupted.`);
   setPreview(null);
  }finally{committing.current=false;setBusy(false);}
 }
 function close(){if(busy)return;setCsv('');setPreview(null);onClose();}
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}><section className="dialog import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-users-title">
  <div className="dialog-head"><h2 id="import-users-title">Import Users</h2><button className="icon-button" type="button" title="Close" aria-label="Close import" onClick={close} disabled={busy}><X size={20}/></button></div>
  <p className="muted">Import new accounts from CSV. Review every row before confirming. Existing users and Owner accounts cannot be replaced.</p>
  <div className="import-info">Use the V1 columns: <code>full_name, username, email, phone_no, role, status, temporary_password</code>. The optional <code>branch_code</code> column supports multiple branches. Leave it blank only when there is exactly one active branch.</div>
  <div className="import-row"><button className="outline" type="button" onClick={downloadTemplate} disabled={busy}><Download size={17}/> Download CSV Template</button><label className="import-file"><FileUp size={17}/> {fileName||'Choose CSV File'}<input type="file" accept=".csv,text/csv" onChange={choose} disabled={busy}/></label></div>
  <p className="import-help">Maximum 50 users, 256 KB per file. Passwords must contain letters and digits and be 12–128 characters. They are not shown in preview or activity logs and must be changed on first login. Delete the CSV securely after importing.</p>
  {error&&<p className="import-error" role="alert">{error}</p>}
  <div className="import-row"><button className="primary" type="button" onClick={previewImport} disabled={!csv||busy}>Preview Import</button>{preview&&<span role="status" className={preview.valid?'import-ok':'import-error'}>{preview.valid?'All rows valid. Review before confirming.':'Fix invalid rows. No users imported.'}</span>}</div>
  {preview&&<div className="import-table-wrap"><table><thead><tr><th>Row</th><th>Full Name / Email</th><th>Username</th><th>Role / Branch</th><th>Status</th><th>Validation</th></tr></thead><tbody>{preview.rows.map(r=><tr key={r.line}><td>{r.line}</td><td><strong>{r.fullName||'—'}</strong><small>{r.email||'—'}</small></td><td>{r.username||'—'}</td><td>{r.role||'—'}<small>{r.branchCode||'Default branch'}</small></td><td>{r.status||'—'}</td><td className={r.error?'import-error':'import-ok'}>{r.error?(descriptions[r.error]||r.error):'Ready'}</td></tr>)}</tbody></table></div>}
  <div className="dialog-actions"><button className="outline" type="button" onClick={close} disabled={busy}>Cancel</button><button className="primary" type="button" onClick={confirmImport} disabled={!preview?.valid||busy}><Check size={17}/> {busy?'Working...':'Confirm Import'}</button></div>
 </section></div>;
}
