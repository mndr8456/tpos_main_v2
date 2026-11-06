// Read-only installation check. Run from the backend folder of the ACTIVE V2 project.
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const files=['backend/src/pos-multi-payment.js','backend/src/pos-payment-evidence.js','backend/scripts/setup-pos-multi-payment.js','frontend/src/PosTerminal.jsx','frontend/src/PosMultiPayment.jsx','frontend/src/PosMultiPayment.css','frontend/src/PosCashReceipt.jsx','frontend/public/customer-display.js','frontend/public/customer-display.html'];
let failed=0;
for(const file of files){
 const path=resolve(base,file);const exists=existsSync(path);
 const connected=exists&&(!file.endsWith('PosTerminal.jsx')||readFileSync(path,'utf8').includes('PosMultiPayment'));
 if(!connected)failed++;
 console.log(JSON.stringify({event:'pos_multi_payment_file',file,status:!exists?'MISSING':!connected?'OLD_VERSION':'CURRENT'}));
}
console.log(JSON.stringify({event:'pos_multi_payment_file_check',projectRoot:base,total:files.length,failed}));
if(failed){console.error('Install the entire ZIP into the SAME project root printed above. Do not mix D:\\www\\tpos-main-V2 and D:\\www\\tpos_main_v2.');process.exitCode=1;}
