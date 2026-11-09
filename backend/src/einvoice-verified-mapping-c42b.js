// C4.2B: owner-confirmed mapping with immutable checkout-time evidence.
// Classification is NEVER inferred from Product Master default values.
import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
const fail=(code,status=400)=>Object.assign(new Error(code),{status});
const parseId=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<=0)throw fail('EINV_C42B_INVALID_PRODUCT_ID');return n;};
// Classification codes from official MyInvois code list. Never auto-select 022.
export const CLASSIFICATION_CODES=Object.freeze(Array.from({length:45},(_,i)=>String(i+1).padStart(3,'0')));
// Validated subset of official UN/ECE units. Expand only after SDK validation.
export const UBL_UNIT_CODES=Object.freeze(['EA','SET','KGM','LTR','C62']);
export const TAX_TYPE_CODES=Object.freeze(['01','02','06']);
export const EINV_C42B_SUBMISSION_ENABLED=false;
const validatePayload=value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='classificationCode,taxTypeCode,unitCode')throw fail('EINV_C42B_INVALID_MAPPING');const {classificationCode,unitCode,taxTypeCode}=value;if(!CLASSIFICATION_CODES.includes(classificationCode)||!UBL_UNIT_CODES.includes(unitCode)||!TAX_TYPE_CODES.includes(taxTypeCode))throw fail('EINV_C42B_INVALID_MAPPING');return {classificationCode,unitCode,taxTypeCode};};
const fingerprint=p=>createHash('sha256').update(JSON.stringify({id:String(p.id),sku:String(p.sku??''),productName:String(p.product_name??''),productType:String(p.product_type??''),baseUnit:String(p.base_unit_code??''),taxType:String(p.jkdm_tax_type??'NONE')})).digest('hex');
const parseJSON=v=>typeof v==='string'?JSON.parse(v):v;
const expectedCode=type=>({SALES_TAX:'01',SERVICE_TAX:'02',NONE:'06'})[type];
// Suggested Product Master values are presentation-only; never imply Owner verification.
export function suggestedProductMappingC42B(product){
 const classification=String(product.lhdn_classification_code??'').trim();
 const unit=String(product.lhdn_unit_code??'').trim().toUpperCase();
 const rawTax=String(product.lhdn_tax_type_code??'').trim();
 const jkdmTax=expectedCode(String(product.jkdm_tax_type??'NONE'));
 return {
  suggestedClassificationCode:CLASSIFICATION_CODES.includes(classification)?classification:null,
  suggestedUnitCode:UBL_UNIT_CODES.includes(unit)?unit:null,
  suggestedTaxTypeCode:TAX_TYPE_CODES.includes(rawTax)?rawTax:null,
  expectedTaxTypeCode:jkdmTax??null,
  taxTypeMismatch:!jkdmTax||rawTax!==jkdmTax,
  productMasterSuggestedOnly:true
 };
}
const canRead=req=>['OWNER','ADMIN'].includes(req.auth.user.role_code)&&req.auth.user.permissions.includes('einvoice_settings.view');
const canManage=req=>req.auth.user.role_code==='OWNER'&&req.auth.user.permissions.includes('einvoice_settings.manage');
export function validateVerifiedProductMapping(product,payload){
 const values=validatePayload(payload);
 if(values.taxTypeCode!==expectedCode(String(product.jkdm_tax_type??'NONE')))throw fail('EINV_C42B_TAX_CODE_CONFLICT',409);
 if(String(product.status)!=='ACTIVE'||Number(product.is_deleted)!==0)throw fail('EINV_C42B_PRODUCT_NOT_ACTIVE',409);
 return {...values,productFingerprint:fingerprint(product)};
}
// R2: read-only paginated review and explicit OWNER batch confirmation (max 500).
export const BULK_MAPPING_LIMIT_C42B=500;
const allStatuses=new Set(['all','eligible','unconfirmed','confirmed','reconfirmation','review']);
const mappingColumns=`p.id,p.sku,p.product_name,p.product_type,p.base_unit_code,p.jkdm_tax_type,p.lhdn_classification_code,p.lhdn_unit_code,p.lhdn_tax_type_code,p.status,p.is_deleted,
 m.classification_code,m.unit_code,m.tax_type_code,m.product_fingerprint,m.revision,m.confirmed_at`;
