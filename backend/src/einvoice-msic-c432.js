// C4.3 R3.2. Official MyInvois SDK MSIC JSON; fixed source URL, validated payload,
// persistent local cache. No external request is made on invoice creation/submission.
import {readFile,writeFile,mkdir,rename,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

export const MYINVOIS_MSIC_URL_C432='https://sdk.myinvois.hasil.gov.my/files/MSICSubCategoryCodes.json';
const dataDir=join(dirname(fileURLToPath(import.meta.url)),'..','data');
const cachePath=join(dataDir,'myinvois-msic-cache.json');
// R3.2.1: Explicit operator-supplied OFFICIAL SDK JSON. Never bundle fabricated fixtures.
export const MYINVOIS_MSIC_LOCAL_FILE_C432=join(dataDir,'MSICSubCategoryCodes.json');
const MAX_BYTES=1024*1024; // catalogue size guard
const REFRESH_MS=24*60*60*1000;
let memo=null,loading=null;
const msicError=(code,httpStatus=503)=>Object.assign(new Error(code),{status:httpStatus});

export function decodeOfficialMsicJsonC432(bytes){
 // Official JSON is UTF-8; accept its optional UTF-8 BOM without relaxing JSON validation.
 const buffer=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
 const offset=buffer.length>=3&&buffer[0]===0xef&&buffer[1]===0xbb&&buffer[2]===0xbf?3:0;
 return JSON.parse(buffer.subarray(offset).toString('utf8'));
}
export function validateMsicCatalogueC432(raw){
 if(!Array.isArray(raw)||raw.length<500||raw.length>6000)throw msicError('EINV_MSIC_CATALOG_INVALID');
 const seen=new Map();const entries=[];
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item))throw msicError('EINV_MSIC_CATALOG_INVALID');
  const code=item.Code,description=item.Description,category=item['MSIC Category Reference'];
  if(typeof code!=='string'||!/^\d{5}$/.test(code)||typeof description!=='string'||!description.trim()||description.length>350||typeof category!=='string'||category.length>16)throw msicError('EINV_MSIC_CATALOG_INVALID');
  const existing=seen.get(code);
  if(existing){
   // The official SDK JSON contains repeated 16211 rows with identical values.
   // Collapse only exact copies; a conflicting definition for the same code fails closed.
   if(existing.rawDescription!==description||existing.category!==category)throw msicError('EINV_MSIC_CATALOG_INVALID');
   continue;
  }
  seen.set(code,{rawDescription:description,category});
  entries.push(Object.freeze({code,description:description.trim(),category}));
 }
 return Object.freeze(entries);
}
export async function readLocalOfficialMsicC432(filePath=MYINVOIS_MSIC_LOCAL_FILE_C432){
 let info;
 try{info=await stat(filePath);}catch(e){if(e?.code==='ENOENT')return null;throw msicError('EINV_MSIC_LOCAL_FILE_UNREADABLE');}
 if(!info.isFile()||info.size<1024||info.size>MAX_BYTES)throw msicError('EINV_MSIC_LOCAL_FILE_INVALID');
 let records;
 try{records=decodeOfficialMsicJsonC432(await readFile(filePath));}
 catch{throw msicError('EINV_MSIC_LOCAL_FILE_INVALID');}
 let entries;
 try{entries=validateMsicCatalogueC432(records);}
 catch{throw msicError('EINV_MSIC_LOCAL_FILE_INVALID');}
 // mtime is used only for local reloads. It is not a claim of SDK publication date.
 return {fetchedAt:info.mtimeMs,entries,source:'LOCAL_OFFICIAL_JSON',localFileMtime:info.mtimeMs};
}
async function fromDisk(){
 try{
  const stored=JSON.parse(await readFile(cachePath,'utf8'));
  if(!Number.isFinite(stored.fetchedAt)||stored.fetchedAt<0)throw new Error('invalid date');
  return {fetchedAt:stored.fetchedAt,entries:validateMsicCatalogueC432(stored.records),source:'CACHE'};
 }catch{return null;}
}
async function fetchOfficial(){
 const response=await fetch(MYINVOIS_MSIC_URL_C432,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'},redirect:'error'});
 if(!response.ok)throw msicError('EINV_MSIC_SDK_UNAVAILABLE');
 const length=Number(response.headers.get('content-length'));
 if(length>MAX_BYTES)throw msicError('EINV_MSIC_CATALOG_TOO_LARGE');
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length>MAX_BYTES)throw msicError('EINV_MSIC_CATALOG_TOO_LARGE');
 const records=decodeOfficialMsicJsonC432(bytes);
 const entries=validateMsicCatalogueC432(records);
 const fetchedAt=Date.now();
 await mkdir(dirname(cachePath),{recursive:true});
 const tmp=cachePath+'.'+randomUUID()+'.tmp';
 try{await writeFile(tmp,JSON.stringify({fetchedAt,records}),{mode:0o600,flag:'wx'});await rename(tmp,cachePath);}catch(e){
  // A successful download can still be used in memory if local cache is unwritable.
  try{const {unlink}=await import('node:fs/promises');await unlink(tmp);}catch{}
 }
 return {fetchedAt,entries,source:'OFFICIAL_SDK'};
}
export async function getMsicCatalogueC432(){
 // Prefer a manually downloaded, operator-controlled official JSON without contacting the SDK.
 // Check mtime on each request so placing/replacing the file works without restarting.
 let localInfo;
 try{localInfo=await stat(MYINVOIS_MSIC_LOCAL_FILE_C432);}catch(e){if(e?.code!=='ENOENT')throw msicError('EINV_MSIC_LOCAL_FILE_UNREADABLE');}
 if(localInfo){
  if(memo?.source==='LOCAL_OFFICIAL_JSON'&&memo.localFileMtime===localInfo.mtimeMs)return memo;
  memo=await readLocalOfficialMsicC432();
  return memo;
 }
 if(memo?.source==='LOCAL_OFFICIAL_JSON')memo=null;
 if(memo&&Date.now()-memo.fetchedAt<REFRESH_MS)return memo;
 if(loading)return loading;
 loading=(async()=>{
  if(!memo)memo=await fromDisk();
  if(memo&&Date.now()-memo.fetchedAt<REFRESH_MS)return memo;
  try{memo=await fetchOfficial();return memo;}
  catch{
   // A previously verified cache remains usable during transient upstream outage.
   if(memo)return {...memo,source:'STALE_VERIFIED_CACHE'};
   throw msicError('EINV_MSIC_CATALOG_UNAVAILABLE');
  }
 })();
 try{return await loading;}finally{loading=null;}
}
export async function findMsicCodeC432(code){
 const catalog=await getMsicCatalogueC432();
 return catalog.entries.find(entry=>entry.code===code)||null;
}
export async function listMsicCodesC432(_req,res){
 const catalog=await getMsicCatalogueC432();
 res.set('Cache-Control','private, max-age=300').json({version:'C4.3-R3.2',sourceUrl:MYINVOIS_MSIC_URL_C432,
  source:catalog.source,fetchedAt:new Date(catalog.fetchedAt).toISOString(),count:catalog.entries.length,
  codes:catalog.entries,submissionEnabled:false});
}
