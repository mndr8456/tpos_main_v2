import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessTaxSyncRow,TAX_SYNC_SUBMISSION_ENABLED} from '../src/einvoice-tax-sync-r1.js';
const good={id:1,sku:'PRD-000001',product_name:'Nasi Goreng',product_type:'GOODS',base_unit_code:'EA',jkdm_tax_type:'SERVICE_TAX',
 lhdn_tax_type_code:'06',status:'ACTIVE',is_deleted:0,revision:null,confirmed_at:null};
test('SERVICE_TAX code 06 gets explicit owner review for 02',()=>{const r=assessTaxSyncRow(good);assert.equal(r.eligible,true);assert.equal(r.expected,'02');});
test('SALES_TAX code 06 gets 01; NONE code 02 gets 06',()=>{assert.equal(assessTaxSyncRow({...good,jkdm_tax_type:'SALES_TAX'}).expected,'01');assert.equal(assessTaxSyncRow({...good,jkdm_tax_type:'NONE',lhdn_tax_type_code:'02'}).expected,'06');});
test('matching code is not changed',()=>assert.equal(assessTaxSyncRow({...good,lhdn_tax_type_code:'02'}).reason,'ALREADY_ALIGNED'));
test('inactive and unknown tax codes are ineligible',()=>{assert.equal(assessTaxSyncRow({...good,status:'INACTIVE'}).eligible,false);assert.equal(assessTaxSyncRow({...good,lhdn_tax_type_code:'99'}).eligible,false);});
test('stale or unrelated verified mapping is blocked',()=>{const r=assessTaxSyncRow({...good,revision:1,confirmed_at:new Date(),product_fingerprint:'deadbeef',classification_code:'022',unit_code:'EA',tax_type_code:'01'});assert.equal(r.eligible,false);assert.equal(r.reason,'UNRELATED_MAPPING_TAX_CODE');});
test('requires owner preview, explicit audit and no external submission',()=>{
 const source=readFileSync(new URL('../src/einvoice-tax-sync-r1.js',import.meta.url),'utf8');
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
 assert.equal(TAX_SYNC_SUBMISSION_ENABLED,false);assert.match(source,/role_code==='OWNER'/);assert.match(source,/validBulk|tokenValid/);assert.match(source,/beginTransaction/);assert.match(source,/rollback/);assert.match(source,/product_audit_logs/);assert.match(source,/einvoice_product_mapping_audit_c42b/);assert.match(source,/revision=revision\+1/);
 assert.match(app,/tax-sync-preview/);assert.match(app,/tax-sync-confirm/);
 assert.doesNotMatch(source,/UPDATE pos_sales|UPDATE einvoice_line_mapping_evidence|sendMyInvois/i);
});

import {createHash} from 'node:crypto';
import {previewTaxSync,confirmTaxSync} from '../src/einvoice-tax-sync-r1.js';
const productFingerprint=p=>createHash('sha256').update(JSON.stringify({id:String(p.id),sku:String(p.sku??''),productName:String(p.product_name??''),productType:String(p.product_type??''),baseUnit:String(p.base_unit_code??''),taxType:String(p.jkdm_tax_type??'NONE')})).digest('hex');
const verifiedProduct={...good,classification_code:'022',unit_code:'EA',tax_type_code:'06',revision:1,confirmed_at:new Date('2026-11-09T12:00:00.000Z'),product_fingerprint:productFingerprint(good)};
test('valid unchanged Owner mapping can be explicitly reconfirmed in a bulk tax synchronization',()=>{
 const result=assessTaxSyncRow(verifiedProduct);
 assert.equal(result.eligible,true);assert.equal(result.hasMapping,true);assert.equal(result.expected,'02');
});
test('stale verified fingerprint is blocked even if tax codes are plausible',()=>{
 const result=assessTaxSyncRow({...verifiedProduct,product_name:'Product changed after confirmation'});
 assert.equal(result.eligible,false);assert.equal(result.reason,'STALE_VERIFIED_FINGERPRINT');
});
function mockTaxSyncDb(products){
 const rows=products.map(p=>({...p}));const writes=[];
 let inTransaction=false;
 const execute=async(sql,params=[])=>{
  if(sql.includes('FROM products p LEFT JOIN einvoice_product_mapping_c42b')){
   if(sql.includes('WHERE p.id=?')){return [[rows.find(p=>String(p.id)===String(params[0]))].filter(Boolean)];}
   return [rows];
  }
  if(!inTransaction)throw Error('WRITE_WITHOUT_TRANSACTION');
  writes.push({sql,params});return [{affectedRows:1}];
 };
 const conn={execute,beginTransaction:async()=>{inTransaction=true;},commit:async()=>{inTransaction=false;},rollback:async()=>{inTransaction=false;writes.length=0;},release:()=>{}};
 return {pool:{execute,getConnection:async()=>conn},writes,rows};
}
const reqFor=pool=>({auth:{pool,user:{role_code:'OWNER',permissions:['einvoice_settings.manage'],id:1}},body:{}});
const resFor=()=>({result:null,set(){return this;},json(v){this.result=v;return this;}});
test('preview read-only, owner confirmation writes product, mapping revision and separate audits atomically',async()=>{
 const db=mockTaxSyncDb([verifiedProduct]);const req=reqFor(db.pool),res=resFor();
 await previewTaxSync(req,res);assert.equal(db.writes.length,0);assert.equal(res.result.candidates.length,1);
 assert.equal(res.result.candidates[0].verifiedMappingAction,'RECONFIRM_TAX_REVISION');
 req.body={candidates:res.result.candidates,previewDigest:res.result.previewDigest,previewToken:res.result.previewToken,acknowledge:true};
 const confirmRes=resFor();await confirmTaxSync(req,confirmRes);
 assert.equal(confirmRes.result.updated,1);assert.equal(confirmRes.result.reverified,1);
 assert.equal(db.writes.length,4);assert.match(db.writes[0].sql,/UPDATE products/);
 assert.match(db.writes[1].sql,/product_audit_logs/);assert.match(db.writes[2].sql,/revision=revision\+1/);assert.match(db.writes[3].sql,/einvoice_product_mapping_audit_c42b/);
});
test('changing product after preview prevents all writes and enforces rollback',async()=>{
 const db=mockTaxSyncDb([verifiedProduct]);const req=reqFor(db.pool),res=resFor();
 await previewTaxSync(req,res);db.rows[0].product_name='Modified';
 req.body={candidates:res.result.candidates,previewDigest:res.result.previewDigest,previewToken:res.result.previewToken,acknowledge:true};
 await assert.rejects(()=>confirmTaxSync(req,resFor()),/EINV_TAX_SYNC_STALE_PREVIEW/);assert.equal(db.writes.length,0);
});
test('missing explicit acknowledgement and non-owner calls cannot confirm',async()=>{
 const db=mockTaxSyncDb([verifiedProduct]);const req=reqFor(db.pool),res=resFor();
 await previewTaxSync(req,res);
 req.body={candidates:res.result.candidates,previewDigest:res.result.previewDigest,previewToken:res.result.previewToken,acknowledge:false};
 await assert.rejects(()=>confirmTaxSync(req,resFor()),/EINV_TAX_SYNC_PREVIEW_REQUIRED/);
 req.auth.user.role_code='ADMIN';req.body.acknowledge=true;
 await assert.rejects(()=>confirmTaxSync(req,resFor()),/EINV_TAX_SYNC_OWNER_ONLY/);
 assert.equal(db.writes.length,0);
});
