// Tenant-local cash-only checkout. No external provider payments or voucher redemption.
// All durable changes commit or roll back together on a single InnoDB connection.
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {calculateDraftQuote} from './pos-drafts.js';
import {inventoryIssue} from './inventory-cost.js';
import {totalDraftLines} from './pos-money.js';
import {makePosCashJournal} from './pos-cash-ledger.js';
import {parseSen,fmtSen} from './cash-shift-money.js';
const id=z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const schema=z.object({requestKey:z.uuid(),expectedVersion:z.number().int().positive(),expectedTotal:z.string().regex(/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),cashReceived:z.string().regex(/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),discountCode:z.string().trim().default(''),voucherCode:z.string().trim().default('')}).strict();
const err=(code,status=409)=>Object.assign(new Error(code),{status});
const str=v=>String(v);
async function receipt(conn,saleId){
 const [[sale]]=await conn.execute("SELECT s.*,DATE_FORMAT(s.posted_at,'%Y-%m-%d %H:%i:%s') AS posted_time,b.name AS branch_name,u.full_name AS cashier_name FROM pos_sales s JOIN branches b ON b.id=s.branch_id JOIN users u ON u.id=s.cashier_user_id WHERE s.id=?",[saleId]);
 if(!sale)throw err('POS_SALE_NOT_FOUND',404);
 const [lines]=await conn.execute('SELECT product_name,sku,quantity,unit_price,line_total,inventory_cost FROM pos_sale_lines WHERE sale_id=? ORDER BY id',[saleId]);
 const [[company]]=await conn.execute('SELECT registered_name,trading_name,address_line1,address_line2,city,postcode,state,country,phone,email FROM company_profiles WHERE id=1');
 const [[registration]]=await conn.execute('SELECT ssm_registration_number,ssm_old_registration_number,sst_sales_tax_number,sst_service_tax_number FROM company_registrations WHERE id=1');
 const [sstSwitches]=await conn.execute('SELECT tax_type,is_enabled FROM sst_tax_settings ORDER BY tax_type');
 const enabledTax=new Set(sstSwitches.filter(row=>Boolean(row.is_enabled)).map(row=>String(row.tax_type)));
 return {
  saleId:str(sale.id),receiptNumber:`POS-${str(sale.id).padStart(9,'0')}`,
  companyName:company?.registered_name||company?.trading_name||'',registeredName:company?.registered_name||'',
  ssmNumber:registration?.ssm_registration_number||'',ssmOldNumber:registration?.ssm_old_registration_number||'',
  // The two SST registrations follow their independent Owner switches.
  salesTaxNumber:enabledTax.has('SALES_TAX')?(registration?.sst_sales_tax_number||''):'',
  serviceTaxNumber:enabledTax.has('SERVICE_TAX')?(registration?.sst_service_tax_number||''):'',
  addressLines:company?[
   [company.address_line1,company.address_line2].filter(Boolean).join(', '),
   [company.postcode,company.city].filter(Boolean).join(' ')+(company.state?`, ${company.state}`:'')+(company.country?`. ${company.country}`:'')
  ].filter(Boolean):[],
  phone:company?.phone||'',email:company?.email||'',
  branchName:sale.branch_name,cashierName:sale.cashier_name,postedAtUtc:sale.posted_time,
  orderScope:sale.order_scope,tableId:sale.table_id?str(sale.table_id):null,
  lines,subtotal:str(sale.subtotal),salesTax:str(sale.sales_tax),serviceTax:str(sale.service_tax),
  serviceCharge:str(sale.service_charge),roundingAdjustment:str(sale.rounding_adjustment),
  total:str(sale.total),cashReceived:str(sale.cash_received),cashChange:str(sale.cash_change),paymentMethod:'CASH'
 };
}
export async function cashCheckout(req,res){
 const draftId=id.parse(req.params.id),data=schema.parse(req.body);
 if(!req.auth.user.permissions.includes('pos.checkout.cash')||!req.auth.user.permissions.includes('pos.cart.manage'))throw err('POS_CASH_CHECKOUT_FORBIDDEN',403);
 // Refund/discount/voucher settlement adapters must be atomic before enabling them.
 if(data.discountCode||data.voucherCode)throw err('POS_CASH_CHECKOUT_DISCOUNT_VOUCHER_NOT_CONNECTED');
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  const [[prior]]=await conn.execute('SELECT id,draft_id,cash_received,total FROM pos_sales WHERE request_key=?',[data.requestKey]);
  if(prior){
   if(str(prior.draft_id)!==str(draftId)||str(prior.cash_received)!==fmtSen(parseSen(data.cashReceived))||str(prior.total)!==fmtSen(parseSen(data.expectedTotal)))throw err('POS_CHECKOUT_REQUEST_KEY_CONFLICT');
   const answer=await receipt(conn,prior.id);await conn.commit();return res.set('Cache-Control','no-store').json({message:'POS_CASH_SALE_ALREADY_POSTED',idempotent:true,receipt:answer});
  }
  // Shift first: shift closing also locks the same row and must account for the sale.
  const [[ref]]=await conn.execute('SELECT shift_id,branch_id,cashier_user_id FROM pos_drafts WHERE id=?',[draftId]);
  if(!ref)throw err('POS_DRAFT_NOT_FOUND',404);
  if(str(ref.cashier_user_id)!==str(req.auth.user.id))throw err('POS_DRAFT_NOT_OWNED',403);
  if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)&&!req.auth.user.branchIds.includes(str(ref.branch_id)))throw err('POS_BRANCH_NOT_ASSIGNED',403);
  const [[shift]]=await conn.execute('SELECT id,status,branch_id,cashier_user_id FROM cash_shifts WHERE id=? FOR UPDATE',[ref.shift_id]);
  if(!shift||shift.status!=='OPEN'||str(shift.branch_id)!==str(ref.branch_id)||str(shift.cashier_user_id)!==str(req.auth.user.id))throw err('POS_OPEN_SHIFT_REQUIRED');
  const [[draft]]=await conn.execute('SELECT id,branch_id,shift_id,cashier_user_id,order_scope,table_id,status,version FROM pos_drafts WHERE id=? FOR UPDATE',[draftId]);
  if(!draft||draft.status!=='DRAFT')throw err('POS_ORDER_MUST_BE_ACTIVE');
  if(draft.version!==data.expectedVersion)throw err('POS_DRAFT_VERSION_CHANGED');
  if(draft.order_scope==='DINE_IN'&&!draft.table_id)throw err('POS_DINE_IN_TABLE_REQUIRED');
  const [[cash]]=await conn.execute("SELECT is_active FROM payment_method_settings WHERE branch_id=? AND method_code='CASH' FOR UPDATE",[draft.branch_id]);
  // CASH has a default enabled state when settings are not overridden.
  if(cash&&Number(cash.is_active)!==1)throw err('POS_CASH_METHOD_DISABLED');
  const [rawLines]=await conn.execute('SELECT id,product_id,product_name,sku,quantity,unit_price,track_stock,product_type,category_id,unit_code FROM pos_draft_lines WHERE draft_id=? ORDER BY product_id FOR UPDATE',[draftId]);
  if(!rawLines.length)throw err('POS_EMPTY_ORDER');
  const subtotal=totalDraftLines(rawLines);
  const quote=await calculateDraftQuote(conn,req,draftId,{});
  const total=quote.bill.total;
  if(total!==fmtSen(parseSen(data.expectedTotal)))throw err('POS_CHECKOUT_TOTAL_CHANGED');
  const paid=parseSen(data.cashReceived),due=parseSen(total);
  if(due<=0n)throw err('POS_CHECKOUT_TOTAL_MUST_BE_POSITIVE');
  if(paid<due)throw err('POS_CASH_INSUFFICIENT_TENDER');
  if(paid>999999999999n)throw err('POS_CASH_TENDER_LIMIT');
  const issued=new Map();let cogs=0n;
  for(const line of rawLines){
   const [[product]]=await conn.execute('SELECT id,track_stock,product_structure,product_type,status,is_deleted FROM products WHERE id=? FOR UPDATE',[line.product_id]);
   if(!product||product.status!=='ACTIVE'||product.is_deleted||product.product_structure!=='SINGLE'||product.product_type!==line.product_type||!!product.track_stock!==!!line.track_stock)throw err('POS_CHECKOUT_PRODUCT_CHANGED');
   if(!line.track_stock)continue;
   // Inventory 023 intentionally stores 2dp. Reject 3dp weight quantities before writes.
   const quantityText=str(line.quantity);
   if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2}0?)?$/.test(quantityText))throw err('POS_STOCK_QUANTITY_TWO_DECIMALS_ONLY');
   const roundedQuantity=Number(quantityText).toFixed(2);
   const [[balance]]=await conn.execute('SELECT quantity_on_hand,carrying_value,average_cost FROM inventory_branch_balances WHERE branch_id=? AND product_id=? FOR UPDATE',[draft.branch_id,line.product_id]);
   if(!balance)throw err('POS_STOCK_NOT_INITIALIZED');
   let result;
   try{result=inventoryIssue({quantity:str(balance.quantity_on_hand),carryingValue:str(balance.carrying_value)},roundedQuantity);}
   catch(e){throw err(e.message==='INVENTORY_INSUFFICIENT_STOCK'?'POS_INSUFFICIENT_STOCK':'POS_INVENTORY_ISSUE_FAILED');}
   issued.set(str(line.product_id),result);
   cogs+=parseSen(result.issuedCost);
  }
  if(cogs>999999999999n)throw err('POS_COST_LIMIT');
  const journal=makePosCashJournal(quote.bill,fmtSen(cogs));
  const [saved]=await conn.execute(`INSERT INTO pos_sales(request_key,draft_id,branch_id,shift_id,cashier_user_id,table_id,order_scope,payment_method,subtotal,sales_tax,service_tax,service_charge,rounding_adjustment,total,cost_of_goods,cash_received,cash_change)
   VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[data.requestKey,draftId,draft.branch_id,draft.shift_id,req.auth.user.id,draft.table_id,draft.order_scope,'CASH',quote.bill.subtotalBeforeTax,quote.bill.salesTax,quote.bill.serviceTax,quote.bill.serviceCharge,fmtSen(BigInt(quote.bill.roundingAdjustmentSen)),total,fmtSen(cogs),fmtSen(paid),fmtSen(paid-due)]);
  const saleId=saved.insertId;
  for(const line of subtotal.lines){
   const movement=issued.get(str(line.product_id));
   await conn.execute('INSERT INTO pos_sale_lines(sale_id,product_id,product_name,sku,quantity,unit_price,line_total,track_stock,inventory_cost) VALUES(?,?,?,?,?,?,?,?,?)',[saleId,line.product_id,line.product_name,line.sku,line.quantity,line.unit_price,line.lineTotal,line.track_stock?1:0,movement?.issuedCost||'0.00']);
   if(movement){
    await conn.execute('UPDATE inventory_branch_balances SET quantity_on_hand=?,carrying_value=?,average_cost=?,version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE branch_id=? AND product_id=?',[movement.quantity,movement.carryingValue,movement.averageCost,draft.branch_id,line.product_id]);
    const requestKey=randomUUID(),hash=createHash('sha256').update(JSON.stringify({saleId:str(saleId),productId:str(line.product_id),qty:line.quantity,cost:movement.issuedCost})).digest('hex');
    await conn.execute("INSERT INTO inventory_movements(request_key,request_hash,branch_id,product_id,movement_type,quantity_delta,value_delta,quantity_after,carrying_value_after,average_cost_after,reference,actor_user_id) VALUES(?,?,?,?,'POS_SALE',?,?,?,?,?,?,?)",[requestKey,hash,draft.branch_id,line.product_id,`-${Number(line.quantity).toFixed(2)}`,`-${movement.issuedCost}`,movement.quantity,movement.carryingValue,movement.averageCost,`POS-${str(saleId).padStart(9,'0')}`,req.auth.user.id]);
   }
  }
  const [j]=await conn.execute("INSERT INTO accounting_journals(source_type,source_id,branch_id) VALUES('POS_CASH_SALE',?,?)",[saleId,draft.branch_id]);
  for(const line of journal){await conn.execute('INSERT INTO accounting_journal_lines(journal_id,account_code,debit,credit,description) VALUES(?,?,?,?,?)',[j.insertId,line.accountCode,line.debit,line.credit,line.description]);}
  await conn.execute("UPDATE pos_drafts SET status='COMPLETED',version=version+1,updated_at=UTC_TIMESTAMP(6) WHERE id=? AND status='DRAFT'",[draftId]);
  await conn.execute("INSERT INTO pos_draft_audit_logs(draft_id,actor_user_id,action_type,details) VALUES(?,?,'COMPLETE',?)",[draftId,req.auth.user.id,JSON.stringify({saleId:str(saleId),method:'CASH',total,receipt:`POS-${str(saleId).padStart(9,'0')}`})]);
  if(draft.table_id)await conn.execute("INSERT INTO restaurant_table_audit_logs(table_id,actor_user_id,action_type,details) VALUES(?,?,'RELEASE',?)",[draft.table_id,req.auth.user.id,JSON.stringify({draftId:str(draftId),reason:'COMPLETED',saleId:str(saleId)})]);
  const answer=await receipt(conn,saleId);
  await conn.commit();return res.status(201).set('Cache-Control','no-store').json({message:'POS_CASH_SALE_PAID',idempotent:false,receipt:answer});
 }catch(e){await conn.rollback();if(e.code==='ER_DUP_ENTRY'||e.code==='ER_LOCK_DEADLOCK'||e.code==='ER_LOCK_WAIT_TIMEOUT')throw err('POS_CASH_CONCURRENT_RETRY');throw e;}finally{conn.release();}
}
export async function getCashReceipt(req,res){
 const saleId=id.parse(req.params.saleId),conn=req.auth.pool;
 const [[sale]]=await conn.execute('SELECT id,branch_id,cashier_user_id FROM pos_sales WHERE id=?',[saleId]);
 if(!sale)throw err('POS_SALE_NOT_FOUND',404);
 const privileged=['OWNER','ADMIN','MANAGER','ACCOUNTANT'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('pos.audit');
 if(!privileged&&str(sale.cashier_user_id)!==str(req.auth.user.id))throw err('POS_RECEIPT_NOT_OWNED',403);
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)&&!req.auth.user.branchIds.includes(str(sale.branch_id)))throw err('POS_RECEIPT_BRANCH_DENIED',403);
 return res.set('Cache-Control','no-store').json({receipt:await receipt(conn,saleId)});
}
