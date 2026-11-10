// R4.2 application-profile JSON Schema checks. This is NOT the full OASIS normative schema.
// Evaluates only the explicit supported vocabulary; unsupported schema keywords fail closed.
import {readFileSync} from 'node:fs';
const schema=JSON.parse(readFileSync(new URL('../schemas/einvoice-c43-r42-profile.schema.json',import.meta.url),'utf8'));
const supported=new Set(['$schema','$id','title','description','type','properties','required','additionalProperties','items','minItems','maxItems','pattern','const','enum','anyOf','minLength','maxLength']);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function walk(data,s,path,issues,depth=0){
 if(issues.length>=80)return;
 if(depth>35){issues.push({path,code:'SCHEMA_DEPTH_LIMIT'});return;}
 if(!object(s)){issues.push({path,code:'INVALID_PROFILE_SCHEMA'});return;}
 for(const key of Object.keys(s))if(!supported.has(key)){issues.push({path,code:'UNSUPPORTED_SCHEMA_KEYWORD'});return;}
 const add=code=>{if(issues.length<80)issues.push({path,code});};
 if(s.anyOf){if(!Array.isArray(s.anyOf)||!s.anyOf.some(branch=>{const e=[];walk(data,branch,path,e,depth+1);return e.length===0;})){add('SCHEMA_ANY_OF');}return;}
 if(s.type){let valid=false;switch(s.type){case 'object':valid=object(data);break;case 'array':valid=Array.isArray(data);break;case 'string':valid=typeof data==='string';break;case 'number':valid=typeof data==='number'&&Number.isFinite(data);break;case 'boolean':valid=typeof data==='boolean';break;default:add('UNSUPPORTED_SCHEMA_TYPE');return;}if(!valid){add('SCHEMA_TYPE');return;}}
 if(Object.hasOwn(s,'const')&&data!==s.const)add('SCHEMA_CONST');
 if(s.enum&&(!Array.isArray(s.enum)||!s.enum.includes(data)))add('SCHEMA_ENUM');
 if(s.pattern&&(typeof data!=='string'||!new RegExp(s.pattern,'u').test(data)))add('SCHEMA_PATTERN');
 if(typeof data==='string'){if(s.minLength!==undefined&&[...data].length<s.minLength)add('SCHEMA_MIN_LENGTH');if(s.maxLength!==undefined&&[...data].length>s.maxLength)add('SCHEMA_MAX_LENGTH');}
 if(Array.isArray(data)){
  if(s.minItems!==undefined&&data.length<s.minItems)add('SCHEMA_MIN_ITEMS');
  if(s.maxItems!==undefined&&data.length>s.maxItems)add('SCHEMA_MAX_ITEMS');
  if(s.items)for(let i=0;i<Math.min(data.length,5000);i++)walk(data[i],s.items,`${path}[${i}]`,issues,depth+1);
 }
 if(object(data)){
  for(const name of s.required??[])if(!Object.hasOwn(data,name))issues.push({path:`${path}.${name}`,code:'SCHEMA_REQUIRED'});
  for(const [name,value] of Object.entries(data)){
   if(Object.hasOwn(s.properties??{},name))walk(value,s.properties[name],`${path}.${name}`,issues,depth+1);
   else if(s.additionalProperties===false)add('SCHEMA_ADDITIONAL_PROPERTY');
  }
 }
}
export function validateUblProfileJsonSchemaC43R42(document){
 const issues=[];
 try { if(JSON.stringify(document).length>4_000_000)return [{path:'$',code:'DOCUMENT_TOO_LARGE'}];walk(document,schema,'$',issues); }
 catch {return [{path:'$',code:'PROFILE_SCHEMA_EVALUATION_ERROR'}];}
 return issues.slice(0,80);
}
export const C43_R42_SCHEMA_SCOPE='TPOS machine-readable bounded UBL 2.1 Invoice v1.1 JSON profile; NOT complete OASIS schema or MyInvois server validation';
export const C43_R42_SUBMISSION_ENABLED=false;
