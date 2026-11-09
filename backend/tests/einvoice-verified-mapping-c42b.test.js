import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateVerifiedProductMapping,makeCheckoutVerifiedMappingEvidenceC42B,captureCheckoutVerifiedMappingEvidenceC42B,EINV_C42B_SUBMISSION_ENABLED} from '../src/einvoice-verified-mapping-c42b.js';
const source=(name)=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
const p={id:50,sku:'N-50',product_name:'Nasi',product_type:'GOODS',base_unit_code:'PCS',jkdm_tax_type:'SALES_TAX',status:'ACTIVE',is_deleted:0};
const m=validateVerifiedProductMapping(p,{classificationCode:'022',unitCode:'EA',taxTypeCode:'01'});
const sale={id:31,branch_id:1};
const ev={lines:[{sale_line_id:'101',product_id:'50',effective_jkdm_tax_type:'SALES_TAX'}]};
const mapped={product_id:50,classification_code:'022',unit_code:'EA',tax_type_code:'01',product_fingerprint:m.productFingerprint,revision:3};
test('C4.2B requires explicit validated owner fields, rejects incompatible JKDM code',()=>{
 assert.equal(m.productFingerprint.length,64);
 assert.throws(()=>validateVerifiedProductMapping(p,{classificationCode:'999',unitCode:'EA',taxTypeCode:'01'}),/EINV_C42B_INVALID_MAPPING/);
 assert.throws(()=>validateVerifiedProductMapping(p,{classificationCode:'022',unitCode:'PCS',taxTypeCode:'01'}),/EINV_C42B_INVALID_MAPPING/);
 assert.throws(()=>validateVerifiedProductMapping(p,{classificationCode:'022',unitCode:'EA',taxTypeCode:'02'}),/EINV_C42B_TAX_CODE_CONFLICT/);
});
test('C4.2B maps only a verified unchanged product and code-consistent tax line',()=>{
 const result=makeCheckoutVerifiedMappingEvidenceC42B({sale,evidence:ev,products:[p],mappings:[mapped]});
 assert.equal(result.status,'MAPPED');assert.equal(result.lines[0].lhdn_classification,'022');assert.equal(result.lines[0].ubl_unit_code,'EA');assert.equal(result.lines[0].lhdn_tax_type_code,'01');
 assert.equal(result.submission_ready,false);assert.equal(EINV_C42B_SUBMISSION_ENABLED,false);
});
test('C4.2B never infers a mapping from Product Master defaults or missing owner confirmation',()=>{
 const product={...p,lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'01'};
 const result=makeCheckoutVerifiedMappingEvidenceC42B({sale,evidence:ev,products:[product],mappings:[]});
 assert.equal(result.status,'INCOMPLETE');assert.equal(result.lines[0].lhdn_classification,null);assert.equal(result.lines[0].mapping_confirmed,false);
});
test('C4.2B invalidates mappings after product tax/name/unit modification',()=>{
 for(const change of [{jkdm_tax_type:'SERVICE_TAX'},{product_name:'Nasi Baru'},{base_unit_code:'BOX'}]){
  const result=makeCheckoutVerifiedMappingEvidenceC42B({sale,evidence:ev,products:[{...p,...change}],mappings:[mapped]});
  assert.equal(result.status,'INCOMPLETE');assert.equal(result.lines[0].mapping_confirmed,false);
 }
});
test('C4.2B rejects a contradictory effective tax type even with a valid saved mapping',()=>{
 const result=makeCheckoutVerifiedMappingEvidenceC42B({sale,evidence:{lines:[{...ev.lines[0],effective_jkdm_tax_type:'SERVICE_TAX'}]},products:[p],mappings:[mapped]});
 assert.equal(result.status,'INCOMPLETE');assert.equal(result.lines[0].lhdn_tax_type_code,null);
});
test('C4.2B is additive with immutable sale evidence, immutable audit and no historical backfill',()=>{
 const sql=source('database/049_tenant_einvoice_verified_mapping.sql');
 assert.match(sql,/UNIQUE KEY uq_einv_c42b_sale/);assert.match(sql,/einv_c42b_sale_no_update/);assert.match(sql,/einv_c42b_sale_no_delete/);
 assert.match(sql,/einv_c42b_audit_no_update/);assert.match(sql,/einv_c42b_audit_no_delete/);
 assert.doesNotMatch(sql,/\bDROP\b|\bDELETE FROM\b|\bALTER TABLE pos_sales\b|\bUPDATE einvoice_checkout_snapshots\b/i);
 for(const name of ['pos-cash-checkout.js','pos-multi-payment.js']){
  const s=source('backend/src/'+name);
  const a=s.indexOf('await captureCheckoutLineTaxEvidenceC42(conn,{saleId,quote});');
  const b=s.indexOf('await captureCheckoutVerifiedMappingEvidenceC42B(conn,{saleId});');
  assert.ok(a>=0&&b>a&&s.indexOf('await conn.commit()',b)>b);
 }
});
test('C4.2B captures one digest with source C4.2A inside the same transaction; before 049 optional',async()=>{
 const requests=[];
 const conn={execute:async(sql,params=[])=>{requests.push({sql,params});
  if(sql.includes('information_schema.TABLES'))return [[{n:1}]];
  if(sql.includes('FROM pos_sales WHERE id'))return [[sale]];
  if(sql.includes('FROM einvoice_line_tax_evidence_c42 WHERE'))return [[{evidence_json:JSON.stringify(ev)}]];
  if(sql.includes('FROM products WHERE id IN'))return [[p]];
  if(sql.includes('FROM einvoice_product_mapping_c42b WHERE'))return [[mapped]];
  if(sql.startsWith('INSERT INTO einvoice_line_mapping_evidence_c42b'))return [{affectedRows:1}];
  throw Error('UNEXPECTED_SQL:'+sql);
 }};
 const response=await captureCheckoutVerifiedMappingEvidenceC42B(conn,{saleId:31});
 assert.deepEqual(response,{captured:true,status:'MAPPED'});
 const inserted=requests.at(-1);assert.match(inserted.sql,/^INSERT INTO einvoice_line_mapping_evidence_c42b/);
 assert.equal(inserted.params[3],createHash('sha256').update(inserted.params[2]).digest('hex'));
 assert.deepEqual(await captureCheckoutVerifiedMappingEvidenceC42B({execute:async()=>[[{n:0}]]},{saleId:31}),{captured:false,reason:'MIGRATION_049_NOT_APPLIED'});
});
