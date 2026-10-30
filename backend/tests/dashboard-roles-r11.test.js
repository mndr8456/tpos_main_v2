import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const required=['OWNER','ADMIN','HR','MANAGER','ACCOUNTANT','SUPERVISOR'];

test('Dashboard role R1.1 SQL grants only ACCOUNTANT and SUPERVISOR, preserving CASHIER and Discounts',async()=>{
 const sql=await read('database/011_tenant_dashboard_accountant_supervisor.sql');
 assert.match(sql,/INSERT IGNORE INTO permissions\s*\(code, description\)/i);
 assert.match(sql,/INSERT IGNORE INTO role_permissions\s*\(role_id, permission_code\)/i);
 assert.match(sql,/r\.code IN \('ACCOUNTANT', 'SUPERVISOR'\)/);
 assert.match(sql,/p\.code = 'dashboard\.view'/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|ALTER|DELETE|UPDATE|REPLACE|CREATE TABLE)\b/i);
 assert.doesNotMatch(sql,/discounts\.[a-z]+/i);
 assert.doesNotMatch(sql,/'CASHIER'/);
});

test('Dashboard full policy includes existing four roles plus ACCOUNTANT and SUPERVISOR, without changing 005',async()=>{
 const oldSql=await read('database/005_tenant_dashboard.sql');
 const newSql=await read('database/011_tenant_dashboard_accountant_supervisor.sql');
 for(const role of required) assert.ok((oldSql+newSql).includes(`'${role}'`),`Missing ${role}`);
 assert.match(oldSql,/WHERE r\.code IN \('OWNER','ADMIN','HR','MANAGER'\)/);
 assert.doesNotMatch(oldSql,/ACCOUNTANT|SUPERVISOR/);
});

test('Dashboard existing tenant setup is read-only by default and applies only new schema on --apply',async()=>{
 const setup=await read('backend/scripts/setup-dashboard-roles.js');
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/SELECT id, db_name FROM tenants WHERE status='ACTIVE'/);
 assert.match(setup,/requiredRoles = \['ACCOUNTANT', 'SUPERVISOR'\]/);
 assert.match(setup,/apply && !current/);
 assert.match(setup,/executeSchema\(tenant\.db_name, '011_tenant_dashboard_accountant_supervisor\.sql'\)/);
 assert.match(setup,/verified \? \(apply && !current \? 'APPLIED' : 'CURRENT'\) : 'MISSING'/);
 assert.doesNotMatch(setup,/executeSchema\([^\n]*'005_tenant_dashboard.sql'/);
 assert.match(setup,/if \(failures\) process\.exitCode = 1/);
});

test('New tenants provision Dashboard access after original Dashboard and Discount schemas',async()=>{
 const tenants=await read('backend/src/tenants.js');
 const indices=['005_tenant_dashboard.sql','010_tenant_discount_role_permissions.sql','011_tenant_dashboard_accountant_supervisor.sql'].map(x=>tenants.indexOf(`executeSchema(dbName,'${x}')`));
 assert.ok(indices.every(x=>x>=0), 'Missing schema in provisioning');
 assert.ok(indices[0]<indices[1] && indices[1]<indices[2]);
 const pkg=JSON.parse(await read('backend/package.json'));
 assert.equal(pkg.scripts['db:dashboard:roles'],'node scripts/setup-dashboard-roles.js');
 assert.match(pkg.scripts.check,/setup-dashboard-roles\.js/);
});

test('Dashboard permission drives frontend landing, sidebar and protected API without new UI overrides',async()=>{
 const app=await read('frontend/src/App.jsx');
 const api=await read('backend/src/app.js');
 assert.match(app,/const landingPage=profile=>profile\?\.user\?\.permissions\?\.includes\('dashboard\.view'\)/);
 assert.match(app,/const canViewDashboard=profile\.user\.permissions\.includes\('dashboard\.view'\)/);
 assert.match(app,/canViewDashboard&&<button/);
 assert.match(app,/page==='dashboard'&&canViewDashboard\?<Dashboard/);
 assert.match(api,/app\.get\('\/api\/v2\/dashboard\/overview',authenticate,permitted\('dashboard\.view'\),dashboardOverview\)/);
});

test('Discount R1.3 view-only policy and cashier grants remain unchanged',async()=>{
 const discount=await read('database/010_tenant_discount_role_permissions.sql');
 const dashboard=await read('database/011_tenant_dashboard_accountant_supervisor.sql');
 assert.match(discount,/r\.code IN \('MANAGER', 'ACCOUNTANT', 'SUPERVISOR'\)/);
 assert.match(discount,/rp\.permission_code LIKE 'discounts\.%'/);
 assert.doesNotMatch(dashboard,/role_code LIKE|discounts\./i);
});
