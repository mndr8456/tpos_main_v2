import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculatePosBill} from '../src/pos-bill.js';
import {serviceChargeForOrder} from '../src/service-charge-policy.js';
const file=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const policy=(overrides={})=>({isEnabled:true,chargeRate:'10.00',applyDineIn:true,applyTakeAway:false,...overrides});
test('Service Charge R1 is not JKDM Service Tax and does not add to the SST tax base',()=>{
 const bill=calculatePosBill([{lineSen:10000,taxType:'SERVICE_TAX',taxRate:'6.00',taxInclusive:false}],{serviceChargeRate:'10.00'});
 assert.equal(bill.serviceTax,'6.00');assert.equal(bill.serviceCharge,'10.00');assert.equal(bill.total,'116.00');assert.equal(bill.taxTotal,'6.00');
});
test('Service Charge is separate from Sales Tax and no SST is manufactured',()=>{
 const bill=calculatePosBill([{lineSen:4500,taxType:'NONE',taxRate:'0',taxInclusive:false}],{serviceChargeRate:'10.00'});
 assert.equal(bill.serviceTax,'0.00');assert.equal(bill.salesTax,'0.00');assert.equal(bill.serviceCharge,'4.50');assert.equal(bill.total,'49.50');
});
test('Discount and Voucher reduce the service charge base, BNM rounds only the finished bill',()=>{
 const bill=calculatePosBill([{lineSen:10003,taxType:'NONE',taxRate:'0'}],{discountSen:1000,voucherSen:1000,serviceChargeRate:'10.00'});
 assert.equal(bill.serviceCharge,'8.00');assert.equal(bill.roundingAdjustment,'+0.02');assert.equal(bill.total,'88.05');
});
test('Service charge defaults to off for Take Away but can be enabled explicitly by Owner',()=>{
 assert.equal(serviceChargeForOrder(policy(),{businessType:'RESTAURANT',orderScope:'DINE_IN'}).applicable,true);
 assert.equal(serviceChargeForOrder(policy(),{businessType:'RESTAURANT',orderScope:'TAKE_AWAY'}).applicable,false);
 assert.equal(serviceChargeForOrder(policy({applyTakeAway:true}),{businessType:'CAFE',orderScope:'TAKE_AWAY'}).rate,'10.00');
 assert.equal(serviceChargeForOrder(policy(),{businessType:'MINI_MARKET',orderScope:'DINE_IN'}).applicable,false);
 assert.equal(serviceChargeForOrder(policy({isEnabled:false}),{businessType:'RESTAURANT',orderScope:'DINE_IN'}).applicable,false);
});
test('Migration is additive and keeps Service Charge off by default, separate permissions and audit',()=>{
 const sql=file('database/019_tenant_service_charge_settings.sql');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS service_charge_settings/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS service_charge_audit_logs/);
 assert.match(sql,/VALUES\(1,0,0\.00,1,0\)/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE)\s+(?:TABLE|FROM)\b/i);
 const app=file('backend/src/app.js');
 assert.match(app,/permitted\('service_charge\.manage'\),saveServiceChargeSettings/);
 assert.match(app,/permitted\('service_charge\.view'\),getServiceChargeSettings/);
 const api=file('backend/src/service-charge.js');
 assert.match(api,/if\(!owner\(req\)\)/);
 assert.match(api,/FOR UPDATE/);
});
test('New tenants provision 019, POS quote uses tenant settings and view shows separate line',()=>{
 assert.match(file('backend/src/tenants.js'),/019_tenant_service_charge_settings\.sql/);
 assert.match(file('backend/src/pos-drafts.js'),/readServiceChargeSettings\(conn\)/);
 assert.match(file('backend/src/pos-drafts.js'),/serviceChargeRate:chargePolicy\.rate/);
 assert.match(file('frontend/src/PosTerminal.jsx'),/Service Charge \(\$\{formatPercent\(serviceCharge\.rate\)\}%\)/);
 assert.match(file('frontend/src/App.jsx'),/ServiceChargeSettings/);
 assert.match(file('frontend/src/ServiceChargeSettings.jsx'),/Enable Service Charge/);
});
