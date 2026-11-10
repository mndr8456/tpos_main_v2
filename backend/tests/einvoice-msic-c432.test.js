import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateMsicCatalogueC432,MYINVOIS_MSIC_URL_C432} from '../src/einvoice-msic-c432.js';
const source=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const fixture=()=>Array.from({length:501},(_,i)=>({Code:String(i).padStart(5,'0'),Description:`Activity ${i}`,'MSIC Category Reference':'A'}));
test('R3.2 official SDK source is pinned and validated catalogue is code-searchable',()=>{
 assert.equal(MYINVOIS_MSIC_URL_C432,'https://sdk.myinvois.hasil.gov.my/files/MSICSubCategoryCodes.json');
 const codes=validateMsicCatalogueC432(fixture());
 assert.equal(codes.length,501);assert.equal(codes[5].code,'00005');
 assert.equal(codes[5].description,'Activity 5');
});
test('R3.2 refuses fabricated, duplicate, corrupt and truncated MSIC catalogues',()=>{
 for(const corrupt of [[...fixture(),{...fixture()[0],Description:'Conflicting official description'}],fixture().slice(0,4),fixture().map((row,i)=>i===10?{...row,Code:'ABCD1'}:row),fixture().map((row,i)=>i===10?{...row,Description:''}:row)]){
  assert.throws(()=>validateMsicCatalogueC432(corrupt),/EINV_MSIC_CATALOG_INVALID/);
 }
});
test('R3.2 catalogue is routed with session and permission and never bypasses owner confirmation',()=>{
 const app=source('../src/app.js'),save=source('../src/einvoice-supplier-metadata-c431.js');
 assert.match(app,/app\.get\('\/api\/v2\/company-profile\/einvoice-supplier\/msic-codes',authenticate,permitted\('company_profile\.view'\),listMsicCodesC432\)/);
 assert.match(save,/findMsicCodeC432\(input\.msicCode\)/);
 assert.match(save,/EINV_SUPPLIER_MSIC_NOT_IN_OFFICIAL_CATALOG/);
 assert.match(save,/\['OWNER','ADMIN'\]/);
 assert.match(save,/company_profile_audit_logs/);
});
test('R3.2 UI searches official full catalogue, preserves explicit selection and blocks unknown save',()=>{
 const ui=source('../../frontend/src/CompanyProfile.jsx');
 assert.match(ui,/company-profile\/einvoice-supplier\/msic-codes/);
 assert.match(ui,/item\.description/);
 assert.match(ui,/setSupplier\(previous=>\(\{\.\.\.previous,msicCode:item\.code,businessActivityDescription:item\.description\}\)\)/);
 assert.match(ui,/!msicSelected/);
 assert.match(ui,/Search MSIC code or business activity/);
});
test('R3.2 runtime catalogue is cached, sourced from official URL and bounded',()=>{
 const svc=source('../src/einvoice-msic-c432.js');
 assert.match(svc,/myinvois-msic-cache\.json/);
 assert.match(svc,/AbortSignal\.timeout\(12000\)/);
 assert.match(svc,/MAX_BYTES/);
 assert.match(svc,/STALE_VERIFIED_CACHE/);
 assert.doesNotMatch(svc,/submissionEnabled:true/);
});

