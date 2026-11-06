import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ClipboardList,RefreshCw,Search,UtensilsCrossed,ShoppingBag,Table2,Plus,Minus,Trash2,Send,Clock3,CheckCircle2,X,Package,Eye,AlertTriangle} from 'lucide-react';
import {request} from './api.js';
import {refreshPage} from './refresh-page.js';
import './OrderTerminal.css';
const money=v=>`RM ${Number.isFinite(Number(v))?Number(v).toFixed(2):'0.00'}`;
const newId=()=>crypto.randomUUID();
const errorLabel=code=>({WAITER_TABLE_REQUIRED_FOR_DINE_IN:'Please choose a table for Dine In.',WAITER_TABLE_OCCUPIED:'Another order already occupies this table. Refresh the tables.',WAITER_TABLE_NOT_AVAILABLE:'This table is unavailable.',WAITER_TABLE_NOT_IN_BRANCH:'Table does not belong to the selected branch.',WAITER_PRODUCT_NOT_AVAILABLE:'The product is unavailable. Refresh the menu.',WAITER_PRODUCT_STRUCTURE_PENDING:'Set, Bundle and Pack orders require the composition integration.',WAITER_STOCK_NOT_INITIALIZED:'Opening Stock is required for this stock-tracked product.',WAITER_INSUFFICIENT_STOCK:'Insufficient stock. Refresh the menu or reduce the quantity.',WAITER_ORDER_ALREADY_FINAL:'This order has already been received or cancelled.',WAITER_CONCURRENT_SUBMISSION_RETRY:'Order changed concurrently; refresh and check saved orders before retrying.',WAITER_REQUEST_KEY_REUSED:'Please refresh the order before resubmitting.',WAITER_RECEIVE_DENIED:'Only an authorized cashier with an open Cash Shift may receive orders.'})[code]||code||'Request failed';
const cleanedQuantity=v=>String(Number(v).toFixed(3)).replace(/0+$/,'').replace(/\.$/,'');
export default function OrderTerminal({profile,notify}){
 const [data,setData]=useState({branches:[],products:[],categories:[],prices:[],tables:[],orderTypes:['TAKE_AWAY']});
 const [orders,setOrders]=useState([]),[branchId,setBranchId]=useState(''),[mode,setMode]=useState('TAKE_AWAY'),[tableId,setTableId]=useState('');
 const [cart,setCart]=useState([]),[orderNotes,setOrderNotes]=useState(''),[search,setSearch]=useState(''),[category,setCategory]=useState('ALL');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[activeOrder,setActiveOrder]=useState(null),[cancelReason,setCancelReason]=useState('');
 const pendingRef=useRef(null);
 const mayCreate=profile.user.permissions.includes('order_terminal.create');
 const mayCancel=profile.user.permissions.includes('order_terminal.cancel');
 const canDineIn=data.orderTypes.includes('DINE_IN');
 const load=useCallback(async()=>{
  setLoading(true);try{
   const [meta,recent]=await Promise.all([request('/order-terminal/bootstrap'),request('/order-terminal/orders')]);
   setData(meta);setOrders(recent.orders||[]);
   setBranchId(previous=>meta.branches.some(b=>String(b.id)===String(previous))?previous:(meta.branches[0]?.id||''));
  }catch(e){notify(errorLabel(e.message),true);}finally{setLoading(false);}
 },[notify]);
 useEffect(()=>{void load();},[load]);
 const branch=data.branches.find(b=>String(b.id)===String(branchId));
 const tables=data.tables.filter(t=>String(t.branch_id)===String(branchId));
 const prices=useMemo(()=>new Map(data.prices.filter(p=>String(p.branch_id)===String(branchId)).map(p=>[String(p.product_id),p.selling_price])),[data.prices,branchId]);
 const products=useMemo(()=>data.products.filter(p=>(category==='ALL'||String(p.category_id)===String(category))&&`${p.product_name} ${p.sku||''} ${p.barcode||''}`.toLowerCase().includes(search.toLowerCase())).slice(0,240),[data.products,category,search]);
 const subtotal=cart.reduce((sum,l)=>sum+Number(l.price)*Number(l.quantity),0);
 const validCart=cart.every(l=>/^\d+(?:\.\d{1,3})?$/.test(l.quantity)&&Number(l.quantity)>0&&Number(l.quantity)<=1000&&(l.weighable||Number.isInteger(Number(l.quantity))));
 const canSend=mayCreate&&!busy&&!!branchId&&cart.length>0&&validCart&&(mode==='TAKE_AWAY'||!!tableId);
 const invalidate=()=>{pendingRef.current=null;};
 function add(p){
  if(!mayCreate||p.product_structure!=='SINGLE')return;
  setCart(previous=>{
   const old=previous.find(x=>String(x.id)===String(p.id));
   if(old)return previous.map(x=>x===old?{...x,quantity:cleanedQuantity(Number(x.quantity)+1)}:x);
   if(previous.length>=150){notify('Maximum 150 products per order.',true);return previous;}
   return [...previous,{id:String(p.id),name:p.product_name,sku:p.sku,price:prices.get(String(p.id))??p.selling_price,quantity:'1',weighable:Boolean(p.is_weighable),notes:''}];
  });invalidate();
 }
 function change(id,key,value){setCart(p=>p.map(x=>x.id===id?{...x,[key]:value}:x));invalidate();}
 function updateQty(line,value){
  const v=Number(value);if(!Number.isFinite(v)||v<=0||v>1000)return notify('Quantity must be greater than zero and at most 1,000.',true);
  if(!line.weighable&&!Number.isInteger(v))return notify('This product requires a whole-number quantity.',true);
  if(!/^\d+(?:\.\d{1,3})?$/.test(value))return notify('Quantity supports up to three decimals.',true);
  change(line.id,'quantity',cleanedQuantity(v));
 }
 async function submit(){
  if(!canSend)return;
  if(!window.confirm(`Send ${cart.length} product(s) for ${mode==='DINE_IN'?'Dine In':'Take Away'}? The order will appear in the cashier queue. No payment will be recorded.`))return;
  const payload={branchId:Number(branchId),orderScope:mode,tableId:mode==='DINE_IN'?Number(tableId):null,orderNotes:orderNotes.trim(),items:cart.map(l=>({productId:Number(l.id),quantity:l.quantity,notes:l.notes.trim()}))};
  const fingerprint=JSON.stringify(payload);
  if(pendingRef.current?.fingerprint!==fingerprint)pendingRef.current={fingerprint,key:newId()};
  setBusy(true);
  try{
   const result=await request('/order-terminal/orders',{method:'POST',body:{...payload,requestKey:pendingRef.current.key}});
   setCart([]);setTableId('');setOrderNotes('');pendingRef.current=null;
   notify(`Waiter Order #${result.order.id} sent to cashier · ${mode==='DINE_IN'?'Dine In':'Take Away'}.`);
   await load();
  }catch(e){notify(errorLabel(e.message),true);}
  finally{setBusy(false);}
 }
 async function detail(order){
  setBusy(true);try{setActiveOrder(await request(`/order-terminal/orders/${order.id}`));setCancelReason('');}catch(e){notify(errorLabel(e.message),true);}finally{setBusy(false);}
 }
 async function cancel(){
  const record=activeOrder?.order;if(!record||!mayCancel||record.status!=='SUBMITTED')return;
  if(cancelReason.trim().length<8)return notify('Cancellation reason must contain at least eight characters.',true);
  if(!window.confirm(`Cancel unclaimed Waiter Order #${record.id}? This will release its table.`))return;
  setBusy(true);try{await request(`/order-terminal/orders/${record.id}/cancel`,{method:'POST',body:{reason:cancelReason.trim()}});setActiveOrder(null);await load();notify('Waiter order cancelled; audit history retained.');}catch(e){notify(errorLabel(e.message),true);}finally{setBusy(false);}
 }
 return <main className="page order-terminal" aria-label="Waiter Order Terminal">
  <header className="order-terminal-header"><div><p className="eyebrow">TRANSACTIONS / WAITER</p><h1>Order Terminal</h1><p>{profile.business.name} · {profile.user.fullName} · Take Away / Dine In</p></div><button type="button" className="outline" onClick={()=>refreshPage(load,notify)} disabled={busy||loading}><RefreshCw size={17}/> Refresh Orders</button></header>
  <section className="order-terminal-controls">
   <label className="field"><span>Branch</span><select value={branchId} onChange={e=>{setBranchId(e.target.value);setTableId('');setCart([]);invalidate();}} disabled={busy||cart.length>0}><option value="">Select branch</option>{data.branches.map(b=><option value={b.id} key={b.id}>{b.name}</option>)}</select></label>
   <div className="order-mode" role="group" aria-label="Order Type"><button type="button" className={mode==='TAKE_AWAY'?'active':''} onClick={()=>{setMode('TAKE_AWAY');setTableId('');invalidate();}}><ShoppingBag size={18}/> Take Away</button>{canDineIn&&<button type="button" className={mode==='DINE_IN'?'active':''} onClick={()=>{setMode('DINE_IN');invalidate();}}><UtensilsCrossed size={18}/> Dine In</button>}</div>
   {mode==='DINE_IN'&&<label className="field"><span>Restaurant Table</span><select value={tableId} onChange={e=>{setTableId(e.target.value);invalidate();}}><option value="">Select available table</option>{tables.map(t=><option key={t.id} value={t.id} disabled={t.occupancy!=='AVAILABLE'}>{t.table_number}{t.table_name?` · ${t.table_name}`:''}{t.table_area?` · ${t.table_area}`:''} — {t.occupancy}</option>)}</select></label>}
  </section>
  <div className="order-terminal-columns"><section className="order-terminal-catalog"><div className="order-terminal-section-title"><h2>Menu & Products</h2><span>{products.length} shown</span></div><div className="order-terminal-filters"><label><Search size={18}/><input aria-label="Search Product Name SKU or Barcode" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search products / SKU / barcode"/></label><select aria-label="Category" value={category} onChange={e=>setCategory(e.target.value)}><option value="ALL">All Categories</option>{data.categories.map(c=><option key={c.id} value={c.id}>{c.category_name}</option>)}</select></div>
   <div className="order-terminal-products">{products.map(p=><button type="button" key={p.id} disabled={!mayCreate||p.product_structure!=='SINGLE'||!branchId||busy} onClick={()=>add(p)} title={p.product_structure!=='SINGLE'?'Product structure integration pending':`Add ${p.product_name}`}><span className="order-product-icon"><Package size={22}/></span><span className="order-product-text"><strong>{p.product_name}</strong><small>{p.sku} · {p.barcode||'No barcode'}</small></span><span className="order-product-price">{money(prices.get(String(p.id))??p.selling_price)} <Plus size={16}/></span></button>)}{!products.length&&<div className="order-terminal-empty">No matching active products.</div>}</div>
  </section><aside className="order-terminal-cart"><div className="order-terminal-section-title"><h2><ClipboardList size={20}/> Current Order</h2><span>{cart.length} lines</span></div><div className="order-cart-mode">{mode==='DINE_IN'?`Dine In · ${tables.find(t=>String(t.id)===String(tableId))?.table_number||'Select table'}`:'Take Away'} · {branch?.name||'Select branch'}</div>
   <div className="order-cart-lines">{cart.map(line=><div key={line.id} className="order-cart-line"><div className="order-cart-line-title"><b>{line.name}</b><button type="button" title="Remove product" aria-label={`Remove ${line.name}`} onClick={()=>{setCart(p=>p.filter(x=>x.id!==line.id));invalidate();}}><Trash2 size={15}/></button></div><span>{line.sku} · {money(line.price)} each</span><div className="order-cart-quantity"><button type="button" aria-label={`Decrease ${line.name}`} onClick={()=>Number(line.quantity)<=1? (setCart(p=>p.filter(x=>x.id!==line.id)),invalidate()):updateQty(line,cleanedQuantity(Number(line.quantity)-1))}><Minus size={15}/></button><input type="number" min={line.weighable?'0.001':'1'} step={line.weighable?'0.001':'1'} value={line.quantity} onChange={e=>change(line.id,'quantity',e.target.value)} onBlur={()=>updateQty(line,line.quantity)} aria-label={`Quantity ${line.name}`}/><button type="button" aria-label={`Increase ${line.name}`} onClick={()=>updateQty(line,cleanedQuantity(Number(line.quantity)+1))}><Plus size={15}/></button><b>{money(Number(line.price)*Number(line.quantity))}</b></div><input type="text" maxLength={500} aria-label={`Special request for ${line.name}`} placeholder="Item notes (optional)" value={line.notes} onChange={e=>change(line.id,'notes',e.target.value)}/></div>)}{!cart.length&&<div className="order-terminal-empty"><ShoppingBag size={26}/><p>Select menu products to start a new order.</p></div>}</div>
   <label className="field"><span>Order Notes (optional)</span><textarea value={orderNotes} maxLength={500} rows={2} onChange={e=>{setOrderNotes(e.target.value);invalidate();}} placeholder="Customer requests / table instructions"/></label><div className="order-terminal-total"><span>Product Subtotal (estimate)</span><b>{money(subtotal)}</b></div><p className="order-terminal-disclaimer"><AlertTriangle size={15}/> Final taxes, discounts, stock check and payment are calculated by POS. No stock or cash is posted here. KDS is not yet connected.</p><button type="button" className="primary order-terminal-send" disabled={!canSend} onClick={submit}><Send size={18}/> {busy?'Working...':'Send Order to Cashier'}</button>
  </aside></div>
  <section className="order-terminal-recent"><div className="order-terminal-section-title"><h2>My Recent Orders</h2><span>Submitted orders remain auditable</span></div><div className="table-scroll"><table><thead><tr><th>Order</th><th>Type</th><th>Branch / Table</th><th>Waiter</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td>#{o.id}</td><td>{o.order_scope==='DINE_IN'?'Dine In':'Take Away'}</td><td>{o.branch_name}{o.table_number?` · ${o.table_number}`:''}</td><td>{o.waiter_name}</td><td><span className={`order-status order-status-${o.status.toLowerCase()}`}>{o.status}</span></td><td>{o.created_at}</td><td><button type="button" className="outline action-icon" title="View waiter order" aria-label={`View waiter order ${o.id}`} onClick={()=>detail(o)}><Eye size={16}/></button></td></tr>)}{!orders.length&&<tr><td colSpan={7}>No waiter orders yet.</td></tr>}</tbody></table></div></section>
  {activeOrder&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setActiveOrder(null);}}><div className="dialog wide"><div className="dialog-head"><div><p className="eyebrow">ORDER HISTORY / READ ONLY</p><h2>Waiter Order #{activeOrder.order.id}</h2><p>{activeOrder.order.order_scope==='DINE_IN'?'Dine In':'Take Away'} · {activeOrder.order.branch_name} · {activeOrder.order.status}</p></div><button className="icon-button" title="Close" type="button" onClick={()=>setActiveOrder(null)}><X size={19}/></button></div>{activeOrder.order.order_notes&&<p>Order Notes: {activeOrder.order.order_notes}</p>}<div className="table-scroll"><table><thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Item Notes</th></tr></thead><tbody>{activeOrder.lines.map(l=><tr key={l.id}><td>{l.product_name}</td><td>{l.quantity}</td><td>{money(l.unit_price)}</td><td>{l.line_notes||'—'}</td></tr>)}</tbody></table></div>{activeOrder.order.status==='SUBMITTED'&&mayCancel&&<div className="order-terminal-cancel"><label className="field"><span>Cancellation Reason (minimum 8 characters)</span><textarea value={cancelReason} rows={2} maxLength={500} onChange={e=>setCancelReason(e.target.value)} placeholder="Reason required for audit"/></label><button type="button" className="outline" disabled={busy||cancelReason.trim().length<8} onClick={cancel}><Trash2 size={16}/> Cancel Unclaimed Order</button></div>}<div className="dialog-actions"><button className="outline" type="button" onClick={()=>setActiveOrder(null)}>Close</button></div></div></div>}
 </main>;
}
