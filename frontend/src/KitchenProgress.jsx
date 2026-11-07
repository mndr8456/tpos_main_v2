import {useCallback,useEffect,useState} from 'react';
import {ChefHat,RefreshCw} from 'lucide-react';
import {request} from './api.js';
import './KitchenDisplay.css';
// Read-only kitchen summary for WAITER and CASHIER, deliberately independent of payment status.
export default function KitchenProgress({kind,orderId}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const result=await request(`/kds/${kind}/${orderId}/status`);setData(result);setError('');}catch(e){setError(e.message);}},[kind,orderId]);
 useEffect(()=>{void load();const timer=setInterval(()=>{void load();},10000);return ()=>clearInterval(timer);},[load]);
 return <section className="kds-source-progress" aria-label="Kitchen preparation progress"><div className="kds-source-head"><span><ChefHat size={16}/> Kitchen Status: <strong>{data?.status==='NOT_REQUIRED'?'No preparation required':data?.status||'Loading…'}</strong></span><button type="button" className="outline" title="Refresh kitchen status" onClick={()=>void load()}><RefreshCw size={15}/></button></div>{error&&<p role="alert">Kitchen: {error}</p>}{!!data?.stations?.length&&<div className="kds-station-badges">{data.stations.map(s=><span key={s.id}>{s.name}: <b>{s.status}</b></span>)}</div>}</section>;
}
