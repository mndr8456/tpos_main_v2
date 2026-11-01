import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFile(join(root,p),'utf8');

test('Drawer R1 has tenant-only additive append-only tables and no financial writes',async()=>{
 const sql=await read('database/014_tenant_cash_drawer_logs.sql');
 for(const table of ['cash_drawer_events','cash_drawer_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(sql,/FOREIGN KEY\(shift_id\) REFERENCES cash_shifts\(id\)/);
 assert.match(sql,/UNIQUE KEY uq_cash_drawer_request_key\(request_key\)/);
 assert.match(sql,/CHECK \(CHAR_LENGTH\(TRIM\(reason\)\)>=8\)/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b|\bUPDATE cash_shifts\b|\bUPDATE cash_shift_movements\b/i);
});
test('Drawer R1 permissions preserve cashier own shift and accountant read-only',async()=>{
 const sql=await read('database/014_tenant_cash_drawer_logs.sql'),api=await read('backend/src/cash-drawer.js');
 assert.match(sql,/WHERE r.code='ACCOUNTANT'/);
 assert.match(sql,/WHERE r.code IN \('CASHIER','SUPERVISOR'\)/);
 assert.match(api,/s\.cashier_user_id=\?/);
 assert.match(api,/cash_drawer\.record\.own/);
 assert.match(api,/cash_drawer\.record\.any/);
 assert.match(api,/BRANCH_ACCESS_DENIED/);
 assert.match(api,/ensureBranch\(req,shift.branch_id\)/);
});
test('Drawer R1 requires an OPEN shift, locks it and writes event/audit atomically',async()=>{
 const api=await read('backend/src/cash-drawer.js');
 assert.match(api,/FROM cash_shifts WHERE id=\? FOR UPDATE/);
 assert.match(api,/if\(shift.status!=='OPEN'\)throw deny\('SHIFT_ALREADY_CLOSED'/);
 assert.match(api,/await conn.beginTransaction\(\)/);
 assert.match(api,/INSERT INTO cash_drawer_events/);
 assert.match(api,/INSERT INTO cash_drawer_audit_logs/);
 assert.match(api,/await conn.commit\(\)/);
 assert.match(api,/await conn.rollback\(\)/);
 assert.doesNotMatch(api,/INSERT INTO cash_shift_movements|UPDATE cash_shifts|INSERT INTO pos_sales|cash_shift_money|physicalDrawer\.open/);
});
test('Drawer R1 records only manual observation with 8-character reason and idempotency',async()=>{
 const api=await read('backend/src/cash-drawer.js'),sql=await read('database/014_tenant_cash_drawer_logs.sql');
 assert.match(api,/reason:z\.string\(\)\.trim\(\)\.min\(8\)\.max\(300\)/);
 assert.match(api,/requestKey:z.uuid\(\)/);
 assert.match(api,/DRAWER_REQUEST_KEY_CONFLICT/);
 assert.match(api,/DRAWER_EVENT_ALREADY_RECORDED/);
 assert.match(sql,/ENUM\('MANUAL_OPEN'\)/);
 assert.match(api,/const observedOnly='MANUAL_OBSERVATION_ONLY'/);
 assert.match(api,/hardwareIntegration:'NOT_CONNECTED'/);
});
test('Drawer R1 new tenant schema, independent installer and API endpoints are registered',async()=>{
 const tenant=await read('backend/src/tenants.js'),pkg=await read('backend/package.json'),app=await read('backend/src/app.js'),installer=await read('backend/scripts/setup-cash-drawer.js');
 assert.ok(tenant.indexOf('013_tenant_cash_shifts.sql')<tenant.indexOf('014_tenant_cash_drawer_logs.sql'));
 assert.match(pkg,/"db:cash-drawer": "node scripts\/setup-cash-drawer.js"/);
 assert.match(installer,/const apply=process.argv.includes\('--apply'\)/);
 assert.match(installer,/if\(apply&&!current\)await executeSchema/);
 for(const method of ['get','post'])assert.match(app,new RegExp(`app\\.${method}\\('/api/v2/cash-drawer`));
 assert.match(app,/permitted\('cash_drawer\.view'\),listCashDrawer/);
 assert.match(app,/permitted\('cash_drawer\.audit'\),cashDrawerAudit/);
 assert.match(app,/permitted\('cash_drawer\.export'\),exportCashDrawer/);
});
test('Drawer R1 UI uses icon-only actions, Shift Cash integration and permission-driven navigation',async()=>{
 const ui=await read('frontend/src/CashDrawer.jsx'),app=await read('frontend/src/App.jsx');
 assert.match(ui,/Record Drawer Opening/);
 assert.match(ui,/Search Drawer Events/);
 assert.match(ui,/Drawer Activity Log/);
 assert.match(ui,/Export Drawer Log CSV/);
 assert.match(ui,/hardwareIntegration|Drawer Hardware/);
 assert.match(ui,/crypto.randomUUID\(\)/);
 assert.match(app,/const canViewCashDrawer=profile\.user\.permissions\.includes\('cash_drawer\.view'\)/);
 assert.ok((app.match(/\bcanViewCashDrawer\b/g)||[]).length>=3,'Cash Drawer permission must guard navigation and the rendered page');
 assert.match(app,/page==='cash-drawer'&&canViewCashDrawer\?<CashDrawer/);
});
test('Drawer R1 CSV avoids spreadsheet formula injection and is visibility scoped',async()=>{
 const api=await read('backend/src/cash-drawer.js');
 assert.match(api,/const csvSafe=/);
 assert.match(api,/\^\[=\+@-\]/);
 assert.match(api,/if\(!seeAll\(req\)\)\{where.push\('s.cashier_user_id=\?'\)/);
 assert.match(api,/const where=seeAll\(req\)\?'':' WHERE s.cashier_user_id=\?'/);
});