// C4.3 R3.2.1: offline official JSON fallback — no synthetic records are shipped.
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLocalOfficialMsicC432,MYINVOIS_MSIC_LOCAL_FILE_C432} from '../src/einvoice-msic-c432.js';
test('R3.2.1 accepts operator-installed official-format JSON without an SDK network call',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tpos-msic-offline-'));
 try{
  const path=join(dir,'MSICSubCategoryCodes.json');
  await writeFile(path,JSON.stringify(fixture()));
  const result=await readLocalOfficialMsicC432(path);
  assert.equal(result.source,'LOCAL_OFFICIAL_JSON');
  assert.equal(result.entries.length,501);
  assert.equal(result.entries[5].code,'00005');
  assert.equal(result.entries[5].description,'Activity 5');
  assert.ok(result.localFileMtime>0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('R3.2.1 malformed or incomplete local file is rejected, not silently accepted',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tpos-msic-offline-'));
 try{
  const path=join(dir,'MSICSubCategoryCodes.json');
  await writeFile(path,'{not JSON');
  await assert.rejects(readLocalOfficialMsicC432(path),/EINV_MSIC_LOCAL_FILE_INVALID/);
  await writeFile(path,JSON.stringify(fixture().slice(0,4)));
  await assert.rejects(readLocalOfficialMsicC432(path),/EINV_MSIC_LOCAL_FILE_INVALID/);
  await writeFile(path,JSON.stringify([...fixture(),{...fixture()[0],Description:'Conflicting description'}]));
  await assert.rejects(readLocalOfficialMsicC432(path),/EINV_MSIC_LOCAL_FILE_INVALID/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('R3.2.1 local file is safely prioritized over remote SDK, without payment or submission changes',()=>{
 const svc=source('../src/einvoice-msic-c432.js');
 assert.match(svc,/MSICSubCategoryCodes\.json/);
 assert.match(svc,/memo=await readLocalOfficialMsicC432\(\)/);
 assert.ok(svc.indexOf('memo=await readLocalOfficialMsicC432()')<svc.indexOf('if(loading)return loading;'));
 assert.ok(MYINVOIS_MSIC_LOCAL_FILE_C432.endsWith('MSICSubCategoryCodes.json'));
 assert.doesNotMatch(svc,/submissionEnabled:true/);
});

// R3.2.2: downloaded official JSON may include UTF-8 BOM on Windows.
import {decodeOfficialMsicJsonC432} from '../src/einvoice-msic-c432.js';
test('R3.2.2 accepts UTF-8 BOM while rejecting malformed JSON and preserving full catalogue validation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tpos-msic-bom-'));
 try{
  const path=join(dir,'MSICSubCategoryCodes.json');
  const officialStyle=JSON.stringify(fixture());
  await writeFile(path,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(officialStyle,'utf8')]));
  const loaded=await readLocalOfficialMsicC432(path);
  assert.equal(loaded.entries.length,501);
  assert.equal(loaded.source,'LOCAL_OFFICIAL_JSON');
  await writeFile(path,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('{invalid')]));
  await assert.rejects(readLocalOfficialMsicC432(path),/EINV_MSIC_LOCAL_FILE_INVALID/);
  assert.throws(()=>decodeOfficialMsicJsonC432(Buffer.from([0xff,0xfe,0x5b,0x00])),SyntaxError);
 }finally{await rm(dir,{recursive:true,force:true});}
});

// R3.2.3 — The real official MSIC JSON repeats code 16211 with identical values.
test('R3.2.3 collapses exact official duplicate without losing search identity',()=>{
 const rows=fixture();
 const first={Code:'16211',Description:'Manufacture of veneer sheets and plywood','MSIC Category Reference':'C'};
 const entries=validateMsicCatalogueC432([...rows,first,{...first}]);
 assert.equal(entries.length,rows.length+1);
 assert.equal(entries.filter(x=>x.code==='16211').length,1);
 assert.equal(entries.find(x=>x.code==='16211').description,first.Description);
});
test('R3.2.3 rejects same code with conflicting description or category, and malformed duplicate',()=>{
 const first={Code:'16211',Description:'Manufacture of veneer sheets and plywood','MSIC Category Reference':'C'};
 const base=[...fixture(),first];
 for(const changed of [
  {...first,Description:'Other activity'},
  {...first,'MSIC Category Reference':'D'},
  {...first,Description:'Manufacture of veneer sheets and plywood '},
  {...first,Description:''}
 ]) assert.throws(()=>validateMsicCatalogueC432([...base,changed]),/EINV_MSIC_CATALOG_INVALID/);
});
test('R3.2.3 accepts an offline catalogue with exact duplicate while keeping conflicting file fail-closed',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tpos-msic-duplicate-'));
 try{
  const path=join(dir,'MSICSubCategoryCodes.json');
  const first={Code:'16211',Description:'Manufacture of veneer sheets and plywood','MSIC Category Reference':'C'};
  await writeFile(path,JSON.stringify([...fixture(),first,{...first}]));
  const result=await readLocalOfficialMsicC432(path);
  assert.equal(result.entries.length,502);
  assert.equal(result.source,'LOCAL_OFFICIAL_JSON');
  await writeFile(path,JSON.stringify([...fixture(),first,{...first,Description:'Different'}]));
  await assert.rejects(readLocalOfficialMsicC432(path),/EINV_MSIC_LOCAL_FILE_INVALID/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
