import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = relative=>readFile(new URL(`../../${relative}`,import.meta.url),'utf8');

// Check role membership with the same semantics as the server authorization guard,
// including users with several roles. Tests do not need a live MySQL instance.
test('R1.3 Discount role guard allows OWNER/ADMIN only, regardless of stale grants',async()=>{
 const {discountOwnerAdminOnly}=await import('../src/discount-role-guard.js');
 for(const [role,expected] of [['OWNER',true],['ADMIN',true],['MANAGER',false],['ACCOUNTANT',false],['SUPERVISOR',false],['CASHIER',false]]){
  const req={auth:{user:{id:'21',permissions:['discounts.view','discounts.calculate','discounts.update']},pool:{execute:async(sql,params)=>{
   assert.match(sql,/user_roles/);assert.match(sql,/roles/);
   assert.match(sql,/r\.code IN \('OWNER','ADMIN'\)/);
   assert.deepEqual(params,['21']);
   return [(['OWNER','ADMIN'].includes(role)?[{code:role}]:[])];
  }}}};
  let nextCount=0,statusCode=null,body=null;
  const res={status(n){statusCode=n;return this;},json(value){body=value;return this;}};
  await discountOwnerAdminOnly(req,res,()=>{nextCount++;});
  assert.equal(nextCount,expected?1:0,role);
  if(!expected){assert.equal(statusCode,403,role);assert.equal(body.error,'DISCOUNT_OWNER_ADMIN_REQUIRED');}
 }
});

test('R1.3 Discount role guard passes DB errors to express instead of granting access',async()=>{
 const {discountOwnerAdminOnly}=await import('../src/discount-role-guard.js');
 const failure=new Error('database unavailable');
 let actual;
 await discountOwnerAdminOnly({auth:{user:{id:1},pool:{execute:async()=>{throw failure;}}}}, {},error=>{actual=error;});
 assert.equal(actual,failure);
});

test('R1.3 migration revokes only discount grants from view-only roles and preserves CASHIER',async()=>{
 const sql=await read('database/010_tenant_discount_role_permissions.sql');
 assert.match(sql,/INSERT IGNORE INTO permissions[\s\S]*'discounts\.calculate'/);
 assert.match(sql,/DELETE rp FROM role_permissions[\s\S]*WHERE r\.code IN \('MANAGER', 'ACCOUNTANT', 'SUPERVISOR'\)/);
 assert.match(sql,/rp\.permission_code LIKE 'discounts\.%'/);
 assert.match(sql,/rp\.permission_code <> 'discounts\.view'/);
 assert.match(sql,/JOIN permissions AS p ON p\.code = 'discounts\.view'/);
 assert.match(sql,/r\.code IN \('OWNER', 'ADMIN'\)/);
 assert.doesNotMatch(sql,/\b(DROP|TRUNCATE|ALTER TABLE|DELETE FROM discounts)\b/i);
 // No SQL statements may change CASHIER or unrelated module privileges.
 for(const statement of sql.split(';').map(x=>x.replace(/--[^\n]*/g,'').trim()).filter(Boolean)){
  assert.ok(!statement.includes('CASHIER'),statement);
  assert.ok(statement.includes('discounts.')||statement.includes('discounts%'),statement);
 }
});

test('R1.3 Discount privileged APIs require role guard; only list/meta remain view-only',async()=>{
 const app=await read('backend/src/app.js');
 const lines=app.split('\n').filter(x=>/^\s*app\.(get|post|put|patch|delete)\('\/api\/v2\/discounts/.test(x));
 assert.equal(lines.length,12);
 for(const line of lines){
  assert.match(line,/authenticate,permitted\('discounts\.[a-z]+'\)/);
  const isReadOnly=/app\.get\('\/api\/v2\/discounts(?:'|\/meta')/.test(line);
  if(isReadOnly){assert.match(line,/permitted\('discounts\.view'\)/);assert.doesNotMatch(line,/discountOwnerAdminOnly/);}
  else assert.match(line,/discountOwnerAdminOnly/);
 }
 const preview=lines.find(line=>line.includes('preview-calculation'));
 assert.match(preview,/permitted\('discounts\.calculate'\)/);
 assert.doesNotMatch(preview,/permitted\('discounts\.view'\)/);
});

test('R1.3 frontend shows View alone for view-only role (no calculation action without explicit grant)',async()=>{
 const ui=await read('frontend/src/Discounts.jsx');
 assert.match(ui,/<Icon icon=\{Eye\} title=\{`View/);
 assert.match(ui,/allowed\('discounts\.calculate'\)&&<Icon icon=\{Calculator\}/);
 for(const permission of ['create','update','delete','import','export','audit']){
  assert.match(ui,new RegExp(`allowed\\('discounts\\.${permission}'\\)`));
 }
});

test('R1.3 existing tenants require isolated installer; new tenants provision policy after 009',async()=>{
 const [script,tenants,packageFile,oldScript]=await Promise.all([
  read('backend/scripts/setup-discount-permissions.js'),read('backend/src/tenants.js'),read('backend/package.json'),read('backend/scripts/setup-discounts.js')]);
 assert.match(script,/process\.argv\.includes\('--apply'\)/);
 assert.match(script,/if\(apply&&!current\)/);
 assert.match(script,/DISCOUNT_R1_REQUIRED/);
 assert.match(script,/010_tenant_discount_role_permissions\.sql/);
 assert.ok(tenants.indexOf('009_tenant_discounts.sql')<tenants.indexOf('010_tenant_discount_role_permissions.sql'));
 assert.match(packageFile,/db:discounts:permissions/);
 assert.match(oldScript,/if\(apply&&!current\)await executeSchema/);
});
