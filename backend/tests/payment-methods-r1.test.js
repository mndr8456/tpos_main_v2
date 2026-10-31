import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDecipheriv} from 'node:crypto';
import {checkPaymentImage,encryptPaymentCredential,publicPaymentState} from '../src/payment-method-security.js';
const read=p=>readFile(new URL(`../../${p}`,import.meta.url),'utf8');
const throwsCode=(fn,code)=>assert.throws(fn,error=>error.message===code);

test('Payment R1 image accepts valid PNG in tenant DB and refuses fake image or oversize',()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex');
 assert.deepEqual(checkPaymentImage('image/png',png.toString('base64')),png);
 throwsCode(()=>checkPaymentImage('image/png',Buffer.from('not-an-image').toString('base64')),'IMAGE_SIGNATURE_MISMATCH');
 throwsCode(()=>checkPaymentImage('image/svg+xml',png.toString('base64')),'IMAGE_TYPE_UNSUPPORTED');
 throwsCode(()=>checkPaymentImage('image/png',Buffer.alloc(1048577,0).toString('base64')),'IMAGE_TOO_LARGE_OR_INVALID');
});
test('Payment R1 API secrets use random AES-256-GCM at rest, not sent back to browser',()=>{
 const key='9e'.repeat(32),value='private-bank-api-key-12345';
 const a=encryptPaymentCredential(value,key),b=encryptPaymentCredential(value,key);
 assert.notEqual(a,b);
 const [version,iv,tag,ciphertext]=a.split(':');assert.equal(version,'v1');
 const decipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'base64'));
 decipher.setAuthTag(Buffer.from(tag,'base64'));
 assert.equal(Buffer.concat([decipher.update(Buffer.from(ciphertext,'base64')),decipher.final()]).toString(),value);
 throwsCode(()=>encryptPaymentCredential(value,undefined),'PAYMENT_ENCRYPTION_KEY_NOT_CONFIGURED');
 const publicRow=publicPaymentState({id:'2',branch_id:'1',method_code:'EWALLET',is_active:1,api_key_configured:1,api_key_encrypted:a});
 assert.equal(JSON.stringify(publicRow).includes(value),false);
 assert.equal(JSON.stringify(publicRow).includes(a),false);
 assert.equal(publicRow.hasApiKey,true);
});
test('Payment R1 migration is isolated, additive, tenant scoped; SARA remains disabled',async()=>{
 const sql=await read('database/016_tenant_payment_methods.sql');
 for(const table of ['payment_method_settings','payment_method_images','payment_method_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(sql,/UNIQUE KEY uq_pm_branch_method\(branch_id,method_code\)/);
 assert.match(sql,/chk_pm_sara_disabled/);
 assert.match(sql,/MEDIUMBLOB/);
 assert.match(sql,/api_key_encrypted TEXT NULL/);
 assert.doesNotMatch(sql,/DROP\s+TABLE|TRUNCATE|DELETE FROM|\bpos_sales\b/i);
 const script=await read('backend/scripts/setup-payment-methods.js');
 assert.match(script,/if\(apply&&!current\)/);
 const tenant=await read('backend/src/tenants.js');
 assert.ok(tenant.indexOf('015_tenant_product_kpdn.sql')<tenant.indexOf('016_tenant_payment_methods.sql'));
});
test('Payment R1 secure routes are permissioned and separated from checkout',async()=>{
 const [app,api,security]=await Promise.all([read('backend/src/app.js'),read('backend/src/payment-methods.js'),read('backend/src/payment-method-security.js')]);
 assert.match(app,/permitted\('payment_methods.view'\),listPaymentMethods/);
 assert.match(app,/permitted\('payment_methods.manage'\),savePaymentMethod/);
 assert.match(app,/permitted\('payment_methods.audit'\),paymentMethodAudit/);
 assert.match(api,/canManage\(req\)/);
 assert.match(api,/SARA_PROVIDER_INTEGRATION_REQUIRED/);
 assert.match(api,/IMAGE_ONLY_DIGITAL_METHODS/);
 assert.match(api,/no-store/);
 assert.match(security,/aes-256-gcm/);
 assert.doesNotMatch(api,/JSON\.stringify\(.*api_key_encrypted/);
 assert.doesNotMatch(app,/payment-methods.*settlement|payment-methods.*checkout/);
});
test('Payment R1 frontend groups DuitNow and E-Wallet into one form with enable button, file upload and API',async()=>{
 const [ui,app,css]=await Promise.all([read('frontend/src/PaymentMethods.jsx'),read('frontend/src/App.jsx'),read('frontend/src/PaymentMethods.css')]);
 assert.match(ui,/DuitNow QR & E-Wallet/);
 assert.match(ui,/\['DUITNOW_QR','EWALLET'\]\.map/);
 assert.match(ui,/Choose File/);
 assert.match(ui,/providerApiUrl/);
 assert.match(ui,/Active|ACTIVE/);
 assert.match(ui,/type="password"/);
 assert.match(ui,/SARA \(MyKasih \/ MyKad\)/);
 assert.match(app,/page==='payment-methods'/);
 assert.match(app,/PaymentMethods profile=/);
 assert.match(css,/\.pm-digital-columns/);
});
