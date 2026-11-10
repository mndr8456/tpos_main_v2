// C4.3 R4.4 real LOCAL XML/XSD execution when the operator has installed
// the official OASIS 2.1 schema tree and Python lxml. Never sends to LHDN.
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {serializeUnsignedUblInvoiceC43R44} from './einvoice-ubl-xsd-c43-r44-xml.js';
import {getNormativeCompatibilityC43R43} from './einvoice-ubl-normative-audit-c43-r43.js';
const back=resolve(fileURLToPath(new URL('..',import.meta.url)));
const xsd=resolve(back,'data/ubl-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd');
const pyScript=resolve(back,'scripts/validate-ubl-xsd-c43-r44.py');
const fail=(status,issues=[])=>({status,xsdExecuted:false,xsdValid:false,issues});
const venvPython=resolve(back,process.platform==='win32'?'.venv-ubl/Scripts/python.exe':'.venv-ubl/bin/python');
const defaultPython=existsSync(venvPython)?venvPython:process.platform==='win32'?'py':'python3';
const defaultArgs=existsSync(venvPython)?[]:process.platform==='win32'?['-3']:[];
// Deliberately fixed local path, not client-controlled or environment-switched.
export function executeLocalXsdC43R44(xml, {command=defaultPython,args=defaultArgs}={}){
 return new Promise(resolvePromise=>{
  let settled=false;const finish=v=>{if(!settled){settled=true;resolvePromise(v);}};
  let stdout='',stderr='';let child;
  try{
   child=spawn(command,[...args,'-I',pyScript,xsd],{cwd:back,windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONNOUSERSITE:'1'}});
  }catch{return finish(fail('XSD_ENGINE_NOT_AVAILABLE'));}
  const timer=setTimeout(()=>{child.kill();finish(fail('XSD_ENGINE_TIMEOUT'));},12000);
  child.stdout.on('data',b=>{stdout+=b.toString('utf8');if(stdout.length>500_000)child.kill();});
  child.stderr.on('data',b=>{stderr+=b.toString('utf8');if(stderr.length>2000)child.kill();});
  child.on('error',()=>{clearTimeout(timer);finish(fail('XSD_ENGINE_NOT_AVAILABLE'));});
  child.on('close',code=>{
   clearTimeout(timer);
   try{
    if(code!==0||stdout.length>500_000)throw Error('PROCESS_FAILED');
    const v=JSON.parse(stdout.trim());
    if(!v||typeof v.status!=='string'||typeof v.xsdExecuted!=='boolean'||typeof v.xsdValid!=='boolean'||!Array.isArray(v.issues))throw Error('INVALID_RESULT');
    finish({status:v.status,xsdExecuted:v.xsdExecuted,xsdValid:v.xsdValid,issues:v.issues.slice(0,20)});
   }catch{finish(fail('XSD_ENGINE_FAILED'));}
  });
  child.stdin.on('error',()=>{});
  child.stdin.end(xml,'utf8');
 });
}
export function evaluateXsdOutputC43R44(source,run){
 const ready=source?.status==='NORMATIVE_COMPATIBILITY_CHECKS_PASSED_UNSIGNED'&&source.normativeCompatibilityChecksPassed===true&&source.sdkDocument;
 const trusted=!!ready&&run?.status==='LOCAL_XSD_VALID'&&run.xsdExecuted===true&&run.xsdValid===true&&Array.isArray(run.issues)&&run.issues.length===0;
 return {version:'C4.3-R4.4',saleId:source?.saleId??null,
  status:!ready?'R43_COMPATIBILITY_REQUIRED':run?.status??'XSD_NOT_EXECUTED',
  issues:!ready?[{code:'R43_COMPATIBILITY_REQUIRED'}]:run?.issues??[],
  xmlGenerated:!!ready,xmlPreviewAvailable:false, // Avoid PII in audit response by default.
  normativeXsdExecuted:!!ready&&run?.xsdExecuted===true,
  normativeUblSchemaValidated:trusted,
  localXsdValidated:trusted,officialSchemaValidated:false,
  signaturePresent:false,submissionReady:false,submissionEnabled:false,
  validationScope:'Local OASIS UBL 2.1 XML/XSD structural validation only. NOT MyInvois validation or signature verification.',
  lineCount:ready?source.sdkDocument.Invoice[0].InvoiceLine?.length??null:null,
  payable:ready?source.sdkDocument.Invoice[0].LegalMonetaryTotal?.[0]?.PayableAmount?.[0]?._??null:null};
}
export async function getLocalUblXsdValidationC43R44(req,res){
 let source;const capture={set(){return this;},json(v){source=v;return this;}};
 await getNormativeCompatibilityC43R43(req,capture);
 const ready=source?.status==='NORMATIVE_COMPATIBILITY_CHECKS_PASSED_UNSIGNED'&&source.normativeCompatibilityChecksPassed===true&&source.sdkDocument;
 let result;
 if(!ready)result=evaluateXsdOutputC43R44(source,null);
 else{
  try{const xml=serializeUnsignedUblInvoiceC43R44(source.sdkDocument);result=evaluateXsdOutputC43R44(source,await executeLocalXsdC43R44(xml));}
  catch{result=evaluateXsdOutputC43R44(source,fail('XML_SERIALIZATION_FAILED',[{code:'XML_SERIALIZATION_FAILED'}]));}
 }
 return res.set({'Cache-Control':'no-store','Pragma':'no-cache'}).json(result);
}
