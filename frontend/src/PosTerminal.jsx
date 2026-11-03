import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
 Search,ScanBarcode,Plus,Minus,Trash2,ShoppingCart,PauseCircle,PlayCircle,RefreshCw,
 History,ShieldAlert,FolderOpen,Lock,Package,UtensilsCrossed,
 Store,Layers3,ChevronRight,Table2,Wallet,Tag,Box,ArrowRight,X,CheckCircle2,Printer
} from 'lucide-react';
import {request,apiOrigin} from './api.js';
import {refreshPage} from './refresh-page.js';
import {findCheckoutStockBlockers} from './pos-checkout-stock.js';
import {PosCashReceipt} from './PosCashReceipt.jsx';
import './PosTerminal.css';

const FNB_TYPES=new Set(['RESTAURANT','CAFE','FOOD_TRUCK','STREET_FOOD']);
const TABLE_TYPES=new Set(['RESTAURANT','CAFE']);
const BUSINESS_TYPES=new Set(['RESTAURANT','GROCERY','RETAIL','MINI_MARKET','CAFE','FOOD_TRUCK','STREET_FOOD']);
const DISPLAY_NAMES={RESTAURANT:'Restaurant',GROCERY:'Grocery',RETAIL:'Retail',MINI_MARKET:'Mini Market',CAFE:'Cafe',FOOD_TRUCK:'Food Truck',STREET_FOOD:'Street Food'};
const PAY_NAMES={CASH:'Cash',DEBIT_CARD:'Debit Card',CREDIT_CARD:'Credit Card',BANK_TRANSFER:'Bank Transfer',DUITNOW_QR:'DuitNow QR',EWALLET:'E-Wallet',E_WALLET:'E-Wallet',SARA_MYKASIH:'SARA / MyKasih'};
const money=value=>`RM ${Number(value||0).toFixed(2)}`;
const formatPercent=value=>{const rate=Number(value);return Number.isFinite(rate)?rate.toFixed(2).replace(/\.00$/,'').replace(/(\.\d)0$/,'$1'):null;};
const settingLabel=(name,setting)=>setting?.enabled&&setting?.registrationConfigured&&formatPercent(setting.rate)!==null?`${name} (${formatPercent(setting.rate)}%)`:name;
const uuid=()=>crypto.randomUUID();
const readableError=code=>({POS_OPEN_SHIFT_REQUIRED:'Please open a Cash Shift before starting an order.',POS_ORIGINAL_SHIFT_CLOSED:'The original Cash Shift is closed.',POS_DRAFT_MUST_RESUME:'Resume this held order before editing.',POS_PRODUCT_NOT_AVAILABLE:'Product is inactive or no longer available.',POS_PACKAGES_AND_BUNDLES_PENDING:'This product requires the inventory composition integration.',POS_WHOLE_QUANTITY_REQUIRED:'This product requires a whole-number quantity.',POS_REQUEST_KEY_REUSED:'Duplicate request key used with different data.',POS_STACKING_POLICY_NOT_APPROVED:'Discount and Voucher cannot be stacked yet.',POS_RESTAURANT_TABLES_NOT_CONNECTED:'Restaurant tables and Dine In orders require the table integration.',POS_TABLE_OCCUPIED:'Another active order already uses this table.',POS_TABLE_NOT_AVAILABLE:'This table is reserved, cleaning, or inactive.',POS_TABLE_NOT_IN_BRANCH:'This table does not belong to this branch.',POS_DINE_IN_SELECT_TABLE_FIRST:'Select a table for Dine In first.',POS_CASH_INSUFFICIENT_TENDER:'Cash received must cover the total.',POS_CHECKOUT_TOTAL_CHANGED:'The bill has changed. Refresh the quote before checkout.',POS_DRAFT_VERSION_CHANGED:'Order changed in another session. Refresh and retry.',POS_STOCK_NOT_INITIALIZED:'Opening Stock is required before selling a stock-tracked product.',POS_INSUFFICIENT_STOCK:'Insufficient stock for this sale.',POS_CASH_CHECKOUT_DISCOUNT_VOUCHER_NOT_CONNECTED:'Discount and voucher settlement is not yet connected to checkout.',POS_CASH_METHOD_DISABLED:'Cash payments are disabled for this branch.',POS_CASH_CONCURRENT_RETRY:'Concurrent checkout detected. Retry using the same payment request.',POS_STOCK_QUANTITY_TWO_DECIMALS_ONLY:'Inventory supports at most two decimals of quantity.'})[code]||code||'Operation failed';
function IconAction({icon:Icon,title,onClick,disabled=false,primary=false}){return <button type="button" className={`pos-icon-button ${primary?'pos-icon-primary':''}`} aria-label={title} title={title} onClick={onClick} disabled={disabled}><Icon size={18}/></button>;}
function Pill({children,tone='neutral'}){return <span className={`pos-pill pos-pill-${tone}`}>{children}</span>;}
export const getPosBusinessMode=type=>{
 const businessType=String(type||'').toUpperCase().trim().replace(/[\s-]+/g,'_');
 return {businessType,mode:FNB_TYPES.has(businessType)?'FNB':'RETAIL',hasTables:TABLE_TYPES.has(businessType),valid:BUSINESS_TYPES.has(businessType)};
};
// The two Apply controls expand editors/details only. The authoritative bill
// summary remains visible and recalculates without a manual Preview action.
function DiscountFields({discountCode,setDiscountCode,voucherCode,setVoucherCode,disabled}){
 return <section id="pos-discount-fields" className="pos-adjustments" aria-label="Discount and Voucher inputs"><div className="pos-adjustments-title"><Tag size={17}/><strong>Discount & Voucher</strong></div><div className="pos-code-fields"><label className="field"><span>Discount code</span><input value={discountCode} onChange={e=>setDiscountCode(e.target.value)} placeholder="Enter discount code" autoComplete="off" disabled={disabled}/></label><label className="field"><span>Voucher code</span><input value={voucherCode} onChange={e=>setVoucherCode(e.target.value)} placeholder="Scan or enter voucher" autoComplete="off" disabled={disabled}/></label></div></section>;
}
function SstStatus({setting,label}){
 if(!setting)return null;
 const state=setting.enabled&&setting.registrationConfigured?'ON':'OFF';
 return <span className={`pos-sst-status ${state==='ON'?'pos-sst-on':'pos-sst-off'}`}>{label}: {state}{state==='ON'?` · ${Number(setting.rate).toFixed(2)}% · ${setting.matchingLines} matching`:''}</span>;
}
function TaxDetails({bill,sst}){
 const taxes=[{key:'salesTax',label:'Sales Tax'},{key:'serviceTax',label:'Service Tax'}];
 return <section id="pos-tax-details" className="pos-tax-details" aria-label="Sales and Service Tax details"><div className="pos-adjustments-title"><Layers3 size={17}/><strong>Sales & Service Tax</strong></div><div className="pos-tax-lines">{taxes.map(({key,label})=>{
  const setting=sst?.[key];
  return <div className="pos-sst-detail" key={key}><div><span>{label}</span><strong>{bill?money(bill[key]):'—'}</strong></div>{setting&&<small>{!setting.enabled?'OFF in GST / SST Settings':!setting.registrationConfigured?'OFF — SST registration missing':setting.matchingLines===0?'ON — No matching products in this order':`ON · ${Number(setting.rate).toFixed(2)}% · ${setting.matchingLines} matching order item(s)`}</small>}</div>;
 })}{bill&&(Number(bill.salesTaxInclusive)>0||Number(bill.serviceTaxInclusive)>0)&&<div className="pos-tax-included"><span>Included in product prices (not added again)</span><strong>{money(Number(bill.salesTaxInclusive||0)+Number(bill.serviceTaxInclusive||0))}</strong></div>}{sst&&Object.values(sst).some(item=>item.enabled&&item.registrationConfigured&&item.matchingLines===0)&&<p className="pos-sst-guidance">Tax settings are active, but only items with the matching SST Type in Product Master are taxable. No tax is added to unclassified products.</p>}</div></section>;
}
function BillBreakdown({bill,quoteError,quoteBusy,sst,serviceCharge}){
 const deduction=value=>`− ${money(value||'0.00')}`;
 const rounding=()=>bill?.roundingAdjustmentSen<0?`− ${money(Math.abs(bill.roundingAdjustmentSen)/100)}`:bill?.roundingAdjustmentSen>0?`+ ${money(bill.roundingAdjustmentSen/100)}`:money('0.00');
 return <section className="pos-bill-details" aria-label="Order total breakdown" aria-live="polite">{quoteError&&<p role="alert" className="pos-quote-error">{quoteError}</p>}{quoteBusy&&<span className="pos-bill-calculating">Calculating…</span>}<div className="pos-quote-results"><div><span title={Number(bill?.salesTaxInclusive||0)+Number(bill?.serviceTaxInclusive||0)>0?'Net subtotal: SST already included in item prices is excluded here so the bill adds up correctly.':'Subtotal before discount and tax'}>Subtotal{Number(bill?.salesTaxInclusive||0)+Number(bill?.serviceTaxInclusive||0)>0&&<small className="pos-tax-net-hint"> (before SST)</small>}</span><b>{bill?money(bill.subtotalBeforeTax??bill.subtotal):'—'}</b></div><div><span>Discount</span><b>{bill?deduction(bill.discount):'—'}</b></div><div><span>Voucher</span><b>{bill?deduction(bill.voucher):'—'}</b></div><div><span>{settingLabel('Sales Tax',sst?.salesTax)}</span><b>{bill?money(bill.salesTax):'—'}</b></div><div><span>{settingLabel('Service Tax',sst?.serviceTax)}</span><b>{bill?money(bill.serviceTax):'—'}</b></div><div><span>{serviceCharge?.applicable&&formatPercent(serviceCharge.rate)!==null?`Service Charge (${formatPercent(serviceCharge.rate)}%)`:'Service Charge'}</span><b>{bill?money(bill.serviceCharge):'—'}</b></div><div><span>Rounding Adjustment</span><b>{bill?rounding():'—'}</b></div><div className="pos-quote-total"><strong>Total</strong><strong>{bill?money(bill.total):'—'}</strong></div></div></section>;
}
export default function PosTerminal({profile,notify}){
 const [bootstrap,setBootstrap]=useState({branches:[],openShifts:[],products:[],categories:[],branchPrices:[],stockLevels:[],enabledPaymentMethods:[],restaurantTables:[]});
 const [drafts,setDrafts]=useState([]),[current,setCurrent]=useState(null),[branchId,setBranchId]=useState('');
 const [pendingTableId,setPendingTableId]=useState(null);
 const firstAddRequestRef=useRef(null);
 const [search,setSearch]=useState(''),[barcode,setBarcode]=useState(''),[category,setCategory]=useState('ALL'),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [discountCode,setDiscountCode]=useState(''),[voucherCode,setVoucherCode]=useState(''),[preview,setPreview]=useState(null),[audit,setAudit]=useState(null),[showHeld,setShowHeld]=useState(false);
 const [showAdjustments,setShowAdjustments]=useState(false),[showTaxDetails,setShowTaxDetails]=useState(false),[showPayment,setShowPayment]=useState(false),[orderScope,setOrderScope]=useState('TAKE_AWAY');
 const [quoteBusy,setQuoteBusy]=useState(false),[quoteError,setQuoteError]=useState('');
 const [taxRefreshKey,setTaxRefreshKey]=useState(0);
 const [cashReceived,setCashReceived]=useState(''),[receipt,setReceipt]=useState(null),[paymentError,setPaymentError]=useState('');
 const paymentRequestKeyRef=useRef(null);
 const scannerRef=useRef(null);
 const businessMode=useMemo(()=>getPosBusinessMode(profile?.business?.type),[profile?.business?.type]);
 const isFnb=businessMode.mode==='FNB';
 const canManage=profile?.user?.permissions?.includes('pos.cart.manage');
 const load=useCallback(async()=>{setLoading(true);try{const [a,b]=await Promise.all([request('/pos/bootstrap'),request('/pos/drafts')]);setBootstrap(a);setDrafts(b.drafts||[]);setBranchId(prev=>prev&&a.openShifts.some(s=>String(s.branch_id)===prev)?prev:String(a.openShifts[0]?.branch_id||''));}catch(e){notify(readableError(e.message),true);}finally{setLoading(false);}},[notify]);
 useEffect(()=>{load();},[load]);
 // Refresh the tenant SST quote after returning from settings in another browser tab.
 useEffect(()=>{const refetch=()=>{if(document.visibilityState==='visible')setTaxRefreshKey(n=>n+1);};window.addEventListener('focus',refetch);document.addEventListener('visibilitychange',refetch);return ()=>{window.removeEventListener('focus',refetch);document.removeEventListener('visibilitychange',refetch);};},[]);
 const activeShift=bootstrap.openShifts.find(s=>String(s.branch_id)===branchId);
 const categoryMap=useMemo(()=>new Map((bootstrap.categories||[]).map(c=>[String(c.id),c.category_name])),[bootstrap.categories]);
 const priceMap=useMemo(()=>new Map((bootstrap.branchPrices||[]).filter(p=>String(p.branch_id)===branchId).map(p=>[String(p.product_id),p.selling_price])),[bootstrap.branchPrices,branchId]);
 const stockMap=useMemo(()=>new Map((bootstrap.stockLevels||[]).filter(x=>String(x.branch_id)===branchId).map(x=>[String(x.product_id),Number(x.quantity_on_hand)])),[bootstrap.stockLevels,branchId]);
 const products=useMemo(()=>bootstrap.products.filter(p=>(category==='ALL'||String(p.category_id)===category)&&`${p.product_name} ${p.sku||''} ${p.barcode||''}`.toLowerCase().includes(search.toLowerCase())).slice(0,160),[bootstrap.products,category,search]);
 const allCategories=useMemo(()=>{const ids=new Set(bootstrap.products.map(p=>String(p.category_id)));return bootstrap.categories.filter(c=>ids.has(String(c.id)));},[bootstrap.categories,bootstrap.products]);
 const branchTables=(bootstrap.restaurantTables||[]).filter(t=>String(t.branch_id)===branchId);
 const activeTable=(bootstrap.restaurantTables||[]).find(t=>String(t.id)===String(current?.draft?.table_id||pendingTableId||''));
 const visibleMethods=(bootstrap.enabledPaymentMethods||[]).filter(m=>String(m.branch_id)===branchId&&m.method_code!=='SARA_MYKASIH');
 const currentQty=new Map((current?.lines||[]).map(l=>[String(l.product_id),Number(l.quantity)]));
 const locked=!canManage||Boolean(current&&current.draft.status!=='DRAFT');
 const currentLines=current?.lines||[];
 const checkoutStockBlockers=useMemo(()=>findCheckoutStockBlockers(currentLines,bootstrap.stockLevels,branchId),[currentLines,bootstrap.stockLevels,branchId]);
 const totalItems=currentLines.reduce((n,line)=>n+Number(line.quantity),0);
 const currentBranch=bootstrap.branches.find(b=>String(b.id)===branchId);
 const imageBase=apiOrigin;
 const selectedBusiness=DISPLAY_NAMES[businessMode.businessType]||String(profile?.business?.type||'Business');
 async function mutate(fn){setBusy(true);try{const data=await fn();setCurrent(data);setPreview(null);await load();return true;}catch(e){notify(readableError(e.message),true);return false;}finally{setBusy(false);}}
 // Opening POS only reads the catalog and saved HELD orders.
 // No blank order is created or reserved in the tenant database.
 function resetOrderControls(){setPendingTableId(null);firstAddRequestRef.current=null;setPaymentError('');setCashReceived('');paymentRequestKeyRef.current=null;setOrderScope('TAKE_AWAY');setDiscountCode('');setVoucherCode('');setPreview(null);setShowPayment(false);setShowAdjustments(false);setShowTaxDetails(false);setAudit(null);}
 async function selectDraft(d){setBusy(true);try{const data=await request(`/pos/drafts/${d.id}`);setCurrent(data);setBranchId(String(data.draft.branch_id));setOrderScope(data.draft.order_scope);setPendingTableId(null);setShowHeld(false);setShowPayment(false);setShowAdjustments(false);setShowTaxDetails(false);setDiscountCode('');setVoucherCode('');setPreview(null);setAudit(null);}catch(e){notify(readableError(e.message),true);}finally{setBusy(false);}}
 async function assignTable(tableId){
  if(!current){
   const selected=branchTables.find(t=>String(t.id)===String(tableId));
   if(tableId&&(selected?.occupancy!=='AVAILABLE')){
    if(selected?.occupancy==='OCCUPIED'&&String(selected.assigned_cashier)===String(profile.user.id)){
     await selectDraft({id:selected.draft_id});return;
    }
    notify('This table is not available.',true);return;
   }
   setPendingTableId(tableId?String(tableId):null);setOrderScope(tableId?'DINE_IN':'TAKE_AWAY');return;
  }
  if(current.draft.status!=='DRAFT')return notify('Resume the order before changing its table.',true);
  const selected=branchTables.find(t=>String(t.id)===String(tableId));
  if(selected?.occupancy==='OCCUPIED'&&String(selected.draft_id)!==String(current.draft.id)){
   if(String(selected.assigned_cashier)===String(profile.user.id)){await selectDraft({id:selected.draft_id});notify(`Resumed existing order #${selected.draft_id} for table ${selected.table_number}.`);}
   else notify('Table is occupied by another cashier.',true);
   return;
  }
  const ok=await mutate(()=>request(`/pos/drafts/${current.draft.id}/table`,{method:'PATCH',body:{tableId:tableId?Number(tableId):null,expectedVersion:current.draft.version,requestKey:uuid()}}));
  if(ok){setOrderScope(tableId?'DINE_IN':'TAKE_AWAY');notify(tableId?'Dine In table assigned.':'Order changed to Take Away.');}
 }
 async function add(product,quantity='1'){
  if(locked||!activeShift||!branchId)return notify('Open a Cash Shift before adding a product.',true);
  if(!current){
   const fingerprint=`${branchId}:${product.id}:${quantity}:${orderScope}:${pendingTableId||''}`;
   if(firstAddRequestRef.current?.fingerprint!==fingerprint)firstAddRequestRef.current={fingerprint,key:uuid()};
   const key=firstAddRequestRef.current.key;
   const ok=await mutate(()=>request('/pos/drafts',{method:'POST',body:{branchId:Number(branchId),orderScope,tableId:pendingTableId?Number(pendingTableId):null,productId:Number(product.id),quantity,requestKey:key}}));
   if(ok){firstAddRequestRef.current=null;setPendingTableId(null);}
  }else await mutate(()=>request(`/pos/drafts/${current.draft.id}/lines`,{method:'POST',body:{productId:Number(product.id),quantity,expectedVersion:current.draft.version,requestKey:uuid()}}));
 }
 async function change(line,qty,remove=false){if(locked||!current)return;const ok=await mutate(()=>request(`/pos/drafts/${current.draft.id}/lines/${line.id}`,{method:'PATCH',body:{...(remove?{remove:true}:{quantity:String(qty)}),expectedVersion:current.draft.version,requestKey:uuid()}}));if(ok&&remove&&currentLines.length===1){setCurrent(null);resetOrderControls();notify('Empty order discarded.');}}
 async function status(next){
  if(!current)return;
  if(next==='DISCARDED'&&!window.confirm('Discard this order? The audit history will remain.'))return;
  const ok=await mutate(()=>request(`/pos/drafts/${current.draft.id}/status`,{method:'PATCH',body:{status:next,expectedVersion:current.draft.version,requestKey:uuid()}}));
  if(!ok)return;
  if(next==='HELD'||next==='DISCARDED'){
   setCurrent(null);resetOrderControls();
   notify(next==='HELD'?'Order held. New Order is ready when an item is selected.':'Order discarded.');
  }else {setPreview(null);notify('Order resumed.');}
 }
 // Recalculate whenever the cart, discount or voucher changes; the server owns
 // SST, reductions and BNM rounding. A response from an older cart is ignored.
 useEffect(()=>{
  if(!current){setPreview(null);setQuoteError('');setQuoteBusy(false);return;}
  const d=discountCode.trim().toUpperCase(),v=voucherCode.trim().toUpperCase();
  if(d&&v){setPreview(null);setQuoteBusy(false);setQuoteError('Discount and Voucher cannot be combined until the stacking policy is configured.');return;}
  let cancelled=false;
  setPreview(null);setQuoteError('');setQuoteBusy(true);
  const timer=setTimeout(async()=>{
   try{
    const result=await request(`/pos/drafts/${current.draft.id}/quote`,{method:'POST',body:{discountCode:d,voucherCode:v}});
    if(!cancelled)setPreview(result);
   }catch(e){if(!cancelled)setQuoteError(readableError(e.message));}
   finally{if(!cancelled)setQuoteBusy(false);}
  },d||v?500:120);
  return ()=>{cancelled=true;clearTimeout(timer);};
 },[current?.draft?.id,current?.draft?.version,current?.draft?.status,current?.lines.length,discountCode,voucherCode,taxRefreshKey]);
 function openPayment(){
  if(!current||current.draft.status!=='DRAFT')return notify('Resume this held order before checkout.',true);
  if(quoteBusy||quoteError||!preview?.bill||!preview.cashCheckoutAvailable)return notify('A valid cash quote is required before checkout.',true);
  setPaymentError('');setCashReceived(String(preview.bill.total));paymentRequestKeyRef.current=uuid();setShowPayment(true);
 }
 async function payCash(){
  if(checkoutStockBlockers.length){setPaymentError('Resolve the stock issues shown above before Cash Checkout. No payment has been posted.');return;}
  if(!current||!preview?.cashCheckoutAvailable||quoteBusy||quoteError)return notify('Cash checkout requires a current, valid quote without Discount or Voucher.',true);
  if(!visibleMethods.some(m=>m.method_code==='CASH'))return notify('Cash is not enabled for this branch.',true);
  if(!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(cashReceived))return notify('Enter the cash amount with up to two decimals.',true);
  const received=Math.round(Number(cashReceived)*100),due=Math.round(Number(preview.bill.total)*100);
  if(!Number.isSafeInteger(received)||received<due)return notify('Cash received must cover the total.',true);
  const requestKey=paymentRequestKeyRef.current||uuid();paymentRequestKeyRef.current=requestKey;
  setPaymentError('');setBusy(true);
  try{
   const result=await request(`/pos/drafts/${current.draft.id}/checkout/cash`,{method:'POST',body:{requestKey,expectedVersion:current.draft.version,expectedTotal:String(preview.bill.total),cashReceived,discountCode:discountCode.trim(),voucherCode:voucherCode.trim()}});
   resetOrderControls();setCurrent(null);setReceipt(result.receipt);await load();
   notify(`Cash payment posted. Receipt ${result.receipt.receiptNumber}.`);
  }catch(e){const message=readableError(e.message);setPaymentError(message);notify(message,true);}
  finally{setBusy(false);}
 }
 async function showAudit(){if(!current)return;try{const result=await request(`/pos/drafts/${current.draft.id}/audit`);setAudit(result.logs);}catch(e){notify(readableError(e.message),true);}}
 function scan(e){e.preventDefault();const code=barcode.trim();if(!code)return;const found=bootstrap.products.find(p=>p.barcode===code||p.sku?.toUpperCase()===code.toUpperCase());if(!found)return notify('Barcode or SKU not found in this tenant.',true);if(found.product_structure!=='SINGLE')return notify('This product requires the packaging/composition adapter.',true);void add(found);setBarcode('');scannerRef.current?.focus();}
 return <main className="page pos-terminal" data-pos-mode={businessMode.mode} data-business-type={businessMode.businessType}>
  <header className="pos-terminal-header"><div className="pos-title-group"><span className="pos-title-icon">{isFnb?<UtensilsCrossed size={23}/>:<Store size={23}/>}</span><div><p className="eyebrow">OPERATIONS / POS TERMINAL</p><h1>POS Terminal</h1><p className="pos-subheading">{profile.business.name} <span>·</span> {selectedBusiness} <span>·</span> {isFnb?'Food & Beverage':'Retail Counter'}</p></div></div><div className="pos-header-actions"><Pill tone={activeShift?'success':'warning'}>{activeShift?`Shift #${activeShift.id} OPEN`:'No open shift'}</Pill><IconAction icon={RefreshCw} title="Refresh POS" disabled={loading||busy} onClick={()=>{setTaxRefreshKey(n=>n+1);refreshPage(load,notify);}}/><IconAction icon={History} title="Order Activity Log" disabled={!current} onClick={showAudit}/><IconAction icon={FolderOpen} title="Held / Saved Orders" onClick={()=>setShowHeld(true)}/></div></header>
  <div className="pos-operating-bar"><div className="pos-branch"><span>BRANCH / CASH SHIFT</span><select aria-label="Select branch with open cash shift" disabled={busy||Boolean(current)} value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Select open shift</option>{bootstrap.openShifts.map(s=><option value={s.branch_id} key={s.id}>{s.branch_name} · Shift #{s.id}</option>)}</select></div><div className="pos-user-meta"><span>CASHIER</span><strong>{profile.user.fullName}</strong><small>{currentBranch?.name||'Open a Cash Shift to begin'}</small></div><div className="pos-type-meta"><span>ORDER TYPE</span><div className="pos-order-switch"><button type="button" className={(current?current.draft.order_scope:orderScope)!=='DINE_IN'?'chosen':''} title="Counter / Take Away" aria-pressed={(current?current.draft.order_scope:orderScope)!=='DINE_IN'} onClick={()=>{if(current?.draft?.order_scope==='DINE_IN'||pendingTableId)assignTable(null);else setOrderScope('TAKE_AWAY');}}>{isFnb?'Take Away':'Counter Sale'}</button>{businessMode.hasTables&&<button type="button" className={(current?current.draft.order_scope:orderScope)==='DINE_IN'?'chosen':''} title="Select a restaurant table below to start Dine In" aria-pressed={(current?current.draft.order_scope:orderScope)==='DINE_IN'} disabled={Boolean(current&&current.draft.status!=='DRAFT')} onClick={()=>document.getElementById('pos-table-select')?.focus()}>Dine In <Table2 size={12}/></button>}</div></div></div>
  <div className="pos-terminal-layout"><section className="pos-product-zone" aria-label={isFnb?'Menu catalog':'Product catalog'}>
   <div className="pos-catalog-toolbar"><div><h2>{isFnb?'Menu & Products':'Products'}</h2><p>Choose an item to add to the current order</p></div><span className="pos-product-count">{products.length} items</span></div>
   <div className="pos-search-row"><form className="pos-scan-control" onSubmit={scan}><ScanBarcode size={19}/><input aria-label="Scan barcode or type SKU" placeholder="Scan barcode / enter SKU" ref={scannerRef} value={barcode} onChange={e=>setBarcode(e.target.value)}/><button type="submit" disabled={locked||busy} title="Add scanned item">Add</button></form><label className="pos-search-control"><Search size={19}/><input aria-label="Search POS Products" placeholder={isFnb?'Search menu name or SKU...':'Search product, SKU or barcode...'} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button type="button" onClick={()=>setSearch('')} title="Clear search" aria-label="Clear search"><X size={16}/></button>}</label></div>
   <div className="pos-category-tabs" role="group" aria-label="Product Categories"><button className={category==='ALL'?'active':''} type="button" onClick={()=>setCategory('ALL')}><Layers3 size={16}/>All Categories</button>{allCategories.map(c=><button type="button" key={c.id} className={category===String(c.id)?'active':''} onClick={()=>setCategory(String(c.id))}>{c.category_name}</button>)}</div>
   <div className="pos-product-tiles" aria-live="polite">{products.map(p=>{const hasPrice=priceMap.has(String(p.id));const price=hasPrice?priceMap.get(String(p.id)):p.selling_price;const available=p.product_structure==='SINGLE';const inCart=currentQty.get(String(p.id));const hasImage=String(p.product_image_url||'').startsWith('tpos-image:');return <button type="button" className={`pos-product-tile ${!available?'pos-tile-unavailable':''}`} key={p.id} title={available?`Add ${p.product_name}`:'Structure adapter not yet connected'} aria-label={`Add ${p.product_name}, ${money(price)}`} disabled={locked||busy||!available} onClick={()=>add(p)}><div className="pos-tile-thumb">{hasImage?<img loading="lazy" src={`${imageBase}/api/v2/products/${p.id}/image`} alt=""/>:<Package size={31}/>}{inCart>0&&<span className="pos-in-cart">{inCart} in order</span>}</div><div className="pos-tile-content"><strong>{p.product_name}</strong><small>{categoryMap.get(String(p.category_id))||'Uncategorized'} · {p.base_unit_code}</small>{Boolean(p.track_stock)&&<small className="pos-stock-label">{!stockMap.has(String(p.id))?'Stock: Not initialized':stockMap.get(String(p.id))===0?'Stock: 0.00 (out of stock)':`Stock: ${stockMap.get(String(p.id)).toFixed(2)}`}</small>}<div className="pos-tile-bottom"><b>{money(price)}</b>{available?<span className="pos-add-badge"><Plus size={16}/></span>:<span className="pos-addon-note">Not ready</span>}</div></div></button>;})}{!products.length&&<div className="pos-product-empty"><Box size={30}/><strong>No matching products</strong><span>Try another search or category</span></div>}</div>
  </section>
  <aside className="pos-order-zone" aria-label="Current POS Order"><div className="pos-order-head"><div><span className="pos-overline">CURRENT ORDER</span><h2><ShoppingCart size={21}/> {current?`Order #${current.draft.id}`:'New Order'}</h2></div><Pill tone={current?.draft?.status==='HELD'?'warning':current?'success':'neutral'}>{current?.draft?.status==='HELD'?'HELD':current?'IN PROGRESS':'EMPTY'}</Pill></div>
   <div className="pos-order-info"><div><span>Order Type</span><strong>{(current?current.draft.order_scope:orderScope)==='DINE_IN'?'Dine In':isFnb?'Take Away':'Counter Sale'}</strong></div><div><span>Items</span><strong>{Number(totalItems).toFixed(totalItems%1?3:0)}</strong></div><div><span>Branch</span><strong>{current?.draft?.branch_name||currentBranch?.name||'—'}</strong></div></div>
   {businessMode.hasTables&&<div className="pos-table-section pos-table-live"><Table2 size={17}/><div className="pos-table-chooser"><strong>{activeTable?`Dine In · ${activeTable.table_number}`:'Restaurant Table / Dine In'}</strong><label htmlFor="pos-table-select" className="pos-table-label">Select an available table or reopen your own occupied table</label><select id="pos-table-select" aria-label="Select Dine In Table" value={current?.draft?.table_id||pendingTableId||''} disabled={Boolean(current&&current.draft.status!=='DRAFT')||busy||!canManage} onChange={e=>assignTable(e.target.value)}><option value="">Take Away (No table)</option>{branchTables.map(t=><option key={t.id} value={t.id} disabled={t.occupancy==='OCCUPIED'&&String(t.assigned_cashier)!==String(profile.user.id)}>{t.table_number}{t.table_name?` · ${t.table_name}`:''} · {t.occupancy}{t.draft_id?` (Order #${t.draft_id})`:''}</option>)}</select><small>{activeTable?.occupancy==='OCCUPIED'?'Occupied by this draft. Hold keeps the table reserved; Discard releases it.':'Select an available table before adding a product. No empty order is saved.'}</small></div></div>}
   <div className="pos-order-lines">{!current?<div className="pos-order-empty"><ShoppingCart size={35}/><strong>Preparing your order</strong><p>{activeShift?'Select a product to start a new order. No empty order is saved.':'Open a Cash Shift to begin.'}</p></div>:!currentLines.length?<div className="pos-order-empty"><Package size={31}/><strong>No products added</strong><p>Select a product from the left to build this order.</p></div>:currentLines.map(line=><div className="pos-order-line" key={line.id}><div className="pos-line-main"><strong>{line.product_name}</strong><span>{line.sku||'—'} · {money(line.unitPrice)} / {line.unit_code}</span></div><b className="pos-line-total">{money(line.lineTotal)}</b><div className="pos-line-edit"><button type="button" title="Decrease" disabled={busy||locked||Number(line.quantity)<=1} onClick={()=>change(line,String(Number(line.quantity)-1))}><Minus size={15}/></button><strong>{Number(line.quantity)}</strong><button type="button" title="Increase" disabled={busy||locked} onClick={()=>change(line,String(Number(line.quantity)+1))}><Plus size={15}/></button><button type="button" className="pos-remove-line" title="Remove line" disabled={busy||locked} onClick={()=>change(line,null,true)}><Trash2 size={15}/></button></div></div>)}</div>
   <div className="pos-order-totals"><div><span>Subtotal</span><b>{money(current?.subtotal)}</b></div><div><span>Discount / Voucher</span><button type="button" className="pos-apply-toggle" aria-expanded={showAdjustments} aria-controls="pos-discount-fields" onClick={()=>setShowAdjustments(x=>!x)} disabled={!current} title="Show Discount / Voucher fields"><Tag size={15}/> {showAdjustments?'Hide':'Apply'}</button></div><div><span>Sales / Services Tax</span><button type="button" className="pos-apply-toggle" aria-expanded={showTaxDetails} aria-controls="pos-tax-details" onClick={()=>setShowTaxDetails(x=>!x)} disabled={!current} title="Show Sales / Services Tax details"><Layers3 size={15}/> {showTaxDetails?'Hide':'Apply'}</button></div></div>
   {showAdjustments&&<DiscountFields discountCode={discountCode} setDiscountCode={setDiscountCode} voucherCode={voucherCode} setVoucherCode={setVoucherCode} disabled={locked||busy}/>}
   {preview?.serviceCharge&&<div className="pos-service-charge-info" title="Merchant fee; separate from JKDM Service Tax">Service Charge: {preview.serviceCharge.applicable?`ON · ${Number(preview.serviceCharge.rate).toFixed(2)}%`:preview.serviceCharge.enabled?"OFF for this order type":"OFF"}</div>}
   {preview?.sst&&<div className="pos-sst-summary" aria-label="Live GST SST Settings"><SstStatus label="Sales Tax" setting={preview.sst.salesTax}/><SstStatus label="Service Tax" setting={preview.sst.serviceTax}/></div>}
   {showTaxDetails&&<TaxDetails bill={preview?.bill} sst={preview?.sst}/>}
   <BillBreakdown bill={preview?.bill} quoteError={quoteError} quoteBusy={quoteBusy} sst={preview?.sst} serviceCharge={preview?.serviceCharge}/>
   <div className="pos-order-footer"><div className="pos-actions-secondary">{current&&<><button type="button" className="outline" disabled={busy} onClick={()=>status(current.draft.status==='HELD'?'DRAFT':'HELD')}>{current.draft.status==='HELD'?<PlayCircle size={17}/>:<PauseCircle size={17}/>} {current.draft.status==='HELD'?'Resume':'Hold'}</button><button type="button" className="outline pos-discard" disabled={busy} onClick={()=>status('DISCARDED')}><Trash2 size={17}/> Discard</button></>}</div><button type="button" className="pos-pay-button" disabled={!current||!currentLines.length||busy} onClick={openPayment}><Wallet size={19}/>Payment / Checkout <ArrowRight size={18}/></button></div>
  </aside></div>
  <p className="pos-checkout-scope-note">Cash checkout posts a real sale, inventory deduction and balanced journal. Card, QR, E-Wallet, SARA and Discount/Voucher redemption require separate integrations.</p>
  {showHeld&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowHeld(false);}}><div className="dialog wide pos-held-dialog"><div className="dialog-head"><div><p className="eyebrow">POS TERMINAL</p><h2>Held / Saved Orders</h2></div><IconAction icon={X} title="Close saved orders" onClick={()=>setShowHeld(false)}/></div><div className="pos-saved-orders">{drafts.map(d=><button type="button" key={d.id} className="pos-saved-order" onClick={()=>selectDraft(d)}><div><b>Order #{d.id}</b><span>{d.branch_name} · {d.status}</span></div><span>{d.updated_at}</span><ChevronRight size={18}/></button>)}{!drafts.length&&<div className="pos-product-empty"><FolderOpen size={28}/><strong>No saved orders</strong></div>}</div></div></div>}
  {showPayment&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setShowPayment(false);}}><div className="dialog pos-payment-dialog"><div className="dialog-head"><div><p className="eyebrow">POS / CHECKOUT</p><h2>Payment Methods</h2></div><IconAction icon={X} title="Close payment" disabled={busy} onClick={()=>setShowPayment(false)}/></div><div className="pos-payment-total"><small>Total</small><strong>{preview?.bill?money(preview.bill.total):'—'}</strong></div><p className="muted">Enabled methods for this tenant and branch:</p><div className="pos-payment-methods">{visibleMethods.map(m=><div className={`pos-pay-method ${m.method_code==='CASH'?'pos-pay-cash':''}`} key={m.method_code}><Wallet size={17}/>{PAY_NAMES[m.method_code]||m.method_code}{m.method_code==='CASH'?<CheckCircle2 size={15}/>:<Lock size={15} title="Provider settlement not connected"/>}</div>)}{!visibleMethods.length&&<p className="muted">No enabled methods for this branch.</p>}</div>{visibleMethods.some(m=>m.method_code==='CASH')?<div className="pos-cash-entry"><label className="field"><span>Cash Received (RM)</span><input inputMode="decimal" aria-label="Cash Received (RM)" value={cashReceived} onChange={e=>{setCashReceived(e.target.value);setPaymentError('');paymentRequestKeyRef.current=uuid();}} placeholder="0.00" disabled={busy}/></label><div className="pos-cash-change"><span>Change (RM)</span><strong>{/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(cashReceived)&&Number(cashReceived)>=Number(preview?.bill?.total||Infinity)?money(Number(cashReceived)-Number(preview.bill.total)):'—'}</strong></div></div>:null}{checkoutStockBlockers.length>0&&<div className="pos-checkout-stock-alert" role="alert"><strong>Stock must be ready before Cash Checkout</strong><ul>{checkoutStockBlockers.slice(0,5).map(issue=><li key={issue.productId}><b>{issue.productName}</b> — {issue.reason==='NOT_INITIALIZED'?'Opening Stock not recorded':issue.reason==='INSUFFICIENT'?`Required ${issue.required}; available ${issue.available}`:'Quantity must have at most two meaningful decimal places'}</li>)}</ul>{checkoutStockBlockers.length>5&&<p>Plus {checkoutStockBlockers.length-5} other product(s).</p>}<p>Use Transactions → Stock / Inventory to record verified opening balances. No payment has been posted.</p></div>}{paymentError&&<p role="alert" className="pos-checkout-payment-error">{paymentError}</p>}{(discountCode.trim()||voucherCode.trim())&&<p role="alert" className="pos-quote-error">Cash checkout with Discount or Voucher is not yet connected. Remove the code to proceed without it.</p>}{visibleMethods.some(m=>m.method_code!=='CASH')&&<p className="muted">Card, bank, QR and E-Wallet methods remain unavailable until a confirmed provider settlement is integrated. SARA/MyKasih requires its authorized provider.</p>}<div className="dialog-actions"><button className="outline" type="button" disabled={busy} onClick={()=>setShowPayment(false)}>Cancel</button><button type="button" className="primary" disabled={busy||checkoutStockBlockers.length>0||!current||current.draft.status!=='DRAFT'||!preview?.cashCheckoutAvailable||quoteBusy||Boolean(quoteError)||!visibleMethods.some(m=>m.method_code==='CASH')||!Number.isFinite(Number(cashReceived))||Math.round(Number(cashReceived)*100)<Math.round(Number(preview?.bill?.total||0)*100)} onClick={payCash}><Wallet size={18}/> {busy?'Posting...':'Confirm Cash Payment'}</button></div></div></div>}
  {receipt&&<div className="overlay"><div className="dialog pos-payment-dialog pos-receipt-dialog"><div className="dialog-head"><div><p className="eyebrow">POS / PAID</p><h2>Cash Receipt</h2></div><IconAction icon={X} title="Close receipt" onClick={()=>setReceipt(null)}/></div><PosCashReceipt receipt={receipt}/><div className="dialog-actions"><button className="outline" type="button" onClick={()=>setReceipt(null)}>Close</button><button className="primary" type="button" onClick={()=>window.print()}><Printer size={17}/>Print Receipt</button></div></div></div>}
  {audit&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setAudit(null);}}><div className="dialog wide"><div className="dialog-head"><h2>POS Order Activity Log</h2><IconAction icon={X} title="Close activity log" onClick={()=>setAudit(null)}/></div><div className="table-scroll"><table><thead><tr><th>Time (UTC)</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead><tbody>{audit.map(a=><tr key={a.id}><td>{a.created_at}</td><td>{a.action_type}</td><td>{a.actor_name}</td><td>{typeof a.details==='string'?a.details:JSON.stringify(a.details)}</td></tr>)}{!audit.length&&<tr><td colSpan="4">No activity.</td></tr>}</tbody></table></div></div></div>}
 </main>;
}
