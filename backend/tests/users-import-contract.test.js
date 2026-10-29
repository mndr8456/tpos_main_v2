import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read=(name)=>readFile(new URL(`../../${name}`,import.meta.url),'utf8');
test('Import routes require explicit users.manage permission',async()=>{
 const source=await read('backend/src/app.js');
 for(const endpoint of ['/api/v2/users/import/template','/api/v2/users/import/preview','/api/v2/users/import']){
  assert.ok(source.split('\n').some(line=>line.includes(endpoint)&&line.includes("permitted('users.manage')")),endpoint);
 }
});
test('Import commits tenant users and central login directory in one transaction',async()=>{
 const src=await read('backend/src/users-import.js');
 assert.match(src,/await connection\.beginTransaction\(\)/);
 assert.match(src,/INSERT INTO users\(/);
 assert.match(src,/login_directory\(email,tenant_id,tenant_user_id\)/);
 assert.match(src,/await connection\.commit\(\)/);
 assert.match(src,/await connection\.rollback\(\)/);
 assert.match(src,/BRANCH_ACCESS_DENIED/);
 assert.doesNotMatch(src,/centralPool\(\)\.execute/);
});
test('Import preview strips sensitive password and produces no account writes',async()=>{
 const src=await read('backend/src/users-import.js');
 const preview=src.split('export async function previewUsersImport')[1].split('export async function importUsers')[0];
 assert.doesNotMatch(preview,/INSERT INTO|UPDATE users|DELETE FROM/);
 const sanitize=src.split('const safePreview=')[1].split('export async function previewUsersImport')[0];
 assert.doesNotMatch(sanitize,/password|hash/i);
 assert.match(sanitize,/error:r\.error/);
});
test('User page has icon actions, import dialog and company copyright footer; temporary sidebar note removed',async()=>{
 const page=await read('frontend/src/App.jsx');const importPage=await read('frontend/src/UsersImport.jsx');
 for(const action of ['Sign Out','Activity Log','Export Users CSV','Add User','Import Users'])assert.ok(page.includes(`aria-label="${action}"`),action);
 assert.match(page,/© 2026 TPOS V2 — MNII Alpha Ent/);
 assert.doesNotMatch(page,/Modules 2–9 will be added/);
 assert.match(importPage,/Download CSV Template/);
 assert.match(importPage,/Preview Import/);
 assert.match(importPage,/Confirm Import/);
});
