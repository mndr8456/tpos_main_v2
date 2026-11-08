import {MYINVOIS_COUNTRIES} from './einvoice-country-codes-r12.js';
import {useState,useEffect} from 'react';
import './EinvoiceRequestPublic.css';
const states=[['01','Johor'],['02','Kedah'],['03','Kelantan'],['04','Melaka'],['05','Negeri Sembilan'],['06','Pahang'],['07','Pulau Pinang'],['08','Perak'],['09','Perlis'],['10','Selangor'],['11','Terengganu'],['12','Sabah'],['13','Sarawak'],['14','Wilayah Persekutuan Kuala Lumpur'],['15','Wilayah Persekutuan Labuan'],['16','Wilayah Persekutuan Putrajaya']];
const countries=MYINVOIS_COUNTRIES;
const blank={buyerType:'INDIVIDUAL',buyerName:'',tin:'',identificationType:'NRIC',identificationNumber:'',sstNumber:'',email:'',phone:'',address1:'',address2:'',address3:'',postcode:'',city:'',state:'10',country:'MYS',consent:false};
async function api(path,options={}){
 const response=await fetch('/api/v2/einvoice/public/request/'+path,{...options,cache:'no-store',referrerPolicy:'no-referrer',headers:{...(options.body?{'Content-Type':'application/json'}:{})}});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.issues?.map(i=>i.path?.join('.')+': '+i.message).join('; ')||data.error||'Request unavailable');return data;
}
export default function EinvoiceRequestPublic({token}){
 const [info,setInfo]=useState(null),[error,setError]=useState(''),[working,setWorking]=useState(false),[form,setForm]=useState(blank),[sent,setSent]=useState(false);
 useEffect(()=>{document.title='Request e-Invoice · TPOS';let active=true;api(token).then(data=>{if(active)setInfo(data);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[token]);
 const set=(key,val)=>setForm(v=>({...v,[key]:val}));
 async function submit(e){e.preventDefault();setError('');setWorking(true);try{await api(token,{method:'POST',body:JSON.stringify(form)});setSent(true);}catch(e){setError(e.message);}finally{setWorking(false);}}
 function field(key,title,max,required=false,props={}){return <label className="einvr-field" key={key}><span>{title}{required?' *':''}</span><input required={required} maxLength={max} value={form[key]} onChange={e=>set(key,e.target.value)} {...props}/></label>;}
 return <main className="einvr-shell"><div className="einvr-card"><div className="einvr-heading"><h1>Request e-Invoice</h1><p>{info?.businessName||'TPOS'}</p></div>
 {error&&<div className="einvr-error" role="alert">{error}</div>}
 {!info&&!error&&<p>Loading receipt...</p>}
 {info&&<><div className="einvr-summary"><div>Receipt No. <strong>{info.receiptNumber}</strong></div><div>Amount Paid <strong>RM {Number(info.amount).toFixed(2)}</strong></div></div>
 {sent||info.status==='REQUESTED'?<div className="einvr-success"><h2>Request Received</h2><p>Your details have been recorded for processing. This is not an LHDN-validated e-Invoice.</p></div>:<form onSubmit={submit} autoComplete="off">
 <div className="einvr-field"><span>Buyer Type *</span><select value={form.buyerType} onChange={e=>setForm({...blank,buyerType:e.target.value,identificationType:e.target.value==='COMPANY'?'BRN':'NRIC',country:form.country,state:form.state})}><option value="INDIVIDUAL">Individual</option><option value="COMPANY">Company</option></select></div>
 {field('buyerName',form.buyerType==='COMPANY'?'Registered Company Name':'Full Name',300,true)}
 {field('tin','Buyer TIN',14,true)}
 <div className="einvr-grid"><label className="einvr-field"><span>ID Type *</span><select value={form.identificationType} onChange={e=>set('identificationType',e.target.value)}>{(form.buyerType==='COMPANY'?['BRN']:['NRIC','PASSPORT','ARMY']).map(x=><option key={x} value={x}>{x}</option>)}</select></label>{field('identificationNumber','ID Number',form.identificationType==='BRN'?20:12,true)}</div>
 {field('sstNumber','Buyer SST Registration Number',35,false,{placeholder:'Optional — if SST registered'})}
 {field('email','Email Address',320,false,{type:'email'})}
 {field('phone','Phone Number (E.164)',20,true,{placeholder:'+60123456789'})}
 <h2>Buyer Address</h2>
 {field('address1','Address 1',150,true)}{field('address2','Address 2',150)}{field('address3','Address 3',150)}
 <div className="einvr-grid">{field('postcode','Postcode',50)}{field('city','City',50,true)}</div>
 <div className="einvr-grid"><label className="einvr-field"><span>Country *</span><select value={form.country} onChange={e=>setForm(v=>({...v,country:e.target.value,state:e.target.value==='MYS'?'10':'17'}))}>{countries.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}</select></label>{form.country==='MYS'?<label className="einvr-field"><span>State *</span><select value={form.state} onChange={e=>set('state',e.target.value)}>{states.map(([code,name])=><option key={code} value={code}>{name} ({code})</option>)}</select></label>:field('state','State / Region (17 = Not Applicable)',50,true)}</div>
 <label className="einvr-consent"><input type="checkbox" required checked={form.consent} onChange={e=>set('consent',e.target.checked)}/><span>I agree to provide my details for this e-Invoice request.</span></label>
 <button type="submit" disabled={working}>{working?'Submitting...':'Submit e-Invoice Request'}</button>
 <p className="einvr-note">Submission records a customer request only. No document is submitted to LHDN at this stage.</p>
 </form>}
 </>}
 </div></main>;
}
