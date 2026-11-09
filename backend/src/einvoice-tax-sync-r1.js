// Explicit OWNER bulk synchronization of Product Master MyInvois tax codes and
// separately audited Owner Verified Mapping tax revisions. No sales are modified.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {CLASSIFICATION_CODES,UBL_UNIT_CODES,validateVerifiedProductMapping} from './einvoice-verified-mapping-c42b.js';

const failure=(code,status=400)=>Object.assign(new Error(code),{status});
const allowed=Object.freeze({SALES_TAX:'01',SERVICE_TAX:'02',NONE:'06'});
const LIMIT=500;
const secret=randomBytes(32);
const ttlMs=5*60*1000;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const signature=(owner,digest,expires)=>createHmac('sha256',secret).update(`${owner}:${digest}:${expires}`).digest('hex');
const ownerOnly=req=>req.auth?.user?.role_code==='OWNER'&&req.auth.user.permissions?.includes('einvoice_settings.manage');
const productSelection=`p.id,p.sku,p.product_name,p.product_type,p.base_unit_code,p.jkdm_tax_type,p.lhdn_classification_code,p.lhdn_unit_code,p.lhdn_tax_type_code,p.status,p.is_deleted,
 m.classification_code,m.unit_code,m.tax_type_code,m.product_fingerprint,m.revision,m.confirmed_at`;
export function assessTaxSyncRow(row){
 const expected=allowed[String(row.jkdm_tax_type??'')];
 const current=String(row.lhdn_tax_type_code??'');
 if(!expected||String(row.status)!=='ACTIVE'||Number(row.is_deleted)!==0)return {...row,eligible:false,reason:'INACTIVE_OR_UNKNOWN_JKDM'};
 if(current===expected)return {...row,eligible:false,reason:'ALREADY_ALIGNED',expected};
 if(!['01','02','06'].includes(current))return {...row,eligible:false,reason:'UNKNOWN_PRODUCT_TAX_CODE',expected};
 // Do not silently rewrite stale, invalid or inconsistent previously verified classifications.
 const hasMapping=row.revision!==null&&row.revision!==undefined;
 if(hasMapping){
  if(!row.product_fingerprint||!row.confirmed_at||!CLASSIFICATION_CODES.includes(String(row.classification_code))||!UBL_UNIT_CODES.includes(String(row.unit_code)))
   return {...row,eligible:false,reason:'MAPPING_REQUIRES_INDIVIDUAL_REVIEW',expected};
  // Mapping tax must be exactly the old Product Master tax or the new authoritative JKDM tax.
  if(![current,expected].includes(String(row.tax_type_code)))return {...row,eligible:false,reason:'UNRELATED_MAPPING_TAX_CODE',expected};
  try{const validated=validateVerifiedProductMapping(row,{classificationCode:String(row.classification_code),unitCode:String(row.unit_code),taxTypeCode:expected});
   if(validated.productFingerprint!==String(row.product_fingerprint))return {...row,eligible:false,reason:'STALE_VERIFIED_FINGERPRINT',expected};
  }catch{return {...row,eligible:false,reason:'MAPPING_REQUIRES_INDIVIDUAL_REVIEW',expected};}
 }
 return {...row,expected,eligible:true,reason:null,hasMapping};
}
const stamp=row=>sha({id:String(row.id),sku:row.sku,name:row.product_name,type:row.product_type,unit:row.base_unit_code,jkdm:row.jkdm_tax_type,
  current:row.lhdn_tax_type_code,expected:row.expected,status:row.status,deleted:Number(row.is_deleted),
  masterClass:row.lhdn_classification_code,masterUnit:row.lhdn_unit_code,
  mappingClass:row.classification_code??null,mappingUnit:row.unit_code??null,mappingTax:row.tax_type_code??null,
  mappingFingerprint:row.product_fingerprint??null,revision:row.revision===null?null:String(row.revision),confirmedAt:row.confirmed_at?new Date(row.confirmed_at).toISOString():null});
