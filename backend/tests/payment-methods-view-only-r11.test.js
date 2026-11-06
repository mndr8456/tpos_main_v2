import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import vm from 'node:vm';

const here=dirname(fileURLToPath(import.meta.url));
const frontend=readFileSync(resolve(here,'../../frontend/src/PaymentMethods.jsx'),'utf8');
const css=readFileSync(resolve(here,'../../frontend/src/PaymentMethods.css'),'utf8');
const backend=readFileSync(resolve(here,'../src/payment-methods.js'),'utf8');
const canManageDecl=backend.match(/^const canManage=req=>[^;]+;/m)?.[0];
assert.ok(canManageDecl,'server must declare canManage');
const canManage=vm.runInNewContext(`${canManageDecl} canManage;`);
const roles=['OWNER','ADMIN','HR','ACCOUNTANT','MANAGER','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF'];
const grants=['payment_methods.view','payment_methods.manage','payment_methods.update'];
function mockReq(role,permissions=grants){return {auth:{user:{role_code:role,permissions}}};}

test('R1.1 all eight non-owner/admin roles are denied editing even with manage/update grants',()=>{
 for(const role of roles.filter(r=>!['OWNER','ADMIN'].includes(r))){
  assert.equal(canManage(mockReq(role)),false,role);
 }
 assert.match(backend,/canManage:canManage\(req\)/);
});
test('R1.1 OWNER and ADMIN need both manage AND update, matching the Role Permission matrix',()=>{
 for(const role of ['OWNER','ADMIN']){
  for(const [perms,expected] of [[grants,true],[['payment_methods.view','payment_methods.manage'],false],[['payment_methods.view','payment_methods.update'],false]]){
   assert.equal(canManage(mockReq(role,perms)),expected,`${role} ${perms}`);
  }
 }
});
test('R1.1 all provider mutation endpoints remain server-protected by canManage',()=>{
 for(const fn of ['savePaymentMethod','uploadPaymentImage','removePaymentImage']){
  const start=backend.indexOf(`export async function ${fn}(`);
  assert.ok(start>=0,fn);
  assert.match(backend.slice(start,start+210),/if\(!canManage\(req\)\)throw bad\('PAYMENT_MANAGE_DENIED',403\)/,fn);
 }
});
test('R1.1 every bank/provider input, secret and clear-secret checkbox is disabled for view-only roles',()=>{
 const section=frontend.slice(frontend.indexOf('function SettingInputs('),frontend.indexOf('\nfunction ImageEditor('));
 assert.match(section,/disabled=false/);
 assert.equal((section.match(/<input\s/g)||[]).length,6);
 assert.equal((section.match(/<input disabled=\{disabled\}/g)||[]).length,6);
 assert.match(frontend,/hasApiKey=\{method\.hasApiKey\} disabled=\{!canManage\}/);
 assert.match(frontend,/Read-only — only OWNER \/ ADMIN can edit these details/);
 assert.match(css,/\.pm-api-readonly \.pm-field input:disabled/);
});
test('R1.1 UI also verifies signed-in role and does not expose upload, save or edit for view-only users',()=>{
 assert.match(frontend,/const canEditPaymentSettings=\['OWNER','ADMIN'\]\.includes\(profile\?\.user\?\.role\)&&data\.canManage/);
 assert.match(frontend,/canManage=\{canEditPaymentSettings\}/);
 assert.match(frontend,/if\(!canEditPaymentSettings\)/);
 assert.match(frontend,/\{canEditPaymentSettings&&<Action Icon=\{Pencil\}/);
});
