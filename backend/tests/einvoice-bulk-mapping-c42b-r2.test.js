import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {reviewMappingRowC42B,previewBulkEinvoiceProductMappings,confirmBulkEinvoiceProductMappings,BULK_MAPPING_LIMIT_C42B} from '../src/einvoice-verified-mapping-c42b.js';
const product=(id,extra={})=>({id,sku:`P-${id}`,product_name:`Product ${id}`,product_type:'GOODS',base_unit_code:'PCS',jkdm_tax_type:'NONE',lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'06',status:'ACTIVE',is_deleted:0,...extra});
const owner={auth:{user:{id:9,role_code:'OWNER',permissions:['einvoice_settings.manage','einvoice_settings.view']}}};
const response=()=>({set(){return this},json(body){return body}});
const fakePool=rows=>({execute:async()=>[rows],getConnection:async()=>{throw Error('not implemented')}});
const makeReq=(rows,body,user=owner.auth.user)=>({auth:{user,pool:fakePool(rows)},body});
function digest(candidates){return createHash('sha256').update(JSON.stringify(candidates)).digest('hex')}
test('R2 review eligibility is strict: valid product yes; mismatch, archived and untrusted code no',()=>{
 assert.equal(reviewMappingRowC42B(product(1)).eligible,true);
 for(const extra of [{lhdn_classification_code:'999'},{lhdn_tax_type_code:'01'},{lhdn_unit_code:'PCS'},{status:'INACTIVE'},{is_deleted:1}]){
  assert.equal(reviewMappingRowC42B(product(2,extra)).eligible,false);
 }
});
test('R2 bulk preview is read only, uses all matching eligible products, and never confirms',async()=>{
 const rows=[product(1),product(2,{lhdn_tax_type_code:'01'}),product(3)];
 const result=await previewBulkEinvoiceProductMappings(makeReq(rows,{scope:'allEligible'}),response());
 assert.equal(result.ready,2);assert.deepEqual(result.candidates.map(x=>x.productId),['1','3']);assert.equal(result.rejected.length,0);
 assert.equal(result.previewDigest,digest(result.candidates));assert.equal(result.requiresExplicitOwnerConfirmation,true);
});
test('R2 selection cannot contain duplicates, unknown ids, or more than 500',async()=>{
 await assert.rejects(previewBulkEinvoiceProductMappings(makeReq([product(1)],{scope:'selected',productIds:['1','1']}),response()),/DUPLICATE_SELECTION/);
 await assert.rejects(previewBulkEinvoiceProductMappings(makeReq([product(1)],{scope:'selected',productIds:['2']}),response()),/SELECTION_NOT_FOUND/);
 await assert.rejects(previewBulkEinvoiceProductMappings(makeReq([], {scope:'selected',productIds:Array.from({length:501},(_,i)=>String(i+1))}),response()),/INVALID_SELECTION/);
 assert.equal(BULK_MAPPING_LIMIT_C42B,500);
});
test('R2 only OWNER can preview and confirm; digest and acknowledgement required',async()=>{
 const user={id:1,role_code:'ADMIN',permissions:['einvoice_settings.manage','einvoice_settings.view']};
 await assert.rejects(previewBulkEinvoiceProductMappings(makeReq([product(1)],{scope:'allEligible'},user),response()),/OWNER_REQUIRED/);
 await assert.rejects(confirmBulkEinvoiceProductMappings(makeReq([],{},user),response()),/OWNER_REQUIRED/);
 await assert.rejects(confirmBulkEinvoiceProductMappings(makeReq([],{candidates:[],acknowledge:true,previewDigest:'0'.repeat(64)}),response()),/PREVIEW_REQUIRED/);
});
test('R2 atomic successful confirmation writes mapping and audit for every product',async()=>{
 const rows=[product(1),product(2)];const preview=await previewBulkEinvoiceProductMappings(makeReq(rows,{scope:'allEligible'}),response());
 const writes=[];let commits=0,rollbacks=0,release=0;
 const conn={beginTransaction:async()=>{},commit:async()=>{commits++},rollback:async()=>{rollbacks++},release:()=>{release++},execute:async(sql,params=[])=>{
  writes.push({sql,params});if(sql.includes('FROM products WHERE id=? FOR UPDATE'))return [[rows.find(p=>p.id===Number(params[0]))]];
  if(sql.includes('FROM einvoice_product_mapping_c42b WHERE product_id=? FOR UPDATE'))return [[]];
  return [{affectedRows:1}];
 }};
 const req={auth:{user:owner.auth.user,pool:{getConnection:async()=>conn}},body:{candidates:preview.candidates,previewDigest:preview.previewDigest,previewToken:preview.previewToken,acknowledge:true}};
 const result=await confirmBulkEinvoiceProductMappings(req,response());
 assert.equal(result.confirmed,2);assert.equal(commits,1);assert.equal(rollbacks,0);assert.equal(release,1);
 assert.equal(writes.filter(w=>w.sql.includes('INSERT INTO einvoice_product_mapping_c42b')).length,2);
 assert.equal(writes.filter(w=>w.sql.includes('INSERT INTO einvoice_product_mapping_audit_c42b')).length,2);
});
test('R2 stale product after preview rolls back entire batch',async()=>{
 const rows=[product(1)];const preview=await previewBulkEinvoiceProductMappings(makeReq(rows,{scope:'allEligible'}),response());
 let commits=0,rollbacks=0;
 const conn={beginTransaction:async()=>{},commit:async()=>{commits++},rollback:async()=>{rollbacks++},release:()=>{},execute:async(sql)=>{
  if(sql.includes('FROM products WHERE id=? FOR UPDATE'))return [[{...rows[0],product_name:'Changed since preview'}]];
  throw Error('Unexpected write');
 }};
 await assert.rejects(confirmBulkEinvoiceProductMappings({auth:{user:owner.auth.user,pool:{getConnection:async()=>conn}},body:{candidates:preview.candidates,previewDigest:preview.previewDigest,previewToken:preview.previewToken,acknowledge:true}},response()),/BULK_PRODUCT_CHANGED/);
 assert.equal(commits,0);assert.equal(rollbacks,1);
});
test('R2 previously confirmed mapping rejects batch instead of overwriting verified audit',async()=>{
 const row=product(1);const preview=await previewBulkEinvoiceProductMappings(makeReq([row],{scope:'allEligible'}),response());
 let rolled=0;
 const conn={beginTransaction:async()=>{},commit:async()=>{throw Error('should not commit')},rollback:async()=>{rolled++},release:()=>{},execute:async(sql)=>{
  if(sql.includes('FROM products WHERE id=? FOR UPDATE'))return [[row]];
  if(sql.includes('FROM einvoice_product_mapping_c42b WHERE product_id=? FOR UPDATE'))return [[{revision:1}]];
  throw Error('Unexpected write');
 }};
 await assert.rejects(confirmBulkEinvoiceProductMappings({auth:{user:owner.auth.user,pool:{getConnection:async()=>conn}},body:{candidates:preview.candidates,previewDigest:preview.previewDigest,previewToken:preview.previewToken,acknowledge:true}},response()),/RECONFIRM_INDIVIDUALLY/);
 assert.equal(rolled,1);
});
test('R2 routes and UI are wired; MyInvois submission remains disabled',()=>{
 const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');const ui=readFileSync(new URL('../../frontend/src/EinvoiceProductMappingC42B.jsx',import.meta.url),'utf8');
 assert.match(app,/product-mappings\/bulk-preview/);assert.match(app,/product-mappings\/bulk-confirm/);
 for(const part of ['Select eligible on page','Review Selected Mapping','Review All Eligible Matching Search','Bulk Mapping Preview','Confirm ${preview.ready} Selected Mappings'])assert.ok(ui.includes(part));
 assert.match(readFileSync(new URL('../src/einvoice-verified-mapping-c42b.js',import.meta.url),'utf8'),/EINV_C42B_SUBMISSION_ENABLED=false/);
});
test('R2 all-eligible review supports more than 500 products in sequential batches',async()=>{
 const rows=Array.from({length:574},(_,i)=>product(i+1));
 const first=await previewBulkEinvoiceProductMappings(makeReq(rows,{scope:'allEligible'}),response());
 assert.equal(first.ready,500);assert.equal(first.remainingEligible,74);
 const after=rows.slice(500);
 const second=await previewBulkEinvoiceProductMappings(makeReq(after,{scope:'allEligible'}),response());
 assert.equal(second.ready,74);assert.equal(second.remainingEligible,0);
});
test('R2 owner cannot bypass a signed server preview or reuse it with modified selections',async()=>{
 const preview=await previewBulkEinvoiceProductMappings(makeReq([product(1)],{scope:'allEligible'}),response());
 const req={auth:{user:owner.auth.user,pool:{}},body:{candidates:preview.candidates,previewDigest:preview.previewDigest,acknowledge:true}};
 await assert.rejects(confirmBulkEinvoiceProductMappings(req,response()),/BULK_PREVIEW_CHANGED/);
 const bad={...req,body:{...req.body,previewToken:preview.previewToken,candidates:[{...preview.candidates[0],classificationCode:'045'}]}};
 await assert.rejects(confirmBulkEinvoiceProductMappings(bad,response()),/BULK_PREVIEW_CHANGED/);
});
