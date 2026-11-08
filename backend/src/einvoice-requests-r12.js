// R1.2 customer request capture. No MyInvois submission, no POS/receipt mutation.
import {randomBytes,createHash} from 'node:crypto';
import {tenantPool,centralPool} from './database.js';
import {encryptCredential,decryptCredential} from './einvoice-crypto.js';
import {buyerRequestSchema,publicRequestBaseUrl} from './einvoice-buyer-r12.js';
const error=(code,status=400)=>Object.assign(new Error(code),{status});
const sha=v=>createHash('sha256').update(v).digest('hex');
const tokenRe=/^t([1-9][0-9]{0,14})\.([a-f0-9]{64})$/;
function getToken(value){const found=tokenRe.exec(String(value||''));if(!found)throw error('EINVOICE_REQUEST_INVALID',404);return {tenantId:found[1],hash:sha(value)};}
async function requestRecord(token){
 const {tenantId,hash}=getToken(token);
 const [valid]=await centralPool().execute("SELECT id FROM tenants WHERE id=? AND status='ACTIVE' LIMIT 1",[tenantId]);if(!valid.length)throw error('EINVOICE_REQUEST_NOT_FOUND',404);
 const pool=tenantPool(tenantId);
 const [[row]]=await pool.execute("SELECT r.id,r.sale_id,r.status,r.environment,r.expires_at,s.receipt_number,s.total,c.registered_name AS businessName,e.enabled,e.environment AS activeEnvironment FROM einvoice_customer_requests r JOIN pos_sales s ON s.id=r.sale_id JOIN company_profiles c ON c.id=1 JOIN einvoice_settings e ON e.id=1 WHERE r.request_token_sha256=? LIMIT 1",[hash]);
 if(!row)throw error('EINVOICE_REQUEST_NOT_FOUND',404);
 if(!Boolean(row.enabled)||row.environment!==row.activeEnvironment)throw error('EINVOICE_REQUEST_DISABLED',410);
 const [[notExpired]]=await pool.execute('SELECT (expires_at>UTC_TIMESTAMP(6)) AS valid FROM einvoice_customer_requests WHERE id=?',[row.id]);
 if(!Number(notExpired.valid))throw error('EINVOICE_REQUEST_EXPIRED',410);
 return {pool,row};
}
export async function issueEinvoiceRequest(req,res){
 const saleId=String(req.params.saleId||'');if(!/^[1-9][0-9]{0,14}$/.test(saleId))throw error('INVALID_SALE_ID');
 const base=publicRequestBaseUrl();if(!base)return res.set('Cache-Control','no-store').json({available:false,reason:'EINVOICE_PUBLIC_HTTPS_URL_REQUIRED'});
 const pool=req.auth.pool;
 const [[cfg]]=await pool.execute('SELECT enabled,environment FROM einvoice_settings WHERE id=1');
 if(!cfg||!Number(cfg.enabled))return res.set('Cache-Control','no-store').json({available:false,reason:'EINVOICE_DISABLED'});
 const [[sale]]=await pool.execute("SELECT id,branch_id,cashier_user_id,(DATE_ADD(LAST_DAY(posted_at),INTERVAL 1 DAY)>UTC_TIMESTAMP(6)) AS requestOpen FROM pos_sales WHERE id=?",[saleId]);if(!sale)throw error('POS_SALE_NOT_FOUND',404);if(!Number(sale.requestOpen))return res.set('Cache-Control','no-store').json({available:false,reason:'EINVOICE_REQUEST_WINDOW_CLOSED'});
 const owner=String(sale.cashier_user_id)===String(req.auth.user.id);
 const privileged=['OWNER','ADMIN','MANAGER','ACCOUNTANT'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('pos.audit');
 if(!owner&&!privileged)throw error('EINVOICE_RECEIPT_NOT_OWNED',403);
 if(!['OWNER','ADMIN'].includes(req.auth.user.role_code)&&!req.auth.user.branchIds.includes(String(sale.branch_id)))throw error('EINVOICE_RECEIPT_BRANCH_DENIED',403);
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();
  const [[existing]]=await conn.execute('SELECT id,request_token_cipher,status,expires_at,environment FROM einvoice_customer_requests WHERE sale_id=? FOR UPDATE',[saleId]);
  if(existing){
   const [[valid]]=await conn.execute('SELECT (expires_at>UTC_TIMESTAMP(6)) AS valid FROM einvoice_customer_requests WHERE id=?',[existing.id]);
   if(!Number(valid.valid)||existing.environment!==cfg.environment)throw error('EINVOICE_REQUEST_ALREADY_USED_OR_EXPIRED',409);
   const token=decryptCredential(existing.request_token_cipher);await conn.commit();return res.set('Cache-Control','no-store').json({available:true,url:`${base}/einvoice/request/${token}`,status:existing.status});
  }
  const tenantId=String(req.auth.tenantId||req.auth.tenant?.id||'');
  if(!/^[1-9][0-9]{0,14}$/.test(tenantId))throw error('EINVOICE_TENANT_ID_REQUIRED',409);
  const token=`t${tenantId}.${randomBytes(32).toString('hex')}`;
  const [insert]=await conn.execute("INSERT INTO einvoice_customer_requests(sale_id,request_token_sha256,request_token_cipher,environment,expires_at) SELECT id,?,?,?,DATE_ADD(LAST_DAY(posted_at),INTERVAL 1 DAY) FROM pos_sales WHERE id=?",[sha(token),encryptCredential(token),cfg.environment,saleId]);
  await conn.execute("INSERT INTO einvoice_customer_request_audit(request_id,event) VALUES(?,'ISSUED')",[insert.insertId]);
  await conn.commit();return res.set('Cache-Control','no-store').json({available:true,url:`${base}/einvoice/request/${token}`,status:'ISSUED'});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export async function publicRequestDetails(req,res){
 const {row}=await requestRecord(req.params.token);
 return res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).json({businessName:row.businessName,receiptNumber:row.receipt_number,amount:String(row.total),status:row.status});
}
export async function submitPublicRequest(req,res){
 const buyer=buyerRequestSchema.parse(req.body);const {pool,row}=await requestRecord(req.params.token);
 const cipher=encryptCredential(JSON.stringify(buyer));
 const conn=await pool.getConnection();try{
  await conn.beginTransaction();
  const [update]=await conn.execute("UPDATE einvoice_customer_requests r JOIN einvoice_settings e ON e.id=1 SET r.status='REQUESTED',r.buyer_cipher=?,r.submitted_at=UTC_TIMESTAMP(6) WHERE r.id=? AND r.status='ISSUED' AND r.expires_at>UTC_TIMESTAMP(6) AND e.enabled=1 AND r.environment=e.environment",[cipher,row.id]);
  if(update.affectedRows!==1)throw error('EINVOICE_REQUEST_ALREADY_SUBMITTED',409);
  await conn.execute("INSERT INTO einvoice_customer_request_audit(request_id,event) VALUES(?,'REQUESTED')",[row.id]);
  await conn.commit();return res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}).status(201).json({submitted:true,status:'REQUESTED',message:'Request recorded. This is not an LHDN-validated e-Invoice.'});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
