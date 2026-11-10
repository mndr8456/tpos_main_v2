// C4.3 R4.4: strict SDK-shaped JSON -> unsigned UBL 2.1 XML preview.
// No inferred fields or signature. Input must have passed R4.3 first.
const NS=Object.freeze({
 _D:'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
 _A:'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
 _B:'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2'
});
const permittedAttr=/^[A-Za-z_][A-Za-z0-9_.-]*$/;
const invalidXmlChars=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/;
function scalar(x){
 if(typeof x==='string')return x;
 if(typeof x==='boolean')return x?'true':'false';
 if(typeof x==='number'&&Number.isFinite(x)&&!/[eE]/.test(String(x)))return String(x);
 throw new Error('XML_SCALAR_INVALID');
}
function esc(v){const s=scalar(v);if(invalidXmlChars.test(s))throw new Error('XML_CHARACTER_INVALID');return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
function object(o){return o&&typeof o==='object'&&!Array.isArray(o);}
function render(name,val,depth){
 if(depth>40||!object(val)||!permittedAttr.test(name))throw new Error('XML_SHAPE_INVALID');
 if(name==='UBLExtensions'||name==='Signature'||name==='DigitalSignatureAttachment')throw new Error('XML_SIGNATURE_NOT_ALLOWED');
 const hasText=Object.hasOwn(val,'_');
 const props=Object.entries(val).filter(([k])=>k!=='_');
 const isAgg=!hasText;
 const tag=`${isAgg?'cac':'cbc'}:${name}`;
 let attrs='',inner='';
 for(const [k,v] of props){
  if(Array.isArray(v)){
   if(hasText)throw new Error('XML_BASIC_COMPONENT_CHILD');
   if(v.length<1||v.length>5000)throw new Error('XML_CHILD_CARDINALITY');
   for(const c of v)inner+=render(k,c,depth+1);
  }else{
   if(!hasText||!permittedAttr.test(k)||/^xmlns|^xml|^xsi/i.test(k))throw new Error('XML_ATTRIBUTE_INVALID');
   attrs+=` ${k}="${esc(v)}"`;
  }
 }
 if(hasText)inner=esc(val._);
 return `<${tag}${attrs}>${inner}</${tag}>`;
}
export function serializeUnsignedUblInvoiceC43R44(doc){
 if(!object(doc)||Object.keys(doc).join('|')!=='_D|_A|_B|Invoice'||
  Object.entries(NS).some(([k,v])=>doc[k]!==v)||!Array.isArray(doc.Invoice)||doc.Invoice.length!==1||!object(doc.Invoice[0]))throw new Error('XML_SDK_ROOT_INVALID');
 const inv=doc.Invoice[0];let body='';
 for(const [name,arr] of Object.entries(inv)){
  if(!Array.isArray(arr)||arr.length<1||arr.length>5000)throw new Error('XML_INVOICE_FIELD_INVALID');
  for(const entry of arr)body+=render(name,entry,0);
 }
 const xml=`<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="${NS._D}" xmlns:cac="${NS._A}" xmlns:cbc="${NS._B}">${body}</Invoice>`;
 if(Buffer.byteLength(xml,'utf8')>3_000_000)throw new Error('XML_SIZE_LIMIT');
 return xml;
}
