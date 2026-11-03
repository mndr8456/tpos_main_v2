import {refreshPage} from './refresh-page.js';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Banknote,Plus,Eye,RefreshCw,Download,History,X,Save,ArrowDownLeft,ArrowUpRight,LockKeyhole,Search,ShieldAlert,Printer} from 'lucide-react';
import {request,apiOrigin} from './api.js';
import {currency,moneyToSen,senToMYR,auditDetails} from './cash-shift-display.js';
import {SHIFT_DENOMINATIONS,physicalCountTotal,centsAsMoney} from './cash-shift-denominations.js';

const malaysiaTime=value=>{
 if(!value)return '—';
 const text=String(value).replace(' ','T');
 const date=new Date(`${text.endsWith('Z')?text:text+'Z'}`);
 return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date);
};
const errorText=error=>({CASHIER_ALREADY_HAS_OPEN_SHIFT:'A cashier may have only one open shift.',SHIFT_ALREADY_CLOSED:'This shift is already closed.',MANUAL_CASH_CANNOT_BE_NEGATIVE:'Cash out exceeds the manually tracked cash balance.',BRANCH_ACCESS_DENIED:'This branch is not assigned to your account.',SHIFT_ACTION_DENIED:'You do not have permission for this shift.',MANAGER_CLOSE_REASON_REQUIRED:'A reason of at least 8 characters is required to close another cashier’s shift.',REQUEST_KEY_REUSE_CONFLICT:'This movement request was already used with different values.',SHIFT_EXPECTED_BALANCE_CHANGED:'Manual expected cash changed. Reopen the shift details and review the updated balance before closing.',SHIFT_POS_CASH_BALANCE_CHANGED:'POS cash sales changed. Refresh the shift details before closing.',SHIFT_VARIANCE_ACK_REQUIRED:'Review and acknowledge the cash variance before closing.',SHIFT_VARIANCE_REASON_REQUIRED:'Please record a closing reason of at least 8 characters for the cash variance.',SHIFT_DENOMINATION_TOTAL_MISMATCH:'The denomination total must equal the opening float.',SHIFT_DENOMINATIONS_INVALID:'Enter whole, non-negative note or coin counts.'}[error?.message]||error?.message||'Request failed');
function Action({icon:Icon,label,action,disabled=false,primary=false}){return <button className={`${primary?'primary':'outline'} action-icon`} aria-label={label} title={label} type="button" onClick={action} disabled={disabled}><Icon size={18}/></button>;}
function MoneyField({label,value,onChange,min='0'}){return <label className="field"><span>{label}</span><input type="number" required min={min} step="0.01" value={value} onChange={e=>onChange(e.target.value)}/></label>;}
function OpenDialog({branches,onClose,onSubmit,busy}){
 const [branchId,setBranchId]=useState(branches[0]?.id??'');
 const [amount,setAmount]=useState('0.00'),[notes,setNotes]=useState('');
 const [showNotes,setShowNotes]=useState(false),[counts,setCounts]=useState({});
 const hasCounts=Object.values(counts).some(value=>Number(value)>0);
 const total=physicalCountTotal(counts);
 const changeCount=(key,value)=>{
  if(value!==''&&(!/^(0|[1-9]\d{0,5})$/.test(value)||Number(value)>100000))return;
  const next={...counts,[key]:value};
  setCounts(next);
  setAmount(centsAsMoney(physicalCountTotal(next)));
 };
 const submit=e=>{
  e.preventDefault();
  onSubmit({branchId:Number(branchId),openingCash:amount,notes,...(hasCounts?{denominations:Object.fromEntries(Object.entries(counts).filter(([,v])=>v!==''&&Number(v)>0).map(([k,v])=>[k,Number(v)]))}:{})});
 };
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
  <form className="dialog shift-dialog" onSubmit={submit}>
   <div className="dialog-head"><div><p className="eyebrow">SHIFT CASH / OPEN</p><h2>Open Cash Shift</h2></div><Action icon={X} label="Close" action={onClose} disabled={busy}/></div>
   <p className="muted">This shift belongs to your signed-in cashier account. One open shift per cashier is allowed.</p>
   <div className="form-two"><label className="field"><span>Assigned Branch</span><select value={branchId} required onChange={e=>setBranchId(e.target.value)}>{branches.map(b=><option key={b.id} value={b.id}>{b.name} ({b.code})</option>)}</select></label>
    <MoneyField label="Opening Float (RM)" value={amount} onChange={setAmount}/></div>
   <section className="shift-denom-panel"><label className="shift-denom-toggle"><input type="checkbox" checked={showNotes} onChange={e=>{setShowNotes(e.target.checked);if(!e.target.checked){setCounts({});setAmount('0.00');}}}/> Count Notes & Coins (optional)</label>
    {showNotes&&<><p className="muted">Enter the number of pieces. Opening Float updates automatically. Clear the option to enter the amount manually.</p>
     <div className="shift-denom-grid">{SHIFT_DENOMINATIONS.map(d=><label key={d.key} className="shift-denom-item"><span>{d.label} ×</span><input type="number" inputMode="numeric" min="0" step="1" max="100000" placeholder="0" value={counts[d.key]??''} onChange={e=>changeCount(d.key,e.target.value)}/></label>)}</div>
     <label className="field shift-denom-total"><span>Total (RM)</span><input disabled value={centsAsMoney(total)} aria-label="Total Denominations"/></label></>}
   </section>
   <label className="field"><span>Opening Notes (optional)</span><textarea rows="2" value={notes} maxLength="500" onChange={e=>setNotes(e.target.value)}/></label>
   <div className="dialog-actions"><Action icon={X} label="Cancel" action={onClose}/><button className="primary" type="submit" disabled={busy||!branches.length||(showNotes&&hasCounts&&moneyToSen(amount)!==total)}><Plus size={17}/>Open Shift</button></div>
  </form>
 </div>;
}
function MovementDialog({shift,onClose,onSubmit,busy}){
 const [direction,setDirection]=useState('CASH_IN'),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[requestKey,setRequestKey]=useState(()=>crypto.randomUUID());
 const changed=(setter,value)=>{setter(value);setRequestKey(crypto.randomUUID());};
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="dialog shift-dialog" onSubmit={e=>{e.preventDefault();onSubmit({direction,amount,reason:reason.trim(),requestKey});}}><div className="dialog-head"><div><p className="eyebrow">SHIFT #{shift.id}</p><h2>Manual Cash Movement</h2></div><Action icon={X} label="Close" action={onClose} disabled={busy}/></div><p className="muted">Manual Cash In / Out only. Verified POS cash sales are posted separately and included at shift close.</p><div className="form-two"><label className="field"><span>Movement Type</span><select value={direction} onChange={e=>changed(setDirection,e.target.value)}><option value="CASH_IN">Cash In (+)</option><option value="CASH_OUT">Cash Out (−)</option></select></label><MoneyField label="Amount (RM)" value={amount} min="0.01" onChange={v=>changed(setAmount,v)}/></div><label className="field"><span>Reason (required)</span><textarea required minLength="4" maxLength="500" rows="3" value={reason} onChange={e=>changed(setReason,e.target.value)} placeholder="Describe why cash was added or removed"/></label><div className="dialog-actions"><Action icon={X} label="Cancel" action={onClose}/><button type="submit" className="primary" disabled={busy}><Save size={18}/>Record Movement</button></div></form></div>;
}
function ShiftMoneyRow({label,value,subtle=false}){
 return <div className={`shift-breakdown-row${subtle?' shift-breakdown-subtle':''}`}><span>{label}</span><strong>{currency(value)}</strong></div>;
}
function CloseDialog({shift,own,onClose,onSubmit,busy}){
 // Expected Cash is the suggested number; operator MUST confirm the physically counted amount.
 const [counted,setCounted]=useState(String(shift.expectedCash));
 const [notes,setNotes]=useState(''),[acknowledged,setAcknowledged]=useState(false),[physicalConfirmed,setPhysicalConfirmed]=useState(false);
 const expected=moneyToSen(shift.expectedCash),actual=moneyToSen(counted);
 const variance=expected!==null&&actual!==null?actual-expected:null;
 const nonZero=variance!==null&&variance!==0n;
 const substantial=nonZero&&(variance>=10000n||variance<=-10000n);
 const isShortage=nonZero&&variance<0n;
 const needsNotes=!own||nonZero;
 const submit=e=>{
  e.preventDefault();
  if(!physicalConfirmed||(nonZero&&!acknowledged))return;
  onSubmit({countedCash:counted,notes:notes.trim(),expectedManualCash:String(shift.manualExpected),expectedPosCash:String(shift.posCashSales),varianceAcknowledged:nonZero&&acknowledged});
 };
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><form className="dialog shift-dialog" onSubmit={submit}>
  <div className="dialog-head"><div><p className="eyebrow">SHIFT #{shift.id}</p><h2>Close Cash Shift</h2></div><Action icon={X} label="Close" action={onClose} disabled={busy}/></div>
  <p className="shift-warning"><ShieldAlert size={19}/> Expected cash includes opening float, manual movements, and posted POS cash sales. Confirm the physical amount before closing.</p>
  <div className="shift-close-total"><span>Expected Cash (including POS)</span><strong>{currency(shift.expectedCash)}</strong></div>
  <div className="shift-breakdown" aria-label="Cash shift breakdown">
   <ShiftMoneyRow label="Opening Float" value={shift.opening_cash}/>
   <ShiftMoneyRow label="Cash IN (+)" value={shift.cashIn}/>
   <ShiftMoneyRow label="Cash OUT (−)" value={shift.cashOut}/>
   <ShiftMoneyRow label="Sales Cash (+)" value={shift.posCashSales}/>
   <ShiftMoneyRow label="EWallet / QR Code (non-cash)" value={shift.ewalletQr} subtle/>
   {shift.electronicIntegration==='NOT_CONNECTED'&&<small>Electronic settlement is not connected; no electronic amounts are added to Expected Cash.</small>}
  </div>
  <MoneyField label="Actual Cash Counted (RM)" value={counted} onChange={v=>{setCounted(v);setPhysicalConfirmed(false);setAcknowledged(false);}}/>
  <p className="shift-input-hint">Auto-filled from the expected balance. Adjust it to the physically counted cash if different.</p>
  <label className="shift-physical-ack"><input type="checkbox" checked={physicalConfirmed} onChange={e=>setPhysicalConfirmed(e.target.checked)}/><span>I confirm the Actual Cash Counted amount has been checked against physical cash.</span></label>
  {variance!==null&&<div className={`shift-variance-preview ${nonZero?'shift-variance-alert':'shift-variance-balanced'}`} role="status"><div><span>Cash Variance</span><strong>{variance===0n?'Balanced':isShortage?'Shortage':'Surplus'}</strong><small>{substantial?'Large variance — verify the count and supporting movements.':nonZero?'Review the difference before closing.':'Expected and counted cash match.'}</small></div><b>{senToMYR(variance)}</b></div>}
  <label className="field"><span>{nonZero?'Variance Reason (required, at least 8 characters)':own?'Closing Notes (optional)':'Manager Closing Reason (required)'}</span><textarea rows="3" required={needsNotes} minLength={needsNotes?8:undefined} maxLength="1000" value={notes} onChange={e=>setNotes(e.target.value)} placeholder={nonZero?'Explain the cash surplus or shortage':own?'Optional notes':'Why are you closing this cashier’s shift?'}/></label>
  {nonZero&&<label className="shift-variance-ack"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)}/><span>I have reviewed the {isShortage?'shortage':'surplus'} of <strong>{senToMYR(variance)}</strong>. I understand it includes posted POS cash sales and will be recorded in the shift audit.</span></label>}
  <div className="dialog-actions"><Action icon={X} label="Cancel" action={onClose}/><button type="submit" className="primary" disabled={busy||actual===null||!physicalConfirmed||(nonZero&&(!acknowledged||notes.trim().length<8))}><LockKeyhole size={18}/>Close Shift / Print</button></div>
 </form></div>;
}
function DetailDialog({data,logs,meta,profile,onClose,onMove,onCloseShift,onShowAudit,onPrintShift}){
 const {shift,movements,manualExpected,posCashSales,expectedCash}=data;
 const own=String(shift.cashier_user_id)===String(profile.user.id);
 const canMove=shift.status==='OPEN'&&(own?meta.canMoveOwn:meta.canMoveAny);
 const canClose=shift.status==='OPEN'&&(own?meta.canCloseOwn:meta.canCloseAny);
 return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog wide shift-detail"><div className="dialog-head"><div><p className="eyebrow">SHIFT CASH / DETAILS</p><h2>Shift #{shift.id} · {shift.cashier_name}</h2><p className="muted">{shift.branch_name} · Opened {malaysiaTime(shift.opened_at)} (MYT)</p></div><Action icon={X} label="Close" action={onClose}/></div><div className="shift-metrics"><div><span>Status</span><b>{shift.status}</b></div><div><span>Opening Float</span><b>{currency(shift.opening_cash)}</b></div><div><span>Expected Cash</span><b>{currency(expectedCash)}</b></div><div><span>Actual Counted</span><b>{shift.counted_cash==null?'Not closed':currency(shift.counted_cash)}</b></div></div>{shift.status==='CLOSED'&&<p className="shift-variance">Cash Variance: <strong>{currency(shift.cash_variance)}</strong> · Closed {malaysiaTime(shift.closed_at)} (MYT)</p>}<p className="shift-warning"><ShieldAlert size={18}/> Expected Cash includes verified posted POS cash sales. Manual expected: {currency(manualExpected)}; POS cash sales: {currency(posCashSales)}.</p><h3>Manual Cash Movements</h3><div className="table-scroll shift-movement-list"><table><thead><tr><th>Time (MYT)</th><th>Type</th><th>Amount</th><th>Reason</th><th>Actor</th></tr></thead><tbody>{movements.map(m=><tr key={m.id}><td>{malaysiaTime(m.recorded_at)}</td><td>{m.direction.replace('_',' ')}</td><td>{currency(m.amount)}</td><td>{m.reason}</td><td>{m.actor_name}</td></tr>)}{!movements.length&&<tr><td colSpan="5" className="empty">No manual movements recorded.</td></tr>}</tbody></table></div>{logs&&<><h3>Shift Activity Log</h3><div className="table-scroll shift-movement-list"><table><thead><tr><th>Time (MYT)</th><th>Action</th><th>Performed By</th><th>Details</th></tr></thead><tbody>{logs.map(l=><tr key={l.id}><td>{malaysiaTime(l.recorded_at)}</td><td>{l.action_type}</td><td>{l.actor_name}</td><td className="shift-log-details">{auditDetails(l)}</td></tr>)}</tbody></table></div></>}
 <div className="dialog-actions"><Action icon={History} label="View Activity Log" action={onShowAudit}/>{shift.status==='CLOSED'&&<button className="outline" type="button" onClick={onPrintShift}><Printer size={17}/>Print Close Receipt</button>}{canMove&&<button className="outline" type="button" onClick={onMove}><ArrowDownLeft size={17}/> Cash In / Out</button>}{canClose&&<button className="primary" type="button" onClick={onCloseShift}><LockKeyhole size={17}/> Close Shift</button>}</div></div></div>;
}
function CloseReceiptDialog({data,onClose}){
 const {shift}=data;
 const expected=moneyToSen(data.expectedCash)||0n,counted=moneyToSen(shift.counted_cash)||0n;
 const variance=counted-expected;
 return <div className="overlay shift-receipt-overlay"><div className="dialog shift-receipt-dialog">
  <div className="dialog-head shift-receipt-controls"><div><p className="eyebrow">SHIFT CASH / RECEIPT</p><h2>Close Shift Receipt</h2></div><Action icon={X} label="Close" action={onClose}/></div>
  <article id="shift-closing-receipt" className="shift-closing-receipt">
   <header className="shift-receipt-center"><strong>{data.companyName||'Business'}</strong><span>{shift.cashier_name}</span><span>Opened: {malaysiaTime(shift.opened_at)}</span><span>Closed: {malaysiaTime(shift.closed_at)}</span><b>Cash Shift Opening & Closing</b></header>
   <div className="shift-receipt-rule"/><div className="shift-receipt-headrow"><span>Detail</span><span>RM</span></div>
   <ShiftMoneyRow label="Opening Float" value={shift.opening_cash}/>
   <ShiftMoneyRow label="Cash IN" value={data.cashIn}/>
   <ShiftMoneyRow label="Cash OUT (−)" value={data.cashOut}/>
   <div className="shift-receipt-rule"/><ShiftMoneyRow label="Manual Subtotal" value={data.manualExpected}/>
   <ShiftMoneyRow label="Sales Cash" value={data.posCashSales}/>
   <ShiftMoneyRow label="EWallet / QR Code" value={data.ewalletQr}/>
   <ShiftMoneyRow label="Debit Card" value={data.debitCard}/>
   <ShiftMoneyRow label="Credit Card" value={data.creditCard}/>
   <div className="shift-receipt-rule"/><ShiftMoneyRow label="Expected Cash" value={data.expectedCash}/>
   <ShiftMoneyRow label="Actual Cash Counted" value={shift.counted_cash}/>
   <div className="shift-receipt-rule"/><ShiftMoneyRow label={variance<0n?'Shortage':variance>0n?'Surplus':'Surplus / Shortage'} value={shift.cash_variance}/>
   <footer>Shift #{shift.id} · {shift.branch_name}<span>{data.electronicIntegration==='NOT_CONNECTED'?'Electronic payments not connected':''}</span></footer>
  </article>
  <div className="dialog-actions shift-receipt-controls"><button type="button" className="outline" onClick={onClose}>Close</button><button type="button" className="primary" onClick={()=>window.print()}><Printer size={17}/>Print Receipt</button></div>
 </div></div>;
}
export default function CashShifts({profile,notify}){
 const [rows,setRows]=useState([]),[meta,setMeta]=useState({branches:[]}),[status,setStatus]=useState('ALL'),[search,setSearch]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [opening,setOpening]=useState(false),[detail,setDetail]=useState(null),[logs,setLogs]=useState(null),[moving,setMoving]=useState(false),[closing,setClosing]=useState(false),[closeReceipt,setCloseReceipt]=useState(null);
 const can=permission=>profile.user.permissions.includes(permission);
 const load=useCallback(async()=>{setLoading(true);try{const [a,b]=await Promise.all([request('/cash-shifts'),request('/cash-shifts/meta')]);setRows(a.shifts);setMeta(b);}catch(error){notify(errorText(error),true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 const visible=useMemo(()=>rows.filter(r=>(status==='ALL'||r.status===status)&&`${r.cashier_name} ${r.branch_name} ${r.id}`.toLowerCase().includes(search.toLowerCase())),[rows,status,search]);
 const current=rows.find(r=>r.status==='OPEN'&&String(r.cashier_user_id)===String(profile.user.id));
 async function showDetail(id,includeAudit=false){try{const [a,b]=await Promise.all([request(`/cash-shifts/${id}`),includeAudit?request(`/cash-shifts/${id}/audit`):Promise.resolve(null)]);setDetail(a);setLogs(b?.logs||null);}catch(error){notify(errorText(error),true);}}
 async function run(call,done,id){setBusy(true);try{const outcome=await call();notify(outcome.message?.replaceAll('_',' ')||'Saved.');done();await load();if(id)await showDetail(id);}catch(error){notify(errorText(error),true);}finally{setBusy(false);}}
 async function exportCsv(){try{const response=await fetch(`${apiOrigin}/api/v2/cash-shifts/export`,{credentials:'include'});if(!response.ok)throw Error('EXPORT_DENIED');const blob=await response.blob();const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cash-shifts-report.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(error){notify(errorText(error),true);}}
 return <main className="page shift-page"><div className="page-head"><div><p className="eyebrow">OPERATIONS / CASH MANAGEMENT</p><h1>Cash Shifts</h1><p className="muted">Opening float, manual cash movements, close-out and audit. Cashier scope is enforced on the server.</p></div><div className="actions"><Action icon={RefreshCw} label="Refresh Cash Shifts" action={()=>refreshPage(load,notify)} disabled={loading}/>{can('cash_shifts.export')&&<Action icon={Download} label="Export Visible Cash Shifts CSV" action={exportCsv}/>} {meta.canOpen&&!current&&<Action icon={Plus} label="Open Cash Shift" action={()=>setOpening(true)} primary/>}</div></div>
 <div className="stat-grid"><div className="stat"><Banknote size={19}/><span>Visible Shifts</span><b>{rows.length}</b></div><div className="stat"><ArrowUpRight size={19}/><span>Open</span><b>{rows.filter(r=>r.status==='OPEN').length}</b></div><div className="stat"><LockKeyhole size={19}/><span>Closed</span><b>{rows.filter(r=>r.status==='CLOSED').length}</b></div><div className="stat"><Eye size={19}/><span>Visibility</span><b className="shift-scope-label">{meta.scope==='ALL'?'All Cashiers':'My Shifts'}</b></div></div>
 <p className="shift-warning"><ShieldAlert size={18}/> Posted cash sales are included in shift closing totals. Electronic provider settlements remain separate.</p>
 <div className="table-panel shift-table"><div className="tools shift-tools"><div className="search"><Search size={17}/><input aria-label="Search Shifts" value={search} placeholder="Search cashier, branch or shift ID..." onChange={e=>setSearch(e.target.value)}/></div><select aria-label="Filter Shift Status" value={status} onChange={e=>setStatus(e.target.value)}><option value="ALL">All Status</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></div><div className="table-scroll"><table><thead><tr>{['#','Cashier','Branch','Opened (MYT)','Opening Float','Manual Float','Status','Actions'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{visible.map(s=><tr key={s.id}><td>{s.id}</td><td><strong>{s.cashier_name}</strong></td><td>{s.branch_name}</td><td>{malaysiaTime(s.opened_at)}</td><td>{currency(s.opening_cash)}</td><td>{s.status==='CLOSED'?currency(s.manual_expected_cash):'Open shift'}</td><td><span className={`pill ${s.status==='OPEN'?'good':'off'}`}>{s.status}</span></td><td><Action icon={Eye} label={`View Shift ${s.id}`} action={()=>showDetail(s.id)}/></td></tr>)}{!visible.length&&<tr><td className="empty" colSpan="8">{loading?'Loading cash shifts...':'No cash shifts found.'}</td></tr>}</tbody></table></div></div>
 {opening&&<OpenDialog branches={meta.branches} busy={busy} onClose={()=>setOpening(false)} onSubmit={values=>run(()=>request('/cash-shifts',{method:'POST',body:values}),()=>setOpening(false))}/>}
 {detail&&<DetailDialog data={detail} logs={logs} profile={profile} meta={meta} onClose={()=>{setDetail(null);setLogs(null);}} onMove={()=>setMoving(true)} onCloseShift={()=>setClosing(true)} onShowAudit={()=>showDetail(detail.shift.id,true)} onPrintShift={()=>setCloseReceipt(detail)}/>}
 {moving&&detail&&<MovementDialog shift={detail.shift} busy={busy} onClose={()=>setMoving(false)} onSubmit={values=>run(()=>request(`/cash-shifts/${detail.shift.id}/movements`,{method:'POST',body:values}),()=>setMoving(false),detail.shift.id)}/>}
 {closing&&detail&&<CloseDialog shift={{...detail.shift,cashIn:detail.cashIn,cashOut:detail.cashOut,ewalletQr:detail.ewalletQr,electronicIntegration:detail.electronicIntegration,manualExpected:detail.manualExpected,posCashSales:detail.posCashSales,expectedCash:detail.expectedCash}} own={String(detail.shift.cashier_user_id)===String(profile.user.id)} busy={busy} onClose={()=>setClosing(false)} onSubmit={async values=>{setBusy(true);try{const id=detail.shift.id;const outcome=await request(`/cash-shifts/${id}/close`,{method:'POST',body:values});notify(outcome.message?.replaceAll('_',' ')||'Shift closed.');setClosing(false);await load();const latest=await request(`/cash-shifts/${id}`);setDetail(latest);setCloseReceipt(latest);}catch(error){notify(errorText(error),true);}finally{setBusy(false);}}}/>}
 {closeReceipt&&<CloseReceiptDialog data={closeReceipt} onClose={()=>setCloseReceipt(null)}/>}
 </main>;
}
