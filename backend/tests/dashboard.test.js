import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=async path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
test('Dashboard has its own non-destructive SQL and default role grants',async()=>{
 const sql=await read('database/005_tenant_dashboard.sql');
 assert.match(sql,/dashboard\.view/);
 for(const role of ['OWNER','ADMIN','HR','MANAGER'])assert.ok(sql.includes(`'${role}'`));
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|DELETE|UPDATE)\b/i);
});
test('New tenant provisioning and existing tenant setup support Dashboard without changes to User SQL',async()=>{
 const tenants=await read('backend/src/tenants.js'), setup=await read('backend/scripts/setup-dashboard.js');
 assert.match(tenants,/executeSchema\(dbName,'005_tenant_dashboard.sql'\)/);
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/status='ACTIVE'/);
 assert.match(setup,/roleCodes=\['OWNER','ADMIN','HR','MANAGER'\]/);
});
test('Dashboard endpoint requires authentication and explicit dashboard.view permission',async()=>{
 const source=await read('backend/src/app.js');
 assert.match(source,/app\.get\('\/api\/v2\/dashboard\/overview',authenticate,permitted\('dashboard.view'\),dashboardOverview\)/);
});
test('Dashboard uses tenant pool and does not invent Sales/Product/Inventory data',async()=>{
 const src=await read('backend/src/dashboard.js');
 assert.match(src,/const pool=req\.auth\.pool/);
 assert.match(src,/FROM users/);
 assert.match(src,/FROM categories WHERE is_deleted=0/);
 assert.match(src,/FROM user_activity_logs/);
 assert.match(src,/LIMIT 10/);
 assert.match(src,/sales:unavailable\('SALES_MODULE_PENDING'\)/);
 assert.match(src,/inventory:unavailable\('INVENTORY_MODULE_PENDING'\)/);
 assert.doesNotMatch(src,/tenantPool|SELECT.+FROM (sales|products|inventory)/i);
});
test('Dashboard opens first only for granted users, while keeping other navigation',async()=>{
 const app=await read('frontend/src/App.jsx'),dash=await read('frontend/src/Dashboard.jsx');
 assert.match(app,/const landingPage=profile=>profile\?\.user\?\.permissions\?\.includes\('dashboard.view'\)/);
 assert.match(app,/canViewDashboard&&<button/);
 assert.match(app,/page==='dashboard'&&canViewDashboard\?<Dashboard/);
 assert.match(dash,/request\('\/dashboard\/overview'\)/);
 assert.match(dash,/Data not available yet/);
 assert.match(dash,/aria-label="Refresh Dashboard"|label="Refresh Dashboard"/);
});

test('Dashboard handler returns only real tenant aggregates and does not zero-fill pending business modules',async()=>{
 const {dashboardOverview}=await import('../src/dashboard.js');
 const queries=[];
 const pool={async execute(sql){
  queries.push(sql);
  if(sql.includes('FROM users'))return [[{total:4,active:3,inactive:1,locked:0}]];
  if(sql.includes('FROM categories WHERE'))return [[{total:6,active:5,inactive:1}]];
  if(sql.includes('FROM preparation_stations'))return [[{active:3}]];
  if(sql.includes('FROM branches'))return [[{total:2,active:2}]];
  if(sql.includes('FROM user_activity_logs'))return [[{id:12,event_type:'LOGIN',created_at:new Date('2026-10-29T07:00:00Z'),actor_name:'Jane',target_name:'Jane'}]];
  throw new Error('Unexpected SQL query');
 }};
 const response={headers:{},set(key,value){this.headers[key]=value;},json(value){this.payload=value;return value;}};
 const payload=await dashboardOverview({auth:{pool}},response);
 assert.equal(payload.users.active,3);
 assert.equal(payload.categories.total,6);
 assert.equal(payload.branches.active,2);
 assert.equal(payload.recentUserActivity.length,1);
 assert.equal(payload.sales.available,false);
 assert.equal(payload.inventory.available,false);
 assert.equal(payload.salesTrend.available,false);
 assert.equal(payload.bestSellers.available,false);
 assert.equal(response.headers['Cache-Control'],'private, no-store');
 assert.equal(queries.length,5);
});

test('Dashboard handler propagates database errors instead of displaying invented empty counts',async()=>{
 const {dashboardOverview}=await import('../src/dashboard.js');
 await assert.rejects(()=>dashboardOverview({auth:{pool:{execute:async()=>{throw new Error('DB_OFFLINE');}}}},{}),/DB_OFFLINE/);
});
