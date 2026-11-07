// Customer Display R1.6: bearer token is isolated to THIS display tab's
// sessionStorage, so Refresh does not disconnect the already-paired monitor.
// Never use durable browser storage, cookies, analytics, query strings or media URLs.
// The backend continues to enforce the 12-hour pairing expiry and tenant scope.
(()=>{
 'use strict';
 const PAIR_KEY='tpos_cd_pair_session_r16';
 const validPair=value=>typeof value==='string'&&/^[1-9]\d{0,14}\.[A-Za-z0-9_-]{43}$/.test(value);
 // A tab-scoped store survives reload and discards the token when its window
 // closes. In privacy-restricted browsers without it, live pairing still works.
 let tabStorage=null;
 try{tabStorage=window.sessionStorage||null;}catch{}
 const fragment=new URLSearchParams(location.hash.slice(1));
 const freshPair=fragment.get('pair');
 const legacyToken=fragment.get('token');
 let savedPair=null;
 try{savedPair=tabStorage?.getItem(PAIR_KEY)||null;}catch{}
 let token=validPair(freshPair)?freshPair:validPair(savedPair)?savedPair:null;
 if(validPair(freshPair))try{tabStorage?.setItem(PAIR_KEY,freshPair);}catch{}
 history.replaceState(null,'',location.pathname);
 const el=id=>document.getElementById(id);
 const show=(id,on)=>{el(id).hidden=!on;};
 const set=(id,value)=>{el(id).textContent=String(value??'');};
 const fmt=value=>`RM ${Number(value||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
 let lastState='',mediaSignature='',mediaList=[],mediaIndex=0,mediaTimer=null,mediaUrl=null,mediaCache=new Map(),mediaLoading=false,working=false;
 const post=async(path,body)=>{
  let response;
  try{response=await fetch(`/api/v2/${path}`,{method:'POST',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}
  catch{throw Error('CD_NETWORK_UNREACHABLE');}
  if(!response.ok){
   // Never show server stack traces, token values, request bodies or secrets.
   const payload=await response.json().catch(()=>null);
   const safeCode=/^([A-Z][A-Z0-9_]{2,79})$/.test(payload?.error||'')?payload.error:'CD_API_ERROR';
   throw Error(`HTTP ${response.status} · ${safeCode}`);
  }
  try{return await response.json();}catch{throw Error('CD_API_INVALID_RESPONSE');}
 };
 function cleanMedia(){if(mediaTimer){clearTimeout(mediaTimer);mediaTimer=null;}el('promotion-video').pause();el('promotion-video').hidden=true;el('promotion-image').hidden=true;}
 async function getMedia(item){
  const cached=mediaCache.get(item.id);if(cached)return cached;
  const response=await fetch('/api/v2/customer-display/public/media',{method:'POST',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,mediaId:Number(item.id)})});
  if(!response.ok)throw Error('Promotion unavailable');
  const blob=await response.blob();if(blob.type!==item.mime)throw Error('Media MIME changed');
  const url=URL.createObjectURL(blob);mediaCache.set(item.id,url);return url;
 }
 async function showMedia(intervalSeconds){
  cleanMedia();if(!mediaList.length||!token){show('promotion-placeholder',true);set('promotion-position','Welcome');return;}
  if(mediaLoading)return;mediaLoading=true;
  const item=mediaList[mediaIndex%mediaList.length];set('promotion-position',`${mediaIndex%mediaList.length+1} / ${mediaList.length}`);
  try{
   const url=await getMedia(item);
   if(item.id!==mediaList[mediaIndex%mediaList.length]?.id)return;
   show('promotion-placeholder',false);
   if(item.type==='VIDEO'){const video=el('promotion-video');video.src=url;video.muted=true;video.loop=false;video.hidden=false;await video.play().catch(()=>{});}
   else{const image=el('promotion-image');image.src=url;image.alt=item.title;image.hidden=false;}
  }catch{show('promotion-placeholder',true);}
  finally{mediaLoading=false;}
  mediaTimer=setTimeout(()=>{mediaIndex=(mediaIndex+1)%mediaList.length;showMedia(intervalSeconds);},Math.max(5,Number(intervalSeconds)||8)*1000);
 }
 function updateMedia(data){
  if(!token)return;
  const list=data.media||[];const signature=JSON.stringify(list.map(item=>[item.id,item.type,item.mime]));
  if(signature===mediaSignature)return;
  mediaSignature=signature;mediaList=list;mediaIndex=0;
  for(const [id,url] of mediaCache){if(!list.some(x=>x.id===id)){URL.revokeObjectURL(url);mediaCache.delete(id);}}
  showMedia(data.settings?.mediaIntervalSeconds);
 }
 function orderView(data){
  const order=data.order||{};const lines=order.lines||[];
  show('order-welcome',!lines.length);show('order-current',!!lines.length);
  set('welcome-message',data.settings?.welcomeMessage||'Welcome!');
  if(!lines.length)return;
  set('order-number',`#${order.draftId}`);set('order-scope',order.orderScope==='DINE_IN'?`DINE IN · TABLE ${order.tableNumber||'—'}`:'TAKE AWAY');
  const tbody=el('order-lines');tbody.replaceChildren();
  for(const item of lines){
   const row=document.createElement('tr');
   for(const value of [item.name,String(Number(item.quantity)),fmt(item.unitPrice),fmt(item.lineTotal)]){
    const td=document.createElement('td');td.textContent=value;row.append(td);
   }tbody.append(row);
  }
  set('subtotal',fmt(order.bill?.subtotal));const charges=Number(order.total||0)-Number(order.bill?.subtotal||0);
  set('charges',(charges<0?'− ':'')+fmt(Math.abs(charges)));set('grand-total',fmt(order.total));
 }
 function paymentView(data){
  const state=data.status;const qr=state==='QR_PENDING',change=state==='CASH_CHANGE';
  show('qr-panel',qr);show('cash-panel',change);
  set('amount',fmt(data.amount));set('cash-received',fmt(data.cashReceived));set('cash-change',fmt(data.cashChange));
  if(qr){
   set('payment-status','SCAN TO PAY');set('payment-total-label','Total Payment');
   set('status','Awaiting Cashier Verification');
   set('details','Scan the merchant QR. Cashier will check the real merchant account, capture the transaction evidence and enter the reference number.');
   const mime=data.qr?.mime,base=data.qr?.base64;
   if(['image/png','image/jpeg','image/webp'].includes(mime)&&base){el('qr').src=`data:${mime};base64,${base}`;show('qr',true);}
   else{el('qr').removeAttribute('src');show('qr',false);set('details','The merchant QR is unavailable. Please ask the cashier.');}
  }else if(change){
   el('qr').removeAttribute('src');set('payment-status','CASH PAYMENT COMPLETED');set('payment-total-label','Total Paid');set('status','Please collect your change · Sila ambil baki anda');set('details','Thank you for shopping with us.');
  }else{
   el('qr').removeAttribute('src');set('payment-status',state==='CASH_PENDING'?'CASH PAYMENT':'PAYMENT VERIFICATION');set('payment-total-label','Amount Due');set('status','Waiting for Cashier');set('details','Payment is not completed yet. Please follow the cashier’s instructions.');
  }
 }
 function update(data){
  const state=data.status||'IDLE';set('merchant',data.merchantName||'TPOS Customer Display');set('branch',data.branchName||'');
  set('connection','Connected');el('connection-dot').classList.add('online');
  show('offline-view',false);show('split-view',state==='IDLE'||state==='ORDER');
  show('payment-view',['QR_PENDING','MANUAL_PENDING','CASH_PENDING','CASH_CHANGE'].includes(state));
  show('success-view',state==='SUCCESS');
  set('thank-you-english',data.settings?.successEnglish||'Thank You, Please Come Again!');
  set('thank-you-malay',data.settings?.successMalay||'Terima kasih, sila datang lagi!');
  if(state==='IDLE'||state==='ORDER'){orderView(data);updateMedia(data);if(!['IDLE','ORDER'].includes(lastState))showMedia(data.settings?.mediaIntervalSeconds);}
  else{if(lastState==='IDLE'||lastState==='ORDER')cleanMedia();if(state==='SUCCESS'){}else paymentView(data);}
  lastState=state;
 }
 function disconnected(message){
  cleanMedia();lastState='';show('offline-view',true);show('split-view',false);show('payment-view',false);show('success-view',false);
  set('connection','Disconnected');el('connection-dot').classList.remove('online');set('offline-details',message);
 }
 async function poll(){
  if(working)return;working=true;
  try{
   if(token)update(await post('customer-display/public/view',{token}));
   else if(legacyToken){
    const legacy=await post('pos/customer-display/view',{token:legacyToken});
    const state=legacy.status==='PAID'?'SUCCESS':legacy.status==='PENDING'?'QR_PENDING':'IDLE';
    update({status:state,merchantName:legacy.merchantName||'TPOS',branchName:'Payment QR',order:null,amount:legacy.amount,qr:legacy.qrImage?{mime:legacy.qrMime,base64:legacy.qrImage}:null,media:[],settings:{}});
   }else disconnected('Open POS Terminal and select Open Customer Display to pair this screen.');
  }catch(error){
   // Only a definitive revoked/expired token clears this tab's session pairing.
   // A transient network/proxy failure retains it and retries on the next poll.
   const detail=String(error?.message||'CD_API_ERROR').replace(/[^A-Za-z0-9 _·.\-]/g,'').slice(0,100);
   if(/CD_PAIR_INVALID/.test(detail)){
    token=null;
    try{tabStorage?.removeItem(PAIR_KEY);}catch{}
    disconnected('Pairing has expired or was replaced. Open Customer Display from POS to pair again.');
   }else disconnected(`Connection unavailable (${detail}). Retrying automatically. If it persists, open Customer Display again from POS Terminal.`);
  }
  finally{working=false;}
 }
 el('fullscreen').addEventListener('click',()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.().catch(()=>{});});
 // A same-origin signal from the cashier eliminates the wait for the next
 // 2-second poll after print. The viewer ALWAYS fetches the real server state.
 // This cannot set SUCCESS/IDLE locally or access the session pairing token.
 window.addEventListener('message',event=>{
  if(event.origin!==window.location.origin||event.source!==window.opener)return;
  if(event.data?.type==='TPOS_CUSTOMER_DISPLAY_REFRESH')void poll();
 });
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll();});
 poll();setInterval(poll,2000);
 window.addEventListener('pagehide',()=>{cleanMedia();for(const url of mediaCache.values())URL.revokeObjectURL(url);mediaCache.clear();});
})();
