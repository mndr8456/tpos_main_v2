import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestedProductMappingC42B,makeCheckoutVerifiedMappingEvidenceC42B} from '../src/einvoice-verified-mapping-c42b.js';
const source=(name)=>readFileSync(new URL('../../'+name,import.meta.url),'utf8');
test('Product Master LHDN values are suggested without Owner confirmation',()=>{
 const p={id:55,sku:'PRD-55',product_name:'Sample',product_type:'GOODS',base_unit_code:'PCS',jkdm_tax_type:'NONE',lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'06'};
 const suggestion=suggestedProductMappingC42B(p);
 assert.deepEqual(suggestion,{suggestedClassificationCode:'022',suggestedUnitCode:'EA',suggestedTaxTypeCode:'06',expectedTaxTypeCode:'06',taxTypeMismatch:false,productMasterSuggestedOnly:true});
 const ev=makeCheckoutVerifiedMappingEvidenceC42B({sale:{id:90,branch_id:1},evidence:{lines:[{sale_line_id:'1',product_id:'55',effective_jkdm_tax_type:'NONE'}]},products:[p],mappings:[]});
 assert.equal(ev.status,'INCOMPLETE');assert.equal(ev.lines[0].mapping_confirmed,false);
});
test('Invalid Product Master codes are not suggested as selectable verified mapping',()=>{
 const s=suggestedProductMappingC42B({lhdn_classification_code:'999',lhdn_unit_code:'PCS',lhdn_tax_type_code:'E',jkdm_tax_type:'SALES_TAX'});
 assert.equal(s.suggestedClassificationCode,null);assert.equal(s.suggestedUnitCode,null);assert.equal(s.suggestedTaxTypeCode,null);assert.equal(s.expectedTaxTypeCode,'01');assert.equal(s.taxTypeMismatch,true);
});
test('Product Master tax mismatch is visible but JKDM expected code is authoritative',()=>{
 const s=suggestedProductMappingC42B({lhdn_classification_code:'022',lhdn_unit_code:'EA',lhdn_tax_type_code:'06',jkdm_tax_type:'SERVICE_TAX'});
 assert.equal(s.suggestedTaxTypeCode,'06');assert.equal(s.expectedTaxTypeCode,'02');assert.equal(s.taxTypeMismatch,true);
});
test('API returns Product suggestion and stored Owner mapping independently; UI never auto confirms',()=>{
 const backend=source('backend/src/einvoice-verified-mapping-c42b.js');
 const ui=source('frontend/src/EinvoiceProductMappingC42B.jsx');
 assert.match(backend,/p\.lhdn_classification_code,p\.lhdn_unit_code,p\.lhdn_tax_type_code/);
 assert.match(backend,/\.\.\.suggestedProductMappingC42B\(p\)/);
 assert.match(ui,/Suggested from Product Master only/);
 assert.match(ui,/not Owner Verified/);
 assert.match(ui,/await request\('\/einvoice\/product-mappings\/'\+item.id/);
 assert.match(ui,/useEffect\(\(\)=>\{void load\('',1,'all',25\);\},\[\]\)/);
});
