import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applySstPolicy} from '../src/sst-policy.js';
import {calculatePosBill} from '../src/pos-bill.js';
const root=new URL('../../',import.meta.url);
const src=p=>readFileSync(new URL(p,root),'utf8');
const policy=(active,rate,number)=>new Map([['SERVICE_TAX',{isEnabled:active,taxRate:rate,registrationNumber:number}]]);
const product={jkdm_tax_type:'SERVICE_TAX',jkdm_tax_rate:'10.00',jkdm_tax_inclusive:0};
test('SST OFF ignores legacy product rate and produces RM 0.00, retaining BNM rounding',()=>{
 const item=applySstPolicy(product,policy(false,'10.00','ST-REG'));
 assert.deepEqual(item,{taxType:'NONE',taxRate:'0',taxInclusive:false});
 const bill=calculatePosBill([{lineSen:3303,...item}]);
 assert.equal(bill.serviceTax,'0.00');assert.equal(bill.total,'33.05');
});
test('SST ON uses tenant tax rate for matching items, not stale Product Master rate',()=>{
 const item=applySstPolicy(product,policy(true,'8.00','ST-REG'));
 const bill=calculatePosBill([{lineSen:10000,...item}]);
 assert.equal(item.taxRate,'8.00');assert.equal(bill.serviceTax,'8.00');assert.equal(bill.total,'108.00');
});
test('Missing registration fails closed for POS quote even if enabled',()=>{
 const item=applySstPolicy(product,policy(true,'8.00',''));
 assert.equal(item.taxType,'NONE');assert.equal(calculatePosBill([{lineSen:10000,...item}]).serviceTax,'0.00');
});
test('SST Sales Tax cannot apply to SERVICE_TAX products and no SST applies to NONE',()=>{
 assert.equal(applySstPolicy({...product,jkdm_tax_type:'NONE',jkdm_tax_rate:'0'},policy(true,'8.00','ST-REG')).taxType,'NONE');
 assert.equal(applySstPolicy(product,new Map([['SALES_TAX',{isEnabled:true,taxRate:'10',registrationNumber:'S'}]])).taxType,'NONE');
});
test('Migration 018 is additive and references one existing company_registrations row',()=>{
 const sql=src('database/018_tenant_sst_settings.sql');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS sst_tax_settings/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS sst_settings_audit_logs/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE|REPLACE)\s+(?:TABLE|FROM|INTO)\b/i);
 const backend=src('backend/src/sst-settings.js');assert.match(backend,/UPDATE company_registrations/);assert.match(backend,/FOR UPDATE/);
});
test('SST endpoints are permission-guarded; owner-only updates and audit',()=>{
 const app=src('backend/src/app.js'),backend=src('backend/src/sst-settings.js');
 assert.match(app,/permitted\('sst_settings\.view'\),getSstSettings/);
 assert.match(app,/permitted\('sst_settings\.manage'\),saveSstSettings/);
 assert.match(backend,/if\(!isOwner\(req\)\)/);
 assert.match(backend,/SST_REGISTRATION_AND_RATE_REQUIRED/);
 assert.match(backend,/sst_settings_audit_logs/);
});
test('New tenants receive 018 and POS derives SST policy from tenant DB',()=>{
 const tenant=src('backend/src/tenants.js'),pos=src('backend/src/pos-drafts.js'),app=src('frontend/src/App.jsx'),view=src('frontend/src/SstSettings.jsx');
 assert.match(tenant,/018_tenant_sst_settings.sql/);assert.match(pos,/const sstSettings=await readSstSettings\(req.auth.pool\)/);
 assert.match(pos,/applySstPolicy\(item,sstSettings\)/);assert.match(app,/canViewSst/);
 assert.match(view,/GST \/ SST Settings/);assert.match(view,/SST Sales Tax/);assert.match(view,/SST Service Tax/);assert.match(view,/Enable Tax/);
});
