import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { hashPassword, verifyPassword, passwordAllowed, freshToken, tokenHash } from '../src/passwords.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const source=async p=>readFile(join(root,p),'utf8');

test('Password hashes use per-user random salt and authenticate correctly',async()=>{
 const a=await hashPassword('ValidPassword123'),b=await hashPassword('ValidPassword123');
 assert.notEqual(a,b);assert.ok(await verifyPassword('ValidPassword123',a));assert.equal(await verifyPassword('WrongPassword123',a),false);
 assert.equal(passwordAllowed('1234567890'),false);assert.equal(passwordAllowed('aA12'),false);
});
test('Session secret has unpredictable 256-bit tokens and stores only SHA-256 digest',()=>{
 const token=freshToken();assert.match(token,/^[a-zA-Z0-9_-]{43}$/);assert.equal(tokenHash(token).length,64);
});
test('Central, tenant foundation and USERS SQL are three distinct files',async()=>{
 const names=await readdir(join(root,'database'));
 assert.deepEqual(names.filter(n=>n.endsWith('.sql')).sort(),['001_central.sql','002_tenant_foundation.sql','003_tenant_users.sql']);
 const base=await source('database/002_tenant_foundation.sql');
 const users=await source('database/003_tenant_users.sql');
 assert.doesNotMatch(base,/CREATE TABLE IF NOT EXISTS users\b/i);
 for(const name of ['users','roles','permissions','role_permissions','user_roles','user_branch_access','user_sessions','user_activity_logs'])
  assert.match(users,new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\b`,'i'));
});
test('All SQL avoids destructive commands and legacy V1 tables',async()=>{
 for(const name of ['001_central.sql','002_tenant_foundation.sql','003_tenant_users.sql']){
  const sql=await source(`database/${name}`);
  assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql,/tpos_v1_|tpos_v2_tenant_[1-9]/i);
 }
});
test('A new tenant has one legal SSM identity, independent TIN and separate Sales/Service SST',async()=>{
 const sql=await source('database/002_tenant_foundation.sql');
 assert.match(sql,/\bssm_registration_number\s+VARCHAR\(100\)\s+NOT NULL\b/i);
 assert.match(sql,/\bssm_old_registration_number\s+VARCHAR\(100\)\s+NULL\b/i);
 assert.match(sql,/\btin\s+VARCHAR\(80\)\s+NULL\b/i);
 assert.match(sql,/\bsst_sales_tax_number\s+VARCHAR\(80\)\s+NULL\b/i);
 assert.match(sql,/\bsst_service_tax_number\s+VARCHAR\(80\)\s+NULL\b/i);
 assert.doesNotMatch(sql,/\bbusiness_registration_number\b|\bsst_registration_number\b/i);
});
test('Email directory is the authentication tenant resolver; no external tenant ID is accepted',async()=>{
 const auth=await source('backend/src/auth.js');
 assert.match(auth,/FROM login_directory d/);
 assert.match(auth,/WHERE d\.email=\?/);
 assert.doesNotMatch(auth,/headers\[['"]x-tenant/i);
});
test('User changes enforce explicit role permission and protect OWNER account',async()=>{
 const api=await source('backend/src/app.js');
 const users=await source('backend/src/users.js');
 assert.match(api,/permitted\('users.manage'\)/);
 assert.match(users,/OWNER_PROTECTED/);
 assert.match(users,/SELF_ROLE_STATUS_CHANGE_BLOCKED/);
 assert.match(users,/BRANCH_ACCESS_DENIED/);
});
test('Server preserves password versioning and handles failed login lockout',async()=>{
 const auth=await source('backend/src/auth.js');
 assert.match(auth,/failed_login_attempts\+1>=5/);
 assert.match(auth,/auth_version/);
 assert.match(auth,/PASSWORD_CHANGE_REQUIRED/);
});
test('New ZIP source excludes all prior modules, migrations and V1 reference tree',async()=>{
 const names=await readdir(root);
 assert.deepEqual(names.sort(),['.gitignore','README.md','backend','database','docs','frontend'].sort());
 const db=await readdir(join(root,'database'));
 assert.equal(db.some(n=>/04[1-3]|v1|legacy/i.test(n)),false);
});


test('V2 central and tenant database names match between .env files and config defaults',async()=>{
 const config=await source('backend/src/config.js');
 assert.match(config,/central: process\.env\.CENTRAL_DB \|\| 'tpos_v2_central'/);
 assert.match(config,/prefix: process\.env\.TENANT_DB_PREFIX \|\| 'tpos_v2_tenant_'/);
 for (const f of ['backend/.env','backend/.env.example']) {
  const env=await source(f);
  assert.match(env,/^CENTRAL_DB=tpos_v2_central$/m);
  assert.match(env,/^TENANT_DB_PREFIX=tpos_v2_tenant_$/m);
 }
 for (const file of ['README.md','docs/ACCEPTANCE_USER_R1.md']) {
  const content=await source(file);
  assert.match(content,/tpos_v2_central/);
  assert.doesNotMatch(content,new RegExp('tpos_v2'+'r_central|tpos_v2'+'r_tenant_')); 
 }
});
