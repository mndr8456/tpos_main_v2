import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ROLE_MODULES,PLANNED_MODULES,ROLE_CODES,isVisibleSpecial} from '../src/role-permission-catalog.js';
import {granularForRoute} from '../src/role-permission-crud-guard.js';
const load=async(file)=>readFile(new URL(`../../${file}`,import.meta.url),'utf8');

test('R1 all existing modules and planned terminals are represented',()=>{
 const keys=ROLE_MODULES.map(m=>m.key);
 assert.equal(new Set(keys).size,keys.length);
 for(const key of ['users','dashboard','categories','suppliers','products','discounts','vouchers','restaurant_tables','pos','cash_shifts','cash_drawer','inventory','payment_methods','sst_settings','service_charge','staff_profiles','attendances','attendance_clock','leave_types','leave_balances','leave_requests','role_permissions'])assert.ok(keys.includes(key),key);
 assert.deepEqual(PLANNED_MODULES.map(m=>m.key),[]);
 assert.ok(ROLE_MODULES.some(m=>m.key==='kds'&&m.crud.read==='kds.view'));
 assert.ok(ROLE_MODULES.some(m=>m.key==='order_terminal'&&m.crud.read==='order_terminal.view'));
 assert.deepEqual(ROLE_CODES,['OWNER','ADMIN','HR','ACCOUNTANT','MANAGER','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF']);
 for(const m of ROLE_MODULES){assert.deepEqual(Object.keys(m.crud),['create','read','update','delete']);assert.ok(m.crud.read,`No Read for ${m.key}`);}
});
test('R1 CRUD maps only to real endpoints, not made-up delete endpoints',()=>{
 const get=k=>ROLE_MODULES.find(x=>x.key===k).crud;
 assert.equal(get('users').create,'users.create');assert.equal(get('users').delete,null);
 assert.equal(get('vouchers').delete,'vouchers.delete');assert.equal(get('products').delete,'products.delete');
 for(const key of ['dashboard','attendance_clock','service_charge','sst_settings','leave_types','leave_requests'])assert.equal(get(key).delete,null);
 assert.equal(get('leave_requests').read,'leave_requests.view');
 assert.equal(get('inventory').create,'inventory.receive');
});
test('R1 import/export are invisible in matrix, deleted Leave Requests import never restored',async()=>{
 assert.equal(isVisibleSpecial('leave_requests.import'),false);
 assert.equal(isVisibleSpecial('vouchers.export'),false);
 assert.equal(isVisibleSpecial('products.import'),false);
 assert.equal(isVisibleSpecial('attendances.audit'),true);
 const front=await load('frontend/src/RolePermissions.jsx');
 assert.doesNotMatch(front,/Import CSV|Export PDF|Import File|Export File/);
 const sql=await load('database/034_tenant_role_permissions.sql');
 assert.doesNotMatch(sql,/['"]leave_requests\.import['"]/);
});
test('R1 migration 034 additive and seeds historic manage to granular grants exactly once',async()=>{
 const sql=await load('database/034_tenant_role_permissions.sql');
 const installer=await load('backend/scripts/setup-role-permissions.js');
 assert.match(sql,/role_permission_change_audit/);
 assert.match(sql,/role_permission_revisions/);
 for(const key of ['users.create','users.update','vouchers.create','vouchers.update','vouchers.delete','pos.create','pos.update','staff_profiles.create','staff_profiles.update','attendances.create','attendances.update','leave_requests.create','leave_requests.update'])assert.ok(sql.includes(key),key);
 assert.match(sql,/INSERT IGNORE INTO tpos_feature_setup_history\(feature_code\)/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|tpos_v1_/i);
 assert.match(installer,/process\.argv\.includes\('--apply'\)/);
 assert.match(installer,/role_permissions_r1_034/);
 assert.match(installer,/failed/);
 const tenants=await load('backend/src/tenants.js');assert.match(tenants,/executeSchema\(dbName,'034_tenant_role_permissions.sql'\)/);
});
test('R1 CRUD guard blocks legacy manage bypass on create/update/delete while preserving special actions',async()=>{
 assert.equal(granularForRoute('users.manage','POST','/api/v2/users'),'users.create');
 assert.equal(granularForRoute('users.manage','PUT','/api/v2/users/10'),'users.update');
 assert.equal(granularForRoute('users.manage','POST','/api/v2/users/10/unlock'),'users.update');
 assert.equal(granularForRoute('users.manage','POST','/api/v2/users/import'),null);
 assert.equal(granularForRoute('vouchers.manage','POST','/api/v2/vouchers'),'vouchers.create');
 assert.equal(granularForRoute('vouchers.manage','PUT','/api/v2/vouchers/7'),'vouchers.update');
 assert.equal(granularForRoute('vouchers.manage','DELETE','/api/v2/vouchers/7'),'vouchers.delete');
 assert.equal(granularForRoute('vouchers.manage','POST','/api/v2/vouchers/import'),null);
 assert.equal(granularForRoute('pos.cart.manage','POST','/api/v2/pos/drafts/7/lines'),'pos.create');
 assert.equal(granularForRoute('pos.cart.manage','PATCH','/api/v2/pos/drafts/7/table'),'pos.update');
 const auth=await load('backend/src/auth.js');assert.match(auth,/if\(granular\)return grants\.includes\(granular\)/);
});
test('R1 OWNER locked; ADMIN cannot modify ADMIN; cannot grant unowned permission',async()=>{
 const api=await load('backend/src/role-permissions.js');
 assert.match(api,/change\.role==='OWNER'/);
 assert.match(api,/!owner&&change\.role==='ADMIN'/);
 assert.match(api,/!owner&&change\.allowed&&!actor\.permissions\.includes/);
 assert.match(api,/role_permission_revisions rv ON rv\.role_id=r\.id WHERE r\.code=\? FOR UPDATE/);
 assert.match(api,/ROLE_PERMISSION_STALE_RELOAD_REQUIRED/);
 assert.match(api,/PERMISSION_NOT_CONFIGURABLE/);
 assert.match(api,/conn\.rollback\(\)/);
 assert.match(api,/INSERT INTO role_permission_change_audit/);
});
test('R1 management APIs are authenticated, permission protected and have no reset defaults or import/export',async()=>{
 const api=await load('backend/src/app.js');
 assert.match(api,/app\.get\('\/api\/v2\/role-permissions',authenticate,rolePermissionReader,getRolePermissions\)/);
 assert.match(api,/app\.put\('\/api\/v2\/role-permissions',authenticate,rolePermissionEditor,updateRolePermissions\)/);
 assert.match(api,/app\.get\('\/api\/v2\/role-permissions\/audit',authenticate,rolePermissionReader,permitted\('role_permissions.audit'\),getRolePermissionAudit\)/);
 assert.doesNotMatch(api,/role-permissions\/(?:seed|reset|import|export)/);
 const controller=await load('backend/src/role-permissions.js');
 assert.match(controller,/\['OWNER','ADMIN'\]/);
 assert.match(controller,/z\.string\(\)\.trim\(\)\.min\(4\)\.max\(500\)/);
});
test('R1 role matrix is real data and lock is enforced on UI, no local mock seed or permanent hardcoding',async()=>{
 const ui=await load('frontend/src/RolePermissions.jsx');
 assert.match(ui,/request\('\/role-permissions'\)/);
 assert.match(ui,/request\('\/role-permissions',\{method:'PUT'/);
 assert.match(ui,/role.code==='OWNER'/);
 assert.match(ui,/Action Filter/);
 assert.match(ui,/Save Changes/);
 assert.match(ui,/Change Reason/);
 assert.match(ui,/Role Permission Activity Log/);
 assert.match(ui,/No endpoint is implemented for this operation/);
 const app=await load('frontend/src/App.jsx');assert.match(app,/Settings',entries:/);assert.match(app,/id:'role-permissions'/);
});
test('R1 original Leave Requests protections remain; new CRUD uses own/privileged boundaries',async()=>{
 const leave=await load('backend/src/leave-requests.js');
 assert.match(leave,/mode==='create'/);assert.match(leave,/mode==='update'/);
 assert.match(leave,/p\.includes\('leave_requests.self'\)/);
 assert.match(leave,/privileged=new Set\(\['OWNER','ADMIN','HR'\]\)/);
 assert.match(leave,/access\(req,'approve'\)/);
 assert.match(leave,/requestCancel\(req,res\)\{access\(req,'self'\)/);
});
