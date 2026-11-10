// Read-only, offline diagnostic for the operator-installed MyInvois MSIC JSON.
import {readFile,stat} from 'node:fs/promises';
import {MYINVOIS_MSIC_LOCAL_FILE_C432,decodeOfficialMsicJsonC432,validateMsicCatalogueC432} from '../src/einvoice-msic-c432.js';
const path=MYINVOIS_MSIC_LOCAL_FILE_C432;
const out={event:'einvoice_msic_local_diagnostic',path};
try {
 const file=await stat(path);
 out.bytes=file.size;
 const bytes=await readFile(path);
 out.encoding=bytes[0]===0xef&&bytes[1]===0xbb&&bytes[2]===0xbf?'UTF8_BOM':bytes[0]===0xff&&bytes[1]===0xfe?'UTF16_LE_BOM':bytes[0]===0xfe&&bytes[1]===0xff?'UTF16_BE_BOM':'UTF8_OR_UNKNOWN';
 let records;
 try{records=decodeOfficialMsicJsonC432(bytes);out.jsonParsed=true;}
 catch{out.jsonParsed=false;out.status='INVALID_JSON_OR_ENCODING';process.exitCode=1;}
 if(records){
  out.count=Array.isArray(records)?records.length:null;
  try{const entries=validateMsicCatalogueC432(records);out.status='VALID';out.uniqueCodes=entries.length;out.identicalDuplicates=records.length-entries.length;}
  catch {
   out.status='INVALID_RECORDS';
   if(Array.isArray(records)){
    const seen=new Map();
    for(let i=0;i<records.length;i++){
     const r=records[i];const code=r?.Code,desc=r?.Description,cat=r?.['MSIC Category Reference'];
     const reasons=[];
     if(!r||typeof r!=='object'||Array.isArray(r))reasons.push('RECORD_NOT_OBJECT');
     if(typeof code!=='string'||!/^\d{5}$/.test(code))reasons.push('CODE_FORMAT');
     if(typeof desc!=='string'||!desc.trim()||desc.length>350)reasons.push('DESCRIPTION_FORMAT_OR_LENGTH');
     if(typeof cat!=='string'||cat.length>16)reasons.push('CATEGORY_FORMAT_OR_LENGTH');
     if(seen.has(code)){
      const prior=seen.get(code);
      if(prior.description!==desc||prior.category!==cat)reasons.push('CONFLICTING_DUPLICATE_CODE');
     }else seen.set(code,{description:desc,category:cat});
     if(reasons.length){out.firstInvalid={index:i,code:typeof code==='string'?code:null,reasons};break;}
    }
   }
   process.exitCode=1;
  }
 }
} catch(e){out.status=e?.code==='ENOENT'?'FILE_NOT_FOUND':'FILE_UNREADABLE';process.exitCode=1;}
console.log(JSON.stringify(out,null,2));
