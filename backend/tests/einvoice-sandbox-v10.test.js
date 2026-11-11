import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeSandboxInvoiceV10} from '../src/einvoice-sandbox-v10.js';
const candidate=()=>({status:'UNSIGNED_STRUCTURAL_PREVIEW',structuralChecksPassed:true,signaturePresent:false,receiptNumber:'INV-001',document:{_DRAFT_ONLY:true,Invoice:[{cbc_ID:[{_:'INV-001'}],cbc_InvoiceTypeCode:[{_:'01',listVersionID:'1.1'}],cac_InvoiceLine:[{cbc_ID:[{_:'1'}]}]}]}});
test('v1.0 format uses MyInvois namespaces, no draft sentinel, no signature',()=>{
 const p=makeSandboxInvoiceV10(candidate());
 assert.equal(p.version,'1.0');assert.equal(p.document.Invoice[0].InvoiceTypeCode[0].listVersionID,'1.0');
 assert.ok(p.document._D&&p.document._A&&p.document._B);
 assert.equal(p.document._DRAFT_ONLY,undefined);
 assert.equal(p.document.Invoice[0].InvoiceLine[0].ID[0]._, '1');
 const raw=Buffer.from(p.submission.documents[0].document,'base64');
 assert.equal(createHash('sha256').update(raw).digest('hex'),p.documentHash);
 assert.equal(JSON.parse(raw).Invoice[0].Signature,undefined);
});
test('rejects missing, nonreconciled and signed source candidates',()=>{
 for(const c of [null,{}, {...candidate(),status:'SOURCE_DATA_INCOMPLETE'}, {...candidate(),signaturePresent:true}, {...candidate(),document:{_DRAFT_ONLY:false,Invoice:[]}}])assert.throws(()=>makeSandboxInvoiceV10(c));
});
test('rejects source version and code mismatch',()=>{
 let c=candidate();c.document.Invoice[0].cbc_InvoiceTypeCode[0].listVersionID='1.0';assert.throws(()=>makeSandboxInvoiceV10(c));
 c=candidate();c.receiptNumber='INV-002';assert.throws(()=>makeSandboxInvoiceV10(c));
});
test('enforces max 300 KB document',()=>{
 const c=candidate();c.document.Invoice[0].cbc_Note=[{_: 'x'.repeat(310000)}];assert.throws(()=>makeSandboxInvoiceV10(c),/DOCUMENT_OVER_300KB/);
});
