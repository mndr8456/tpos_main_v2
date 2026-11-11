/**
 * TPOS Main V2 — Sandbox v1.0 R1.1 route recovery.
 * Reads the operator's pre-R1 app.js from a backup or Git history.
 * Does NOT create missing legacy handlers or touch SQL/data.
 * Usage (from backend):
 *   node scripts/recover-einvoice-routes-r11.js
 *   node scripts/recover-einvoice-routes-r11.js --apply
 *   node scripts/recover-einvoice-routes-r11.js --source="C:\\path\\to\\prior\\app.js" --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const root = path.resolve(backend, '..');
const target = path.join(backend, 'src', 'app.js');
const flagApply = process.argv.includes('--apply');
const sourceArg = process.argv.find(a => a.startsWith('--source='))?.slice('--source='.length);
const original = fs.readFileSync(target, 'utf8');
const legacyChecks = [
  'ubl-sdk-profile/:saleId',
  'ubl-schema-profile/:saleId',
  'ubl-normative-compatibility/:saleId',
  'ubl-xsd-validation/:saleId',
  'sdk-business-audit/:saleId',
  'sandboxSubmitC43R46',
  "permitted('einvoice_documents.submit'),sandboxSubmitC43R46"
];
const sandboxImport = "import {previewSandboxInvoiceV10,getSandboxInvoiceV10,submitSandboxInvoiceV10,refreshSandboxInvoiceV10} from './einvoice-sandbox-v10.js';";
const sandboxRoutes = [
 " app.get('/api/v2/einvoice/sandbox-v10/preview/:saleId',authenticate,permitted('einvoice_documents.prepare'),previewSandboxInvoiceV10);",
 " app.get('/api/v2/einvoice/sandbox-v10/status/:saleId',authenticate,permitted('einvoice_documents.view'),getSandboxInvoiceV10);",
 " app.post('/api/v2/einvoice/sandbox-v10/submit/:saleId',authenticate,permitted('einvoice_documents.submit'),submitSandboxInvoiceV10);",
 " app.post('/api/v2/einvoice/sandbox-v10/refresh/:saleId',authenticate,permitted('einvoice_documents.view'),refreshSandboxInvoiceV10);"
];
function complete(s) { return legacyChecks.every(x => s.includes(x)); }
function git(...args) { try {return execFileSync('git',args,{cwd:backend,encoding:'utf8',stdio:['ignore','pipe','ignore'],maxBuffer:1024*1024*10}).trim();}catch{return null;} }
const candidates=[];
if(sourceArg) candidates.push({name:'explicit --source',read:()=>fs.readFileSync(path.resolve(sourceArg),'utf8')});
for(const p of [
 path.join(backend,'src','app.js.bak'),path.join(backend,'src','app.js.backup'),
 path.join(backend,'src','app.js.r46'),path.join(backend,'src','app.js.pre-r1'),
 path.join(backend,'src','app.js.orig'),path.join(root,'app.js.backup')
]) if(fs.existsSync(p)) candidates.push({name:p,read:()=>fs.readFileSync(p,'utf8')});
const prefix=git('rev-parse','--show-prefix') ?? '';
const relative=path.posix.join(prefix.replaceAll('\\','/'),'src/app.js');
const revisions=(git('log','-n','80','--format=%H','--',relative)||'').split(/\s+/).filter(Boolean);
for(const hash of revisions)candidates.push({name:`git:${hash.slice(0,12)}`,read:()=>git('show',`${hash}:${relative}`)});
let selected=null;
for(const c of candidates){try{const s=c.read();if(s&&complete(s)){selected={...c,text:s};break;}}catch{}}
if(!selected){
 console.error(JSON.stringify({status:'BLOCKED_NO_VERIFIED_R46_SOURCE',currentLegacyRoutes:legacyChecks.filter(x=>original.includes(x)),checked:candidates.map(x=>x.name),message:'Restore the original pre-R1 backend/src/app.js containing all R4.1-R4.6 routes, then run with --source=<path>. Existing app.js and database are unchanged.'},null,2));
 process.exitCode=2;
}else{
 let next=selected.text;
 if(!next.includes(sandboxImport))next=sandboxImport+'\n'+next;
 const missing=sandboxRoutes.filter(line=>!next.includes(line.trim()));
 if(missing.length){
   const anchor=" app.get('/api/v2/einvoice/product-mappings'";
   const at=next.indexOf(anchor);
   if(at<0){console.error('BLOCKED_ROUTE_ANCHOR_MISSING: verified source has unexpected routing layout; no changes.');process.exitCode=3;}
   else next=next.slice(0,at)+missing.join('\n')+'\n'+next.slice(at);
 }
 if(!process.exitCode){
   const routeCount=sandboxRoutes.map(line=>next.split(line.trim()).length-1);
   const requiredImports=['previewSandboxInvoiceV10','getSandboxInvoiceV10','submitSandboxInvoiceV10','refreshSandboxInvoiceV10'];
   if(!complete(next)||routeCount.some(n=>n!==1)||requiredImports.some(x=>!next.includes(x))){console.error('BLOCKED_VERIFICATION_FAILED: No file changes.');process.exitCode=4;}
   else{
     console.log(JSON.stringify({status:flagApply?'READY_TO_APPLY':'PREVIEW_ONLY',recoverySource:selected.name,legacyRouteMarkers:legacyChecks.length,sandboxRoutes:routeCount.length,sourceBytes:Buffer.byteLength(next),willChange:next!==original},null,2));
     if(flagApply&&next!==original){
       // Timestamp backup, atomic replacement, and roll back on syntax failure.
       const backup=target+'.pre-r11-'+new Date().toISOString().replace(/[:.]/g,'-')+'.bak';
       const temp=target+'.r11.tmp.mjs';
       fs.copyFileSync(target,backup);
       try{
         fs.writeFileSync(temp,next,{flag:'wx'});
         execFileSync(process.execPath,['--check',temp],{stdio:'pipe'});
         fs.renameSync(temp,target);
         console.log(JSON.stringify({status:'APPLIED',backup,notice:'Run npm run check and npm test. Do not mark PASS until all tests pass.'}));
       }catch(err){try{fs.unlinkSync(temp)}catch{} console.error('BLOCKED_SYNTAX_OR_WRITE_ERROR',err.message);process.exitCode=5;}
     }
   }
 }
}
