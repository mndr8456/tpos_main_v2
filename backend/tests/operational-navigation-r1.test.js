import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {landingPage} from '../../frontend/src/role-navigation.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('../../frontend/src/App.jsx');
const inventory=read('../src/inventory.js');
const ui=read('../../frontend/src/Inventory.jsx');
const sql=read('../../database/033_tenant_operational_navigation_stock_in.sql');
const installer=read('../scripts/setup-operational-navigation.js');
const model=(role,permissions=[],type='RESTAURANT')=>({user:{role,permissions},business:{type}});

test('Cashier lands directly on POS, never Categories, when pos.view is granted',()=>{
 assert.equal(landingPage(model('CASHIER',['categories.view','pos.view'])),'pos');
 assert.equal(landingPage(model('CASHIER',['cash_shifts.view'])),'cash-shifts');
});
test('Waiter prefers restaurant tables; KITCHEN receives KDS only with permission; staff stock',()=>{
 assert.equal(landingPage(model('WAITER',['restaurant_tables.view','categories.view'])),'restaurant-tables');
 assert.equal(landingPage(model('KITCHEN',['categories.view'])),'profile');
 assert.equal(landingPage(model('KITCHEN',['kds.view'])),'kds');
 assert.equal(landingPage(model('STAFF',['inventory.view'])),'inventory');
});
test('Dashboard stays first for authorized management; future explicit grants remain effective',()=>{
 assert.equal(landingPage(model('OWNER',['dashboard.view','pos.view'])),'dashboard');
 assert.equal(landingPage(model('WAITER',['dashboard.view'],'RETAIL')),'dashboard');
 assert.match(app,/entries:group\.entries\.filter\(entry=>entry\.show\)/);
 assert.match(app,/canViewDashboard&&navItem/);
});
test('Sidebar label is Data; hamburger closes all groups and only one may open at a time',()=>{
 assert.match(app,/title:'Data'/);
 assert.doesNotMatch(app,/title:'Master Data'/);
 assert.match(app,/openNavGroups,setOpenNavGroups\]=useState\(null\)/);
 assert.match(app,/setOpenNavGroups\(current=>current===group\.title\?null:group\.title\)/);
 assert.match(app,/onClick=\{\(\)=>\{setOpenNavGroups\(null\);setSidebar\(current=>!current\);\}\}/);
 assert.match(app,/setPage\(next\);setOpenNavGroups\(null\)/);
});
test('Profile is available to every signed-in user and implements both protected self-change endpoints',()=>{
 const profile=read('../../frontend/src/MyProfile.jsx');
 assert.match(app,/id:'profile',label:'Profile'/);
 assert.match(app,/page==='profile'\?<MyProfile/);
 assert.match(profile,/\/users\/\$\{profile\.user\.id\}\/email/);
 assert.match(profile,/auth\/change-password/);
 assert.match(profile,/currentPassword:emailPassword/);
 assert.doesNotMatch(profile,/\/users\/\$\{[^}]+\}\/password-reset/);
});
test('Order Terminal is permission-driven for WAITER and KDS is live by permission',()=>{
 assert.match(app,/label:'Order Terminal',icon:ClipboardList,show:canViewOrderTerminal/);
 assert.doesNotMatch(app,/label:'Order Terminal'[^\n]*planned:true/);
 assert.match(app,/label:'KDS'.*show:canViewKds/);
 assert.match(app,/disabled=\{Boolean\(entry\.planned\)\}/);
 assert.equal(landingPage(model('WAITER',['order_terminal.view','restaurant_tables.view'])),'order-terminal');
});
test('Migration 033 one-time role default cleanup does not lock future Role Permissions changes',()=>{
 assert.match(sql,/tpos_feature_setup_history/);
 assert.match(sql,/operational_nav_stock_in_033/);
 assert.match(sql,/DELETE rp FROM role_permissions/);
 assert.match(sql,/CASHIER','WAITER','KITCHEN','STAFF/);
 assert.match(sql,/categories\.view','products\.view/);
 assert.match(sql,/restaurant_tables\.view/);
 assert.match(sql,/inventory\.receive/);
 assert.match(installer,/if\(apply&&!current\)await executeSchema/);
 assert.doesNotMatch(installer,/UPDATE role_permissions/);
});
test('Stock In requires permission, exact math, branch guard, durable ledger and MySQL locks',()=>{
 assert.match(inventory,/export async function receiveInventory/);
 assert.match(inventory,/permissions\.includes\('inventory\.receive'\)/);
 assert.match(inventory,/access\(req,data\.branchId\)/);
 assert.match(inventory,/quantity2\(data\.quantity\)/);
 assert.match(inventory,/inventoryReceiveBalance/);
 assert.match(inventory,/FOR UPDATE/);
 assert.match(inventory,/movement_type!=='RECEIPT'/);
 assert.match(inventory,/version=version\+1/);
 assert.match(inventory,/await conn\.beginTransaction\(\)/);
 assert.match(inventory,/await conn\.commit\(\)/);
 assert.match(ui,/Record Stock In/);
 assert.match(ui,/Actual Unit Cost \(RM\)/);
});
test('Staff Stock cannot read valuation history but management still can',()=>{
 assert.match(inventory,/inventory\.valuation\.view/);
 assert.match(inventory,/delete record\.average_cost/);
 assert.match(inventory,/delete record\.carrying_value/);
 assert.match(ui,/\{canSeeValue&&<div className="stat"/);
 assert.match(ui,/canSeeValue\?\[/);
});
test('New tenants get migration 033; standalone installer remains explicit and read-only by default',()=>{
 const tenants=read('../src/tenants.js');
 const appBackend=read('../src/app.js');
 assert.match(tenants,/executeSchema\(dbName,'032_tenant_hr_leave_emergency_attendance.sql'\);\s*await executeSchema\(dbName,'033_tenant_operational_navigation_stock_in.sql'\)/);
 assert.match(appBackend,/permitted\('inventory\.receive'\),receiveInventory/);
 assert.match(installer,/const apply=process\.argv\.includes\('--apply'\)/);
});
