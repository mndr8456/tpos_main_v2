import {useEffect,useState} from 'react';
import {Wallet,CheckCircle2,Lock,X,ExternalLink,ImagePlus,ShieldCheck} from 'lucide-react';
import {request,apiUrl} from './api.js';
import './PosMultiPayment.css';

const ALL_METHODS=[['CASH','Cash'],['DUITNOW_QR','DuitNow QR'],['EWALLET','E-Wallet QR'],['BANK_TRANSFER','Bank Transfer'],['DEBIT_CARD','Debit Card Terminal'],['CREDIT_CARD','Credit Card Terminal'],['SARA_MYKASIH','SARA / MyKasih']];
const asMoney=value=>`RM ${Number(value||0).toFixed(2)}`;
function eligible(m,config){
 if(m==='CASH')return Boolean(config);
 if(m==='SARA_MYKASIH')return false;
 if(!config)return false;
 if(['DUITNOW_QR','EWALLET'].includes(m))return Boolean(config.has_image);
 if(['CREDIT_CARD','DEBIT_CARD'].includes(m))return Boolean(config.provider_terminal_ref);
 return m==='BANK_TRANSFER';
}
function imageData(file){
 return new Promise((resolve,reject)=>{
  if(!file||file.size>1048576||!['image/png','image/jpeg','image/webp'].includes(file.type))return reject(Error('Use a PNG, JPEG or WebP evidence image under 1 MB. Redact any private account data.'));
  const reader=new FileReader();reader.onload=()=>resolve({mimeType:file.type,base64:String(reader.result).split(',')[1]});reader.onerror=()=>reject(Error('Cannot read the payment evidence image.'));reader.readAsDataURL(file);
 });
}
export default function PosMultiPayment({current,preview,methods,stockIssues,discountCode,voucherCode,cashReceived,setCashReceived,paymentError,payCash,busy,onClose,onPaid,onDisplayMode,onShowDisplay,notify}){
 const [method,setMethod]=useState('CASH'),[attempt,setAttempt]=useState(null),[reference,setReference]=useState(''),[evidence,setEvidence]=useState(null),[evidenceName,setEvidenceName]=useState(''),[verified,setVerified]=useState(false),[error,setError]=useState(''),[working,setWorking]=useState(false);
 useEffect(()=>{void onDisplayMode?.('CASH');},[current?.draft?.id]);
 const configurations=new Map(methods.map(m=>[m.method_code,m]));
 const active=Boolean(configurations.get(method)),isCash=method==='CASH',hasQr=['DUITNOW_QR','EWALLET'].includes(method);
 const disabled=Boolean(busy||working||stockIssues.length||discountCode.trim()||voucherCode.trim());
 const total=String(preview?.bill?.total||'0.00');
 const canFinalize=Boolean(attempt&&reference.trim().length>=6&&evidence&&verified&&!disabled);
 const reset=()=>{setAttempt(null);setReference('');setEvidence(null);setEvidenceName('');setVerified(false);setError('');};
 async function select(selected){
  if(!eligible(selected,configurations.get(selected)))return;
  reset();setMethod(selected);
  if(selected==='CASH'){void onDisplayMode?.('CASH');return;}
  setWorking(true);
  try{
   const next=await request(`/pos/drafts/${current.draft.id}/payments/start`,{method:'POST',body:{requestKey:crypto.randomUUID(),methodCode:selected,expectedVersion:Number(current.draft.version),expectedTotal:total,discountCode:discountCode.trim(),voucherCode:voucherCode.trim()}});
   setAttempt(next);
   await onDisplayMode?.(['DUITNOW_QR','EWALLET'].includes(selected)?'QR':'MANUAL',next.attemptId);
  }catch(e){setError(e.message);}
  finally{setWorking(false);}
 }
 async function finalize(){
  if(!canFinalize)return;
  setWorking(true);setError('');
  try{
   const result=await request(`/pos/drafts/${current.draft.id}/payments/${attempt.attemptId}/complete`,{method:'POST',body:{paymentReference:reference.trim(),verifiedAmount:total,verifiedInMerchantAccount:true,evidence}});
   onPaid(result.receipt);
  }catch(e){setError(e.message);notify?.(e.message,true);}finally{setWorking(false);}
 }
 function displayQr(){
  if(onShowDisplay?.())return;
  if(!attempt?.displayToken)return;
  const url=`${window.location.origin}/customer-display.html#token=${encodeURIComponent(attempt.displayToken)}`;
  // Tokens are in URL fragments and never transmitted in the page request.
  window.open(url,'tpos-customer-display','width=980,height=740');
 }
 const settings=configurations.get(method);
 return <div className="overlay" onMouseDown={event=>{if(event.target===event.currentTarget&&!working&&!busy)onClose();}}>
  <div className="dialog pos-payment-dialog pos-multi-payment" role="dialog" aria-modal="true" aria-label="POS Payment Methods">
   <div className="dialog-head"><div><p className="eyebrow">POS / CHECKOUT</p><h2>Payment Methods</h2></div><button type="button" className="pos-icon-button" aria-label="Close payment" onClick={onClose} disabled={working||busy}><X size={18}/></button></div>
   <div className="pos-payment-total"><small>Total</small><strong>{asMoney(total)}</strong></div>
   <p className="muted">Choose an active payment method for this branch.</p>
   <div className="pos-payment-methods" role="group" aria-label="Payment options">
    {ALL_METHODS.map(([code,label])=>{const enabled=eligible(code,configurations.get(code));return <button key={code} type="button" className={`pos-pay-method ${method===code?'pos-pay-selected':''} ${enabled?'':'pos-pay-locked'}`} disabled={!enabled||disabled} title={!enabled?(code==='SARA_MYKASIH'?'Official MyKasih provider connection is required':'Enable and configure the method in Settings first'):label} onClick={()=>select(code)}><Wallet size={16}/>{label}{enabled?(method===code?<CheckCircle2 size={15}/>:null):<Lock size={15}/>}</button>;})}
   </div>
   {isCash?<div className="pos-cash-entry"><label className="field"><span>Cash Received (RM)</span><input inputMode="decimal" aria-label="Cash Received (RM)" value={cashReceived} onChange={e=>setCashReceived(e.target.value)} disabled={disabled}/></label><div className="pos-cash-change"><span>Change (RM)</span><strong>{Number(cashReceived)>=Number(total)?asMoney(Number(cashReceived)-Number(total)):'—'}</strong></div></div>:
    <div className="pos-multi-verification">
     <div className="pos-multi-warning"><ShieldCheck size={17}/><span>{hasQr?'Scan the merchant Static QR. Verify payment in the business account before Pay.':method==='BANK_TRANSFER'?'Verify the incoming bank transfer in the merchant account before Pay.':'Check the real bank terminal says APPROVED and verify the terminal receipt. This is MANUAL, not online device integration.'}</span></div>
     {settings?.provider_name&&<p className="muted">Provider: {settings.provider_name}</p>}
     {settings?.provider_merchant_ref&&<p className="muted">Merchant / Account Reference: {settings.provider_merchant_ref}</p>}
     {settings?.provider_terminal_ref&&<p className="muted">Terminal ID: {settings.provider_terminal_ref}</p>}
     {attempt&&hasQr&&<div className="pos-multi-qr"><img src={apiUrl(`/pos/drafts/${current.draft.id}/payments/${attempt.attemptId}/qr-image`)} alt="Merchant Static QR configured by Owner"/><button type="button" className="outline" onClick={displayQr}><ExternalLink size={16}/> Show on Customer Display</button></div>}
     {attempt&&<>
      <p className="pos-payment-attempt-note">Attempt #{attempt.attemptId} · Pending manual verification · {asMoney(attempt.expectedTotal)}</p>
      <label className="field"><span>Verified Transaction Reference *</span><input autoComplete="off" maxLength={80} placeholder="Bank / E-Wallet / terminal approval reference" value={reference} onChange={e=>{setReference(e.target.value);setError('');}} disabled={disabled}/></label>
      <label className="field"><span>Customer Transaction Evidence (image) *</span><input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled} onChange={async e=>{try{const f=e.target.files?.[0];setEvidence(await imageData(f));setEvidenceName(f.name);setError('');}catch(x){setEvidence(null);setEvidenceName('');setError(x.message);}}}/></label>
      {evidenceName&&<small>Attached: {evidenceName}</small>}
      <label className="pos-multi-confirm"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)} disabled={disabled}/><span>I have verified the amount, reference and successful receipt in the business bank / E-Wallet account or on the approved terminal. Evidence has been redacted where necessary.</span></label>
     </>}
    </div>
   }
   {stockIssues.length>0&&<div className="pos-checkout-stock-alert" role="alert">Stock must be available before the sale is posted. {stockIssues.slice(0,3).map(issue=>issue.productName).join(', ')}</div>}
   {(discountCode.trim()||voucherCode.trim())&&<p className="pos-quote-error" role="alert">Discount / Voucher settlement is not yet connected to checkout. Remove the code before payment.</p>}
   {(error||paymentError)&&<p className="pos-checkout-payment-error" role="alert">{error||paymentError}</p>}
   <div className="dialog-actions"><button className="outline" type="button" disabled={busy||working} onClick={onClose}>Cancel</button>
    {isCash?<button type="button" className="primary" disabled={disabled||!active||!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(cashReceived)||Number(cashReceived)<Number(total)} onClick={payCash}><Wallet size={18}/> Confirm Cash Payment</button>:<button type="button" className="primary" onClick={finalize} disabled={!canFinalize}><ShieldCheck size={18}/>{working?'Processing...':'Pay — Manually Verified'}</button>}
   </div>
   <small className="muted">SARA/MyKasih and automatic provider transactions require a certified provider connection. Static QR/manual transfer must never be treated as provider-verified.</small>
  </div>
 </div>;
}
