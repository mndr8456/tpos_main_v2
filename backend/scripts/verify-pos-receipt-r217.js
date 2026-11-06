// Read-only installation verification for POS Receipt R2.1.7.
import {readFileSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const required=[
 ['frontend/src/PosCashReceipt.jsx',[
  'const showSalesTax=r.salesTaxRate!=null||Number(r.salesTax)!==0;',
  'const showServiceTax=r.serviceTaxRate!=null||Number(r.serviceTax)!==0;',
  "taxLabel('Sales Tax',r.salesTaxRate)",
  "taxLabel('Service Tax',r.serviceTaxRate)",
  'rate not recorded'
 ]],
 ['backend/tests/foundation.test.js',[
  "'035_tenant_pos_multi_payment.sql'",
  "'036_tenant_pos_receipt_tax_rates.sql'",
  "'037_tenant_pos_receipt_number.sql'"
 ]],
 ['database/036_tenant_pos_receipt_tax_rates.sql',[]],
 ['database/037_tenant_pos_receipt_number.sql',[]]
];
let failed=0;
for(const [file,markers] of required){
 const path=join(root,file);
 const content=existsSync(path)?readFileSync(path,'utf8'):'';
 const missing=markers.filter(marker=>!content.includes(marker));
 const status=content&&missing.length===0?'CURRENT':'MISSING_OR_STALE';
 if(status!=='CURRENT')failed++;
 console.log(JSON.stringify({event:'pos_receipt_r217_file',file,status,missingMarkers:missing.length}));
}
console.log(JSON.stringify({event:'pos_receipt_r217_complete',projectRoot:root,files:required.length,failed}));
if(failed)process.exitCode=1;