const tokenValid=(owner,digest,token)=>{
 const match=/^(\d{13})\.([a-f0-9]{64})$/.exec(String(token??''));if(!match)return false;
 const expires=Number(match[1]);if(!Number.isSafeInteger(expires)||expires<=Date.now()||expires>Date.now()+ttlMs)return false;
 return timingSafeEqual(Buffer.from(signature(owner,digest,expires),'hex'),Buffer.from(match[2],'hex'));
};
const searchValue=v=>String(v??'').trim().slice(0,80);
async function getRows(pool,search=''){
 const [rows]=await pool.execute(`SELECT ${productSelection} FROM products p LEFT JOIN einvoice_product_mapping_c42b m ON m.product_id=p.id
 WHERE p.is_deleted=0 AND (?='' OR p.sku LIKE ? OR p.product_name LIKE ?) ORDER BY p.id`,[search,`%${search}%`,`%${search}%`]);
 return rows.map(assessTaxSyncRow);
}
export async function previewTaxSync(req,res){
 if(!ownerOnly(req))throw failure('EINV_TAX_SYNC_OWNER_ONLY',403);
 const search=searchValue(req.body?.search);
 const rows=await getRows(req.auth.pool,search),eligible=rows.filter(r=>r.eligible),batch=eligible.slice(0,LIMIT);
 const candidates=batch.map(r=>({productId:String(r.id),sku:r.sku,productName:r.product_name,from:r.lhdn_tax_type_code,to:r.expected,
  verifiedMappingAction:r.hasMapping?'RECONFIRM_TAX_REVISION':'PRODUCT_MASTER_ONLY',sourceStamp:stamp(r)}));
 const digest=sha(candidates),expiry=Date.now()+ttlMs;
 const blocked=rows.filter(r=>r.reason!=='ALREADY_ALIGNED'&&!r.eligible).map(r=>({productId:String(r.id),sku:r.sku,reason:r.reason}));
 return res.set('Cache-Control','no-store').json({candidates,blocked,eligibleTotal:eligible.length,aligned:rows.filter(r=>r.reason==='ALREADY_ALIGNED').length,
  remainingEligible:Math.max(0,eligible.length-LIMIT),previewDigest:digest,previewToken:`${expiry}.${signature(req.auth.user.id,digest,expiry)}`,requiresOwnerConfirmation:true});
}
export async function confirmTaxSync(req,res){
 if(!ownerOnly(req))throw failure('EINV_TAX_SYNC_OWNER_ONLY',403);
 const {candidates,previewDigest,previewToken,acknowledge}=req.body??{};
 if(acknowledge!==true||!Array.isArray(candidates)||!candidates.length||candidates.length>LIMIT||!(/^[a-f0-9]{64}$/.test(String(previewDigest))))throw failure('EINV_TAX_SYNC_PREVIEW_REQUIRED');
 const ids=candidates.map(c=>String(c.productId));
 if(new Set(ids).size!==ids.length||ids.some(x=>!(/^[1-9]\d*$/.test(x))||!Number.isSafeInteger(Number(x))))throw failure('EINV_TAX_SYNC_INVALID_SELECTION');
 if(sha(candidates)!==previewDigest||!tokenValid(req.auth.user.id,previewDigest,previewToken))throw failure('EINV_TAX_SYNC_INVALID_PREVIEW',409);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  let reverified=0,masterOnly=0;
  for(const c of [...candidates].sort((a,b)=>Number(a.productId)-Number(b.productId))){
   const [[p]]=await conn.execute(`SELECT ${productSelection} FROM products p LEFT JOIN einvoice_product_mapping_c42b m ON m.product_id=p.id WHERE p.id=? FOR UPDATE`,[c.productId]);
   if(!p)throw failure('EINV_TAX_SYNC_STALE_PREVIEW',409);
   const row=assessTaxSyncRow(p);
   if(!row.eligible||stamp(row)!==c.sourceStamp||c.from!==p.lhdn_tax_type_code||c.to!==row.expected||c.verifiedMappingAction!==(row.hasMapping?'RECONFIRM_TAX_REVISION':'PRODUCT_MASTER_ONLY'))throw failure('EINV_TAX_SYNC_STALE_PREVIEW',409);
   await conn.execute('UPDATE products SET lhdn_tax_type_code=? WHERE id=? AND lhdn_tax_type_code=?',[row.expected,p.id,p.lhdn_tax_type_code]);
   await conn.execute(`INSERT INTO product_audit_logs(product_id,actor_user_id,action_type,previous_data,next_data) VALUES(?,?,'PRODUCT_UPDATE',?,?)`,
    [p.id,req.auth.user.id,JSON.stringify({lhdn_tax_type_code:p.lhdn_tax_type_code}),JSON.stringify({lhdn_tax_type_code:row.expected,operation:'OWNER_BULK_TAX_SYNC_R1'})]);
   if(row.hasMapping){
    // Only tax type is re-confirmed; previously verified classification/unit remain unchanged.
    const verified=validateVerifiedProductMapping(p,{classificationCode:String(p.classification_code),unitCode:String(p.unit_code),taxTypeCode:row.expected});
    await conn.execute(`UPDATE einvoice_product_mapping_c42b SET tax_type_code=?,product_fingerprint=?,revision=revision+1,confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP(6) WHERE product_id=? AND revision=?`,
     [row.expected,verified.productFingerprint,req.auth.user.id,p.id,p.revision]);
    await conn.execute('INSERT INTO einvoice_product_mapping_audit_c42b(product_id,actor_user_id,old_mapping,new_mapping) VALUES(?,?,?,?)',
     [p.id,req.auth.user.id,JSON.stringify({classificationCode:p.classification_code,unitCode:p.unit_code,taxTypeCode:p.tax_type_code,revision:String(p.revision)}),
      JSON.stringify({...verified,bulkTaxSync:true,source:'OWNER_BULK_TAX_SYNC_R1'})]);
    reverified++;
   }else masterOnly++;
  }
  await conn.commit();
  return res.set('Cache-Control','no-store').json({updated:candidates.length,reverified,masterOnly,mode:'OWNER_BULK_TAX_SYNC'});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export const TAX_SYNC_SUBMISSION_ENABLED=false;