const mappingFromRow=p=>({id:String(p.id),sku:p.sku,name:p.product_name,jkdmTaxType:p.jkdm_tax_type,
 classificationCode:p.classification_code??null,unitCode:p.unit_code??null,taxTypeCode:p.tax_type_code??null,
 ...suggestedProductMappingC42B(p),
 confirmed:Boolean(p.product_fingerprint&&p.product_fingerprint===fingerprint(p)),revision:p.revision?String(p.revision):null});
export function reviewMappingRowC42B(p){
 const suggestion=suggestedProductMappingC42B(p);
 const verified=Boolean(p.product_fingerprint&&p.product_fingerprint===fingerprint(p));
 const active=String(p.status)==='ACTIVE'&&Number(p.is_deleted)===0;
 const eligible=active&&!suggestion.taxTypeMismatch&&Boolean(suggestion.suggestedClassificationCode&&suggestion.suggestedUnitCode&&suggestion.expectedTaxTypeCode);
 const status=verified?'confirmed':p.revision?'reconfirmation':eligible?'eligible':'review';
 return {...mappingFromRow(p),status,eligible:eligible&&!verified&&!p.revision,active,sourceFingerprint:fingerprint(p)};
}
const statusMatches=(r,status)=>status==='all'||(status==='unconfirmed'&&!r.confirmed&&!r.revision)||(status==='eligible'&&r.eligible)||(status==='review'&&!r.confirmed&&!r.eligible)||r.status===status;
const parseReviewFilters=(query={})=>{
 const search=String(query.search??'').trim().slice(0,80);
 const status=String(query.status??'all').toLowerCase();if(!allStatuses.has(status))throw fail('EINV_C42B_BAD_STATUS');
 const page=Number(query.page??1),pageSize=Number(query.pageSize??25);
 if(!Number.isSafeInteger(page)||page<1||page>100000||![25,50,100].includes(pageSize))throw fail('EINV_C42B_INVALID_PAGINATION');
 return {search,status,page,pageSize};
};
async function fetchReviewRows(conn,search){
 // Search is parameterized, and no hard-coded first-100-product cap remains.
 const [rows]=await conn.execute(`SELECT ${mappingColumns} FROM products p LEFT JOIN einvoice_product_mapping_c42b m ON m.product_id=p.id
  WHERE p.is_deleted=0 AND (?='' OR p.sku LIKE ? OR p.product_name LIKE ?) ORDER BY p.id`,[search,`%${search}%`,`%${search}%`]);
 return rows.map(reviewMappingRowC42B);
}
export async function listEinvoiceProductMappings(req,res){
 if(!canRead(req))throw fail('EINV_C42B_VIEW_FORBIDDEN',403);
 const {search,status,page,pageSize}=parseReviewFilters(req.query);
 const all=await fetchReviewRows(req.auth.pool,search),filtered=all.filter(r=>statusMatches(r,status));
 return res.set('Cache-Control','no-store').json({items:filtered.slice((page-1)*pageSize,page*pageSize),total:filtered.length,page,pageSize,
  counts:{total:all.length,eligible:all.filter(r=>r.eligible).length,review:all.filter(r=>!r.confirmed&&!r.eligible).length,confirmed:all.filter(r=>r.confirmed).length,reconfirmation:all.filter(r=>r.status==='reconfirmation').length},canManage:canManage(req)});
}
// A review fingerprint ties the explicit list to the values and product revision seen in Preview.
const bulkDigest=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const bulkPreviewSecret=randomBytes(32); // server-private; restarting invalidates unconfirmed previews
const bulkPreviewTtlMs=5*60*1000;
const signBulkPreview=(ownerId,digest,expiresAt)=>createHmac('sha256',bulkPreviewSecret).update(`${String(ownerId)}:${digest}:${expiresAt}`).digest('hex');
const makeBulkPreviewToken=(ownerId,digest)=>{const expiresAt=Date.now()+bulkPreviewTtlMs;return `${expiresAt}.${signBulkPreview(ownerId,digest,expiresAt)}`;};
const validBulkPreviewToken=(ownerId,digest,token)=>{
 const match=/^(\d{13})\.([a-f0-9]{64})$/.exec(String(token??''));if(!match)return false;
 const expiresAt=Number(match[1]);if(!Number.isSafeInteger(expiresAt)||expiresAt<=Date.now()||expiresAt>Date.now()+bulkPreviewTtlMs)return false;
 const expected=Buffer.from(signBulkPreview(ownerId,digest,expiresAt),'hex');
 return timingSafeEqual(expected,Buffer.from(match[2],'hex'));
};
export async function previewBulkEinvoiceProductMappings(req,res){
 if(!canManage(req))throw fail('EINV_C42B_OWNER_REQUIRED',403);
 const body=req.body??{},scope=body.scope;
 if(!['selected','allEligible'].includes(scope))throw fail('EINV_C42B_INVALID_SCOPE');
 const search=String(body.search??'').trim().slice(0,80);
 let ids=[];
 if(scope==='selected'){
  if(!Array.isArray(body.productIds)||!body.productIds.length||body.productIds.length>BULK_MAPPING_LIMIT_C42B)throw fail('EINV_C42B_INVALID_SELECTION');
  ids=body.productIds.map(parseId);
  if(new Set(ids).size!==ids.length)throw fail('EINV_C42B_DUPLICATE_SELECTION');
 }
 const rows=await fetchReviewRows(req.auth.pool,scope==='allEligible'?search:'');
 const allEligible=scope==='allEligible'?rows.filter(r=>r.eligible):[];
 const matched=scope==='selected'?rows.filter(r=>ids.includes(Number(r.id))):allEligible.slice(0,BULK_MAPPING_LIMIT_C42B);
 if(scope==='selected'&&matched.length!==ids.length)throw fail('EINV_C42B_SELECTION_NOT_FOUND',409);
 if(matched.length>BULK_MAPPING_LIMIT_C42B)throw fail('EINV_C42B_TOO_MANY_SELECTED',409);
 const ready=matched.filter(r=>r.eligible),rejected=matched.filter(r=>!r.eligible);
 // Values are always Product Master suggestions, not prior mapping defaults.
 const candidates=ready.map(r=>({productId:r.id,classificationCode:r.suggestedClassificationCode,unitCode:r.suggestedUnitCode,taxTypeCode:r.expectedTaxTypeCode,sourceFingerprint:r.sourceFingerprint}));
 return res.set('Cache-Control','no-store').json({scope,search,remainingEligible:Math.max(0,allEligible.length-matched.length),selected:matched.length,ready:candidates.length,rejected:rejected.map(r=>({productId:r.id,sku:r.sku,reason:r.confirmed?'ALREADY_CONFIRMED':r.status==='reconfirmation'?'RECONFIRMATION_REQUIRES_INDIVIDUAL_REVIEW':'REVIEW_REQUIRED'})),
  candidates,previewDigest:bulkDigest(candidates),previewToken:makeBulkPreviewToken(req.auth.user.id,bulkDigest(candidates)),requiresExplicitOwnerConfirmation:true});
}
export async function confirmBulkEinvoiceProductMappings(req,res){
 if(!canManage(req))throw fail('EINV_C42B_OWNER_REQUIRED',403);
 const {candidates,previewDigest,previewToken,acknowledge}=req.body??{};
 if(acknowledge!==true||!Array.isArray(candidates)||!candidates.length||candidates.length>BULK_MAPPING_LIMIT_C42B||!(/^[a-f0-9]{64}$/.test(String(previewDigest))))throw fail('EINV_C42B_BULK_PREVIEW_REQUIRED');
 const ids=candidates.map(c=>parseId(c.productId));
 if(new Set(ids).size!==ids.length||bulkDigest(candidates)!==previewDigest||!validBulkPreviewToken(req.auth.user.id,previewDigest,previewToken))throw fail('EINV_C42B_BULK_PREVIEW_CHANGED',409);
 const conn=await req.auth.pool.getConnection();
 try{
  await conn.beginTransaction();
  // Sorted locks reduce deadlock likelihood. All-or-nothing: a stale row cancels the batch.
  const ordered=[...candidates].sort((a,b)=>Number(a.productId)-Number(b.productId));
  for(const c of ordered){
   const [[p]]=await conn.execute('SELECT id,sku,product_name,product_type,base_unit_code,jkdm_tax_type,lhdn_classification_code,lhdn_unit_code,lhdn_tax_type_code,status,is_deleted FROM products WHERE id=? FOR UPDATE',[c.productId]);
   if(!p)throw fail('EINV_C42B_BULK_PRODUCT_CHANGED',409);
   const suggestion=suggestedProductMappingC42B(p);
   const intended={classificationCode:suggestion.suggestedClassificationCode,unitCode:suggestion.suggestedUnitCode,taxTypeCode:suggestion.expectedTaxTypeCode};
   if(suggestion.taxTypeMismatch||fingerprint(p)!==c.sourceFingerprint||Object.keys(intended).some(k=>!intended[k]||intended[k]!==c[k]))throw fail('EINV_C42B_BULK_PRODUCT_CHANGED',409);
   const values=validateVerifiedProductMapping(p,intended);
   const [[old]]=await conn.execute('SELECT classification_code,unit_code,tax_type_code,product_fingerprint,revision FROM einvoice_product_mapping_c42b WHERE product_id=? FOR UPDATE',[c.productId]);
   if(old)throw fail('EINV_C42B_BULK_RECONFIRM_INDIVIDUALLY',409);
   await conn.execute(`INSERT INTO einvoice_product_mapping_c42b(product_id,classification_code,unit_code,tax_type_code,product_fingerprint,revision,confirmed_by)
     VALUES(?,?,?,?,?,1,?)`,[c.productId,values.classificationCode,values.unitCode,values.taxTypeCode,values.productFingerprint,req.auth.user.id]);
   await conn.execute('INSERT INTO einvoice_product_mapping_audit_c42b(product_id,actor_user_id,old_mapping,new_mapping) VALUES(?,?,?,?)',
    [c.productId,req.auth.user.id,null,JSON.stringify({...values,bulkConfirmation:true})]);
  }
  await conn.commit();return res.set('Cache-Control','no-store').json({confirmed:ordered.length,rejected:0,mode:'BULK_OWNER_CONFIRMED'});
 }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
export async function confirmEinvoiceProductMapping(req,res){
 if(!canManage(req))throw fail('EINV_C42B_OWNER_REQUIRED',403);
 const productId=parseId(req.params.productId),conn=await req.auth.pool.getConnection();
 try{await conn.beginTransaction();
  const [[p]]=await conn.execute('SELECT id,sku,product_name,product_type,base_unit_code,jkdm_tax_type,status,is_deleted FROM products WHERE id=? FOR UPDATE',[productId]);
  if(!p)throw fail('EINV_C42B_PRODUCT_NOT_FOUND',404);
  const mapping=validateVerifiedProductMapping(p,req.body);
  const [[old]]=await conn.execute('SELECT classification_code,unit_code,tax_type_code,product_fingerprint,revision FROM einvoice_product_mapping_c42b WHERE product_id=? FOR UPDATE',[productId]);
  await conn.execute(`INSERT INTO einvoice_product_mapping_c42b(product_id,classification_code,unit_code,tax_type_code,product_fingerprint,revision,confirmed_by)
   VALUES(?,?,?,?,?,1,?) ON DUPLICATE KEY UPDATE classification_code=VALUES(classification_code),unit_code=VALUES(unit_code),tax_type_code=VALUES(tax_type_code),
   product_fingerprint=VALUES(product_fingerprint),revision=revision+1,confirmed_by=VALUES(confirmed_by),confirmed_at=CURRENT_TIMESTAMP(6)`,
   [productId,mapping.classificationCode,mapping.unitCode,mapping.taxTypeCode,mapping.productFingerprint,req.auth.user.id]);
  await conn.execute('INSERT INTO einvoice_product_mapping_audit_c42b(product_id,actor_user_id,old_mapping,new_mapping) VALUES(?,?,?,?)',
   [productId,req.auth.user.id,old?JSON.stringify(old):null,JSON.stringify(mapping)]);
  await conn.commit();return res.set('Cache-Control','no-store').json({confirmed:true,productId:String(productId)});
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}
export function makeCheckoutVerifiedMappingEvidenceC42B({sale,evidence,products,mappings}={}){
 if(!sale?.id||!Array.isArray(evidence?.lines)||!Array.isArray(products)||!Array.isArray(mappings))throw Error('EINV_C42B_INPUT_MISSING');
 const pm=new Map(products.map(p=>[String(p.id),p]));
 const mm=new Map(mappings.map(m=>[String(m.product_id),m]));
 const missing=[];
 const lines=evidence.lines.map(l=>{
  const p=pm.get(String(l.product_id)),m=mm.get(String(l.product_id));
  if(!p)throw Error('EINV_C42B_PRODUCT_MISSING');
  const active=Boolean(m&&m.product_fingerprint===fingerprint(p));
  const code=expectedCode(String(l.effective_jkdm_tax_type));
  const consistent=active&&code&&m.tax_type_code===code&&CLASSIFICATION_CODES.includes(m.classification_code)&&UBL_UNIT_CODES.includes(m.unit_code);
  if(!consistent)missing.push(String(l.sale_line_id));
  return {sale_line_id:String(l.sale_line_id),product_id:String(l.product_id),
   mapping_confirmed:Boolean(consistent),lhdn_classification:consistent?m.classification_code:null,
   ubl_unit_code:consistent?m.unit_code:null,lhdn_tax_type_code:consistent?m.tax_type_code:null,
   mapping_revision:consistent?String(m.revision):null,source_tax_type:String(l.effective_jkdm_tax_type)};
 });
 return {version:'C4.2B',sale_id:String(sale.id),branch_id:String(sale.branch_id),
  status:missing.length?'INCOMPLETE':'MAPPED',lines,missing_sale_line_ids:missing,
  // Mapping is not enough for UBL. Discounts/service charge/rounding/signature remain gated.
  submission_ready:false,submission_enabled:false};
}
export async function captureCheckoutVerifiedMappingEvidenceC42B(conn,{saleId}){
 const [[table]]=await conn.execute("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='einvoice_line_mapping_evidence_c42b'");
 if(Number(table?.n)!==1)return {captured:false,reason:'MIGRATION_049_NOT_APPLIED'};
 const [[sale]]=await conn.execute('SELECT id,branch_id FROM pos_sales WHERE id=?',[saleId]);
 const [[tax]]=await conn.execute('SELECT evidence_json FROM einvoice_line_tax_evidence_c42 WHERE sale_id=?',[saleId]);
 if(!sale||!tax)throw Error('EINV_C42B_REQUIRES_C42A');
 const taxEvidence=parseJSON(tax.evidence_json);
 const ids=[...new Set(taxEvidence.lines.map(l=>String(l.product_id)))];
 if(!ids.length)throw Error('EINV_C42B_EMPTY_LINES');
 const [products]=await conn.execute(`SELECT id,sku,product_name,product_type,base_unit_code,jkdm_tax_type FROM products WHERE id IN (${ids.map(()=>'?').join(',')})`,ids);
 const [mappings]=await conn.execute(`SELECT product_id,classification_code,unit_code,tax_type_code,product_fingerprint,revision FROM einvoice_product_mapping_c42b WHERE product_id IN (${ids.map(()=>'?').join(',')})`,ids);
 const document=makeCheckoutVerifiedMappingEvidenceC42B({sale,evidence:taxEvidence,products,mappings});
 const json=JSON.stringify(document),sha=createHash('sha256').update(json).digest('hex');
 await conn.execute('INSERT INTO einvoice_line_mapping_evidence_c42b(sale_id,branch_id,evidence_json,evidence_sha256) VALUES(?,?,?,?)',[saleId,sale.branch_id,json,sha]);
 return {captured:true,status:document.status};
}
