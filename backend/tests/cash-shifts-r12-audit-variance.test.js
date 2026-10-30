import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {moneyToSen,senToMYR,auditDetails} from '../../frontend/src/cash-shift-display.js';
import {parseSen,expectedSen} from '../src/cash-shift-money.js';

const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const text=path=>readFile(join(root,path),'utf8');

test('Shift R1.2 audit renders OPEN, CASH_IN, CASH_OUT and CLOSE in clear human-readable text',()=>{
 assert.match(auditDetails({action_type:'OPEN',details:JSON.stringify({openingCash:'100.00',notes:'Start of day'})}),/Opening float: RM 100\.00.*Start of day/);
 assert.match(auditDetails({action_type:'CASH_IN',details:{amount:'25.50',reason:'Top-up float',manualExpected:'125.50'}}),/Cash In: RM 25\.50.*Top-up float.*Manual expected: RM 125\.50/);
 assert.match(auditDetails({action_type:'CASH_OUT',details:JSON.stringify({amount:'10.25',reason:'Buy ice',manualExpected:'115.25',requestKey:'private-token'})}),/Cash Out: RM 10\.25.*Buy ice.*Manual expected: RM 115\.25/);
 const close=auditDetails({action_type:'CLOSE',details:{countedCash:'114.00',manualExpected:'115.25',variance:'-1.25',notes:'Cash shortage verified',posIntegration:'NOT_CONNECTED'}});
 assert.match(close,/Counted: RM 114\.00.*Manual expected: RM 115\.25.*Shortage: RM -1\.25.*Cash shortage verified.*POS not connected/);
 assert.doesNotMatch(close,/\{|\"|requestKey|private-token/);
 assert.match(auditDetails({action_type:'CLOSE',details:{countedCash:'7500.00',manualExpected:'50.00',variance:'7450.00'}}),/Surplus: RM 7450\.00/);
 assert.equal(auditDetails({action_type:'OPEN',details:'{malformed json'}),'Details unavailable');
});

test('Shift R1.2 manual cash variance preview uses integer sen (not floating point)',()=>{
 const expected=expectedSen('100.00',[{direction:'CASH_IN',amount:'25.50'},{direction:'CASH_OUT',amount:'10.25'}]);
 assert.equal(moneyToSen('115.25'),expected);
 assert.equal(senToMYR(moneyToSen('114.00')-expected),'-RM 1.25');
 assert.equal(senToMYR(moneyToSen('115.25')-expected),'RM 0.00');
 assert.equal(senToMYR(moneyToSen('7500.00')-parseSen('50.00')),'RM 7450.00');
 for(const bad of ['-1.00','1.111','1e3','NaN',''])assert.equal(moneyToSen(bad),null);
});

test('Shift R1.2 backend enforces variance acknowledgement, reason and stale balance protection inside locked transaction',async()=>{
 const src=await text('backend/src/cash-shifts.js');
 assert.match(src,/varianceAcknowledged:z\.boolean\(\)/);
 assert.match(src,/expectedManualCash:money\.optional\(\)/);
 assert.match(src,/FOR UPDATE/);
 assert.match(src,/parseSen\(data\.expectedManualCash\)!==expected/);
 assert.match(src,/SHIFT_EXPECTED_BALANCE_CHANGED/);
 assert.match(src,/if\(variance!==0n\)/);
 assert.match(src,/!data\.varianceAcknowledged/);
 assert.match(src,/SHIFT_VARIANCE_ACK_REQUIRED/);
 assert.match(src,/data\.notes\.length<8/);
 assert.match(src,/SHIFT_VARIANCE_REASON_REQUIRED/);
 assert.match(src,/await conn\.rollback\(\)/);
 assert.match(src,/await audit\(conn,id,req\.auth\.user\.id,'CLOSE'/);
});

test('Shift R1.2 form requires user acknowledgement only for nonzero variances and displays the provisional POS warning',async()=>{
 const src=await text('frontend/src/CashShifts.jsx');
 assert.match(src,/variance=expected!==null&&actual!==null\?actual-expected:null/);
 assert.match(src,/const nonZero=variance!==null&&variance!==0n/);
 assert.match(src,/checked=\{acknowledged\}/);
 assert.match(src,/varianceAcknowledged:nonZero&&acknowledged/);
 assert.match(src,/expectedManualCash:String\(shift\.manualExpected\)/);
 assert.match(src,/I understand this is based on manual cash only/);
 assert.match(src,/Any variance shown is provisional/);
 assert.match(src,/\{auditDetails\(l\)\}/);
 assert.doesNotMatch(src,/typeof l\.details==='string'\?l\.details/);
});

test('Shift R1.2 retains cashier-own scope, higher roles, immutable cash movements, Cash In and permissioned Export CSV',async()=>{
 const api=await text('backend/src/cash-shifts.js'),ui=await text('frontend/src/CashShifts.jsx');
 assert.match(api,/const all=\(req\)=>\['OWNER','ADMIN','MANAGER','ACCOUNTANT'\]/);
 assert.match(api,/assertVisible\(req,shift\)/);
 assert.match(api,/assertBranch\(req,shift\.branch_id\)/);
 assert.match(api,/if\(!all\(req\)\)\{filters\.push\('s\.cashier_user_id=\?'\)/);
 assert.match(api,/z\.enum\(\['CASH_IN','CASH_OUT'\]\)/);
 assert.match(api,/REQUEST_KEY_REUSE_CONFLICT/);
 assert.match(api,/if\(!has\(req,'cash_shifts\.export'\)\)/);
 assert.match(api,/const scope=all\(req\)\?'':' WHERE s\.cashier_user_id=\?'/);
 assert.match(ui,/<option value="CASH_IN">Cash In \(\+\)<\/option>/);
 assert.match(ui,/Export Visible Cash Shifts CSV/);
});
