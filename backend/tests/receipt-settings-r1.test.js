import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
test('R1 043 tenant schema adds independent settings, audit and immutable sale footer without mutating existing sales',()=>{
 const sql=read('database/043_tenant_receipt_settings.sql');
 for(const table of ['receipt_settings','receipt_settings_audit_logs','pos_sale_receipt_footers'])assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
 assert.match(sql,/FOREIGN KEY\(sale_id\) REFERENCES pos_sales\(id\)/);
 assert.doesNotMatch(sql,/\b(?:ALTER|DROP|TRUNCATE|DELETE)\s+(?:TABLE|FROM|pos_sales)/i);
 assert.match(sql,/receipt_settings_r1_043/);
});
test('R1 default remains legacy Thank you and new sales snapshot settings atomically for cash and noncash',()=>{
 const cash=read('backend/src/pos-cash-checkout.js'),noncash=read('backend/src/pos-multi-payment.js');
 const api=read('backend/src/receipt-settings.js');
 assert.match(api,/DEFAULT_RECEIPT_FOOTER='Thank you\.'/);
 assert.match(api,/INSERT INTO pos_sale_receipt_footers\(sale_id,footer_message\) SELECT \?,footer_message FROM receipt_settings/);
 assert.match(api,/saved\.affectedRows!==1/);
 assert.match(cash,/await captureReceiptFooter\(conn,saleId\)/);
 assert.match(noncash,/await captureReceiptFooter\(conn,saleId\)/);
 assert.match(cash,/SELECT footer_message FROM pos_sale_receipt_footers WHERE sale_id=\?/);
 assert.match(cash,/footerMessage:footer\?\.footer_message\?\?DEFAULT_RECEIPT_FOOTER/);
 assert.match(read('frontend/src/PosCashReceipt.jsx'),/r\.footerMessage\?\?'Thank you\.'/);
});
test('R1 read-only header comes from Company Profile, including Address 3',()=>{
 const api=read('backend/src/receipt-settings.js'),ui=read('frontend/src/ReceiptSettings.jsx'),receipt=read('backend/src/pos-cash-checkout.js');
 for(const key of ['businessName','addressLine1','addressLine2','addressLine3','postcode','city','state','country'])assert.ok(ui.includes(key));
 assert.match(ui,/disabled readOnly/);
 assert.match(api,/FROM company_profiles p LEFT JOIN company_registrations r ON r.id=p.id WHERE p.id=1/);
 assert.match(receipt,/company\.address_line3/);
});
test('R1 Owner Admin plus permission controls edits; footer validated server-side and audited transactionally',()=>{
 const api=read('backend/src/receipt-settings.js');
 assert.match(api,/\['OWNER','ADMIN'\]/);
 assert.match(api,/permissions\.includes\('receipt_settings.manage'\)/);
 assert.match(api,/z\.string\(\)\.trim\(\)\.min\(1\)\.max\(500\)/);
 assert.match(api,/beginTransaction/);
 assert.match(api,/FOR UPDATE/);
 assert.match(api,/receipt_settings_audit_logs/);
 assert.match(api,/rollback/);
});
test('R1 toolbar matches approved Refresh helper and icon-only Activity Log; compact Save',()=>{
 const ui=read('frontend/src/ReceiptSettings.jsx'),css=read('frontend/src/ReceiptSettings.css');
 assert.match(ui,/refreshPage\(load,notify\)/);
 assert.match(ui,/className="outline action-icon" title="Refresh" aria-label="Refresh"/);
 assert.match(ui,/className="outline action-icon" title="Activity Log" aria-label="Activity Log"/);
 assert.match(ui,/busy\?'Saving\.\.\.':'Save'/);
 assert.match(css,/button\.primary\{[^}]*width:max-content/);
});
test('R1 API permission gates and registration in settings; separate existing company page is untouched',()=>{
 const app=read('backend/src/app.js'),ui=read('frontend/src/App.jsx');
 for(const [method,code] of [['get','view'],['put','manage']])assert.match(app,new RegExp("app\\."+method+"\\('/api/v2/receipt-settings',authenticate,permitted\\('receipt_settings\\."+code+"'\\)"));
 assert.match(app,/permitted\('receipt_settings.audit'\)/);
 assert.match(ui,/id:'receipt-settings',label:'Receipt Settings'/);
 assert.match(ui,/page==='receipt-settings'&&canViewReceiptSettings/);
 assert.match(read('backend/src/tenants.js'),/executeSchema\(dbName,'043_tenant_receipt_settings.sql'\)/);
});
test('R1 no eInvoice QR or modification to existing Customer Display sources',()=>{
 const ui=read('frontend/src/ReceiptSettings.jsx');
 assert.doesNotMatch(ui,/<QRCode|customer-display\.html|eInvoiceSubmit\(/);
 assert.match(ui,/future e-Invoice ON\/OFF setting/);
});

test('R1.1 legal SSM and Old SSM render directly under Business Name in preview and POS receipt',()=>{
 const api=read('backend/src/receipt-settings.js');
 const ui=read('frontend/src/ReceiptSettings.jsx');
 const pos=read('frontend/src/PosCashReceipt.jsx');
 assert.match(api,/ssm_registration_number AS ssmNumber/);
 assert.match(api,/ssm_old_registration_number AS ssmOldNumber/);
 assert.match(api,/LEFT JOIN company_registrations r ON r.id=p.id/);
 for(const key of ['ssmNumber','ssmOldNumber'])assert.match(ui,new RegExp(key));
 assert.match(ui,/receipt-settings-business[^\n]*\{company\.businessName\}<\/strong>\{ssmLine/);
 assert.match(ui,/\$\{company\.ssmNumber\}\$\{company\.ssmOldNumber\?/);
 assert.match(pos,/<h3>\{r\.registeredName\|\|r\.companyName\}<\/h3>/);
 assert.ok(pos.includes('${r.ssmOldNumber}')); 
 assert.doesNotMatch(pos,/<p>SSM: /);
});
