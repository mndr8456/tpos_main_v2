import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {paymentManualMode,safePaymentReference,requireManualAttestation,ALL_NONCASH_METHODS} from '../src/pos-payment-policy.js';
import {makePosNonCashJournal} from '../src/pos-noncash-ledger.js';
import {encryptPaymentEvidence,decryptPaymentEvidence} from '../src/pos-payment-evidence.js';
const base=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const file=p=>readFileSync(resolve(base,p),'utf8');
const bill={total:'23.15',subtotalBeforeTax:'23.15',salesTax:'0.00',serviceTax:'0.00',serviceCharge:'0.00',roundingAdjustmentSen:0};

test('R2.1: static QR manual method requires ACTIVE and stored merchant QR image',()=>{
 assert.equal(paymentManualMode('DUITNOW_QR',{is_active:1,has_image:1}),'MANUAL_BANK');
 assert.equal(paymentManualMode('EWALLET',{is_active:1,has_image:1}),'MANUAL_BANK');
 assert.equal(paymentManualMode('DUITNOW_QR',{is_active:1,has_image:0}),null);
 assert.equal(paymentManualMode('DUITNOW_QR',{is_active:0,has_image:1}),null);
 assert.equal(paymentManualMode('BANK_TRANSFER',{is_active:1}),'MANUAL_BANK');
});
test('R2.1: standalone external card terminal needs configured terminal; SARA never manual',()=>{
 for(const code of ['DEBIT_CARD','CREDIT_CARD']){
  assert.equal(paymentManualMode(code,{is_active:1,provider_terminal_ref:'TX123'}),'MANUAL_TERMINAL');
  assert.equal(paymentManualMode(code,{is_active:1,provider_terminal_ref:''}),null);
 }
 assert.ok(ALL_NONCASH_METHODS.includes('SARA_MYKASIH'));
 assert.equal(paymentManualMode('SARA_MYKASIH',{is_active:1,has_image:1,provider_terminal_ref:'fake'}),null);
});
test('R2.1: reference, exact amount, and staff attestation are mandatory',()=>{
 assert.equal(safePaymentReference(' abc-12345 '),'ABC-12345');
 for(const invalid of ['', '123', 'customer name', 'card 4111111111111111;123', '123*45'])assert.throws(()=>safePaymentReference(invalid));
 assert.throws(()=>requireManualAttestation({paymentReference:'VALID-12345',verifiedInMerchantAccount:false,verifiedAmount:'23.15',expectedTotal:'23.15'}));
 assert.throws(()=>requireManualAttestation({paymentReference:'VALID-12345',verifiedInMerchantAccount:true,verifiedAmount:'23.14',expectedTotal:'23.15'}));
 assert.equal(requireManualAttestation({paymentReference:'valid-12345',verifiedInMerchantAccount:true,verifiedAmount:'23.15',expectedTotal:'23.15'}),'VALID-12345');
});
test('R2.1: noncash journal balanced and never debits cash account',()=>{
 for(const method of ['DUITNOW_QR','EWALLET','BANK_TRANSFER','DEBIT_CARD','CREDIT_CARD']){
  const lines=makePosNonCashJournal(bill,'5.00',method);
  assert.equal(lines.filter(l=>l.accountCode==='1010').length,0);
  assert.equal(lines.reduce((n,l)=>n+Number(l.debit),0),lines.reduce((n,l)=>n+Number(l.credit),0));
  assert.equal(lines.filter(l=>l.debit==='23.15').length,1);
 }
 assert.throws(()=>makePosNonCashJournal(bill,'5.00','SARA_MYKASIH'));
});
test('R2.1: migration 035 is tenant-local, checks cash-vs-noncash amounts, and is never silently applied',()=>{
 const sql=file('database/035_tenant_pos_multi_payment.sql'),setup=file('backend/scripts/setup-pos-multi-payment.js');
 for(const x of ['pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens','payment_method','POS_NONCASH_SALE','pos.checkout.manual','reference_hash','evidence_data'])assert.ok(sql.includes(x),x);
 assert.match(sql,/payment_method<>'CASH' AND cash_received=0 AND cash_change=0/);
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/POS_035_VERIFY_INCOMPLETE/);
 assert.match(file('backend/src/tenants.js'),/executeSchema\(dbName,'035_tenant_pos_multi_payment.sql'\)/);
});
test('R2.1: all payment endpoints enforce authentication and the SARA route cannot post',()=>{
 const app=file('backend/src/app.js'),backend=file('backend/src/pos-multi-payment.js');
 for(const x of ['permitted(\'pos.checkout.manual\'),customerDisplayAfterPos(\'attempt\'),startNonCashPayment','permitted(\'pos.checkout.manual\'),customerDisplayAfterPos(\'sale\'),completeManualPayment','permitted(\'pos.view\'),manualPaymentImage','permitted(\'pos.audit\'),getPaymentEvidence'])assert.ok(app.includes(x),x);
 assert.match(backend,/if\(!isManualMethod\(input.methodCode\)\)throw err\('POS_OFFICIAL_PROVIDER_REQUIRED'/);
 assert.match(backend,/BEGIN|beginTransaction/);
 assert.match(backend,/FOR UPDATE/);
 assert.match(backend,/POS_PAYMENT_REFERENCE_ALREADY_USED/);
 assert.match(backend,/chk|checkPaymentImage/);
 assert.match(backend,/POS_NONCASH_SALE/);
 assert.doesNotMatch(backend,/cardNumber|pinBlock|cvv|mykadNumber|cardPan/i);
});
test('R2.1: Customer Display has a short-lived non-guessable token and contains no merchant API keys',()=>{
 const api=file('backend/src/pos-multi-payment.js'),display=file('frontend/public/customer-display.js');
 assert.match(api,/randomBytes\(32\)/);assert.match(api,/INTERVAL 15 MINUTE/);
 assert.match(api,/token_hash/);assert.match(api,/hash\(token\)/);
 assert.match(display,/location\.hash/);assert.match(display,/history\.replaceState/);
 assert.match(display,/customer-display\/view/);
 assert.match(display,/textContent/);
 assert.doesNotMatch(display,/innerHTML|localStorage|apiKey/);
});
test('R2.1: Cash is retained; QR, bank, card external and SARA have accurate UI states',()=>{
 const ui=file('frontend/src/PosMultiPayment.jsx'),main=file('frontend/src/PosTerminal.jsx'),receipt=file('frontend/src/PosCashReceipt.jsx');
 for(const x of ['DUITNOW_QR','EWALLET','BANK_TRANSFER','DEBIT_CARD','CREDIT_CARD','SARA_MYKASIH','Verified Transaction Reference','Customer Transaction Evidence','Show on Customer Display','verifiedInMerchantAccount:true'])assert.ok(ui.includes(x),x);
 assert.match(ui,/disabled=\{!enabled\|\|disabled\}/);
 assert.match(ui,/SARA\/MyKasih and automatic provider transactions require a certified provider connection/);
 assert.match(main,/PosMultiPayment/);assert.match(main,/payCash/);
 assert.match(receipt,/r.paymentMethod/);
});

test('R2.1: receipt evidence is AES-256-GCM encrypted, never stored raw, and tampering fails',()=>{
 const old=process.env.PAYMENT_EVIDENCE_ENCRYPTION_KEY;
 try{
  delete process.env.PAYMENT_EVIDENCE_ENCRYPTION_KEY;
  assert.throws(()=>encryptPaymentEvidence(Buffer.from('customer proof')),/POS_PAYMENT_EVIDENCE_KEY_NOT_CONFIGURED/);
  process.env.PAYMENT_EVIDENCE_ENCRYPTION_KEY='7a'.repeat(32);
  const plain=Buffer.from('customer proof');
  const a=encryptPaymentEvidence(plain),b=encryptPaymentEvidence(plain);
  assert.notDeepEqual(a,b);assert.ok(!a.includes(plain));
  assert.deepEqual(decryptPaymentEvidence(a),plain);
  const bad=Buffer.from(a);bad[bad.length-1]^=1;assert.throws(()=>decryptPaymentEvidence(bad));
 }finally{if(old===undefined)delete process.env.PAYMENT_EVIDENCE_ENCRYPTION_KEY;else process.env.PAYMENT_EVIDENCE_ENCRYPTION_KEY=old;}
});
test('R2.1: stock is checked before initiating an external noncash payment',()=>{
 const src=file('backend/src/pos-multi-payment.js');
 const start=src.slice(src.indexOf('export async function startNonCashPayment'),src.indexOf('export async function manualPaymentImage'));
 assert.match(start,/POS_STOCK_NOT_INITIALIZED/);
 assert.match(start,/POS_INSUFFICIENT_STOCK/);
 assert.match(start,/inventoryIssue/);
 assert.ok(start.indexOf('inventoryIssue')<start.indexOf('INSERT INTO pos_payment_attempts'));
});
