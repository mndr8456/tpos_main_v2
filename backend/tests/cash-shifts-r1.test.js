import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {parseSen,fmtSen,expectedSen} from '../src/cash-shift-money.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const source=async p=>readFile(join(root,p),'utf8');

test('Cash Shift R1 money uses integer sen, rejects invalid precision and negatives',()=>{
 assert.equal(parseSen('0.01'),1n);assert.equal(parseSen('5'),500n);assert.equal(fmtSen(parseSen('2.5')),'2.50');
 assert.equal(fmtSen(-549n),'-5.49');
 for(const bad of ['','5.999','-1.00','NaN','1e9','01.00',' 2.00 ','1,000.00',10.1])assert.throws(()=>parseSen(bad));
});
test('Cash Shift R1 balance opening + cash in - cash out; no fictitious POS cash',()=>{
 const result=expectedSen('100.00',[{direction:'CASH_IN',amount:'15.55'},{direction:'CASH_OUT',amount:'7.80'}]);
 assert.equal(fmtSen(result),'107.75');assert.equal(fmtSen(parseSen('104.50')-result),'-3.25');
});
test('Cash Shift R1 schema enforces at most one OPEN shift per cashier and historical closed shifts',async()=>{
 const sql=await source('database/013_tenant_cash_shifts.sql');
 assert.match(sql,/GENERATED ALWAYS AS \(CASE WHEN status='OPEN' THEN cashier_user_id ELSE NULL END\) STORED/);
 assert.match(sql,/UNIQUE KEY uq_cash_shift_active_cashier\(active_cashier_id\)/);
 assert.match(sql,/FOREIGN KEY \(branch_id\) REFERENCES branches\(id\)/);
 assert.match(sql,/FOREIGN KEY \(cashier_user_id\) REFERENCES users\(id\)/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});
test('Cash Shift R1 manual movements are immutable, idempotent and audited in same transaction',async()=>{
 const sql=await source('database/013_tenant_cash_shifts.sql'),api=await source('backend/src/cash-shifts.js');
 assert.match(sql,/UNIQUE KEY uq_cash_shift_movement_request\(request_key\)/);
 assert.match(api,/requestKey:z\.uuid\(\)/);
 assert.match(api,/REQUEST_KEY_REUSE_CONFLICT/);
 assert.match(api,/await conn\.beginTransaction\(\)/);
 assert.match(api,/await conn\.rollback\(\)/);
 assert.match(api,/await audit\(conn,id,req\.auth\.user\.id,data\.direction/);
 assert.doesNotMatch(api,/\bDELETE FROM cash_shift_movements\b|\bUPDATE cash_shift_movements\b/i);
});
test('Cash Shift R1 prevents counting POS sales without a real transaction adapter',async()=>{
 const api=await source('backend/src/cash-shifts.js'),ui=await source('frontend/src/CashShifts.jsx');
 assert.match(api,/expectedBasis:'OPENING_FLOAT_AND_MANUAL_MOVEMENTS_ONLY'/);
 assert.match(api,/posIntegration:'NOT_CONNECTED'/);
 assert.match(ui,/POS cash sales are not connected in R1/);
 assert.match(ui,/Any variance shown is provisional/);
});
test('Cash Shift R1 role scope enforces cashier own and higher roles all; branch guard on writes',async()=>{
 const api=await source('backend/src/cash-shifts.js'),sql=await source('database/013_tenant_cash_shifts.sql');
 assert.match(api,/const all=\(req\)=>\['OWNER','ADMIN','MANAGER','ACCOUNTANT'\]/);
 assert.match(api,/s\.cashier_user_id=\?/);
 assert.match(api,/BRANCH_ACCESS_DENIED/);
 assert.match(api,/assertVisible\(req,shift\)/);
 assert.match(api,/assertAction\(req,shift,'cash_shifts\.close\.own','cash_shifts\.close\.any'\)/);
 assert.match(sql,/WHERE r\.code IN \('CASHIER','SUPERVISOR'\)/);
});
test('Cash Shift R1 close transaction locks shift and records actual, provisional expected and variance',async()=>{
 const api=await source('backend/src/cash-shifts.js');
 assert.match(api,/FOR UPDATE/);
 assert.match(api,/SHIFT_ALREADY_CLOSED/);
 assert.match(api,/MANAGER_CLOSE_REASON_REQUIRED/);
 assert.match(api,/variance=counted-expected/);
 assert.match(api,/closed_at=UTC_TIMESTAMP\(6\)/);
 assert.match(api,/await audit\(conn,id,req\.auth\.user\.id,'CLOSE'/);
});
test('Cash Shift R1 migration is additive, read-only by default, and new tenants provision 013',async()=>{
 const installer=await source('backend/scripts/setup-cash-shifts.js'),tenant=await source('backend/src/tenants.js');
 assert.match(installer,/const apply=process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/if\(apply&&!current\)await executeSchema/);
 assert.match(tenant,/executeSchema\(dbName,'013_tenant_cash_shifts\.sql'\)/);
 assert.match(tenant,/executeSchema\(dbName,'012_tenant_vouchers\.sql'\)/);
});
test('Cash Shift R1 endpoints are authenticated and permissioned; no import of immutable cash history',async()=>{
 const app=await source('backend/src/app.js');
 assert.match(app,/permitted\('cash_shifts\.view'\),listShifts/);
 assert.match(app,/permitted\('cash_shifts\.open'\),openShift/);
 assert.match(app,/permitted\('cash_shifts\.export'\),exportShifts/);
 assert.match(app,/authenticate,addShiftMovement/);
 assert.match(app,/authenticate,closeShift/);
 assert.doesNotMatch(app,/cash-shifts\/import/);
});
test('Cash Shift R1 UI supports live search, close, cash movements and scoped navigation',async()=>{
 const jsx=await source('frontend/src/CashShifts.jsx'),app=await source('frontend/src/App.jsx');
 assert.match(jsx,/Search cashier, branch or shift ID/);
 assert.match(jsx,/Manual Cash Movement/);
 assert.match(jsx,/Close Cash Shift/);
 assert.match(jsx,/Shift Activity Log/);
 assert.match(app,/canViewCashShifts&&<button/);
 assert.match(app,/page==='cash-shifts'&&canViewCashShifts\?<CashShifts/);
});
