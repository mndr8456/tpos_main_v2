// Token stays in the fragment and POST body, never in request URLs or storage.
(() => {
 const token=new URLSearchParams(location.hash.slice(1)).get('token');history.replaceState(null,'',location.pathname);
 const el=id=>document.getElementById(id);
 async function update(){
  if(!token)return void(el('status').textContent='No active payment session');
  try{
   const response=await fetch('/api/v2/pos/customer-display/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),cache:'no-store',credentials:'omit'});
   if(!response.ok)throw Error('Payment session unavailable');
   const data=await response.json();
   el('merchant').textContent=data.merchantName||'TPOS Customer Payment';
   el('amount').textContent='RM '+data.amount;
   if(data.qrImage&&data.status==='PENDING'){
    const allowed={'image/png':true,'image/jpeg':true,'image/webp':true};
    if(allowed[data.qrMime]){el('qr').src=`data:${data.qrMime};base64,${data.qrImage}`;el('qr').style.display='block';}
   }else{el('qr').removeAttribute('src');el('qr').style.display='none';}
   if(data.status==='PAID'){el('status').textContent='Payment Successful';el('details').textContent='Thank you for your purchase.';}
   else if(data.status==='PENDING'){el('status').textContent='Awaiting Merchant Verification';el('details').textContent='Scan the QR, pay the displayed amount, and show your transaction to the cashier.';setTimeout(update,3000);}
   else{el('status').textContent='Payment Session Ended';el('details').textContent='Please ask the cashier for assistance.';}
  }catch{el('status').textContent='Session Unavailable';el('details').textContent='Please contact the cashier.';}
 }
 update();
})();
