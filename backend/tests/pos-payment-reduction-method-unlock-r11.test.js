import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const ui=readFileSync(resolve(fileURLToPath(new URL('../..',import.meta.url)),'frontend/src/PosMultiPayment.jsx'),'utf8');
test('R1.2 voucher and discount permit configured manual methods without bypassing blocked payments',()=>{
 assert.match(ui,/const enabled=eligible\(code,configurations\.get\(code\)\);/);
 assert.doesNotMatch(ui,/eligible\(code,configurations\.get\(code\)\)\s*&&\s*\(!hasReduction/);
 assert.match(ui,/disabled=\{!enabled\|\|disabled\}/);
 assert.match(ui,/const disabled=Boolean\(busy\|\|working\|\|recovering\|\|stockIssues\.length/);
 assert.match(ui,/if\(\['DUITNOW_QR','EWALLET'\]\.includes\(m\)\)return Boolean\(config\.has_image\)/);
 assert.match(ui,/if\(m==='SARA_MYKASIH'\)return false/);
});
test('R1.2 pending transaction recovery, cancellation and amount guards are preserved',()=>{
 assert.match(ui,/\/payments\/resume/);
 assert.match(ui,/setRecovering\(true\)/);
 assert.match(ui,/Cannot verify pending payments:/);
 assert.match(ui,/if\(attempt\)\{setError\('Cancel the current pending payment/);
 assert.match(ui,/String\(attempt\.expectedTotal\)===total/);
 assert.match(ui,/Cancel Unpaid Attempt/);
 assert.match(ui,/\/payments\/\$\{attempt\.attemptId\}\/cancel/);
 assert.match(ui,/unpaidConfirmed:true/);
 assert.match(ui,/disabled=\{busy\|\|working\|\|Boolean\(attempt\)\}/);
 assert.match(ui,/setDiscountCode\?\.\(/);
 assert.match(ui,/setVoucherCode\?\.\(/);
});
test('R1.2 noncash START and COMPLETE retain server authoritative reduction evidence',()=>{
 assert.match(ui,/expectedTotal:total,discountCode:discountCode\.trim\(\),voucherCode:voucherCode\.trim\(\)/);
 assert.match(ui,/verifiedInMerchantAccount:true,evidence/);
 assert.match(ui,/reference\.trim\(\)\.length>=6/);
 assert.match(ui,/\/payments\/start/);
 assert.doesNotMatch(ui,/settlement is not yet connected to checkout/);
});
