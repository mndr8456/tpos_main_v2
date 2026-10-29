import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sourceUrl=new URL('../src/users.js',import.meta.url);
const appUrl=new URL('../src/app.js',import.meta.url);
const frontendUrl=new URL('../../frontend/src/App.jsx',import.meta.url);
const source=await readFile(sourceUrl,'utf8');

function fakeSchema(){
 const b={trim(){return this;},min(){return this;},max(){return this;},regex(){return this;},optional(){return this;},default(){return this;},transform(){return this;},int(){return this;},positive(){return this;}};
 return {string:()=>b,email:()=>b,enum:()=>b,coerce:{number:()=>b},object:fields=>({strict(){return this;},parse(data){
  if(Object.hasOwn(fields,'currentPassword')) {
   if(!data?.email||!/^\S+@\S+\.\S+$/.test(data.email.trim()))throw new Error('Invalid email');
   return {...data,email:data.email.trim().toLowerCase()};
  }
  return data;
 }})};
}
const dep={z:fakeSchema(),centralPool:()=>({}),quoteIdentifier:s=>'`'+s+'`',settings:{central:'tpos_v2_central'},verifyPassword:async(password,hash)=>password===hash,hashPassword:async()=>''};
const imports=[...source.matchAll(/^import [^\n]+;\s*$/gm)];
assert.equal(imports.length,5,'Expected User module imports to match test harness');
const moduleSource=source.replace(/^import [^\n]+;\s*$/gm,'').replace(/^export /gm,'');
// Do not change production source. Execute actual exported handler logic with
// in-memory MySQL primitives to verify transaction and authorization paths.
const harness='const {z,centralPool,quoteIdentifier,settings,verifyPassword,hashPassword}=globalThis.__r9Deps;\n'+moduleSource+'\nexport {changeUserEmail};';
globalThis.__r9Deps=dep;
const {changeUserEmail}=await import('data:text/javascript;charset=utf-8,'+encodeURIComponent(harness));
delete globalThis.__r9Deps;

function makeRequest({actor='CASHIER',self=false,targetRole='CASHIER',newEmail='New@Example.Com',password,duplicate=false}={}){
 const u={id:'11',role_code:actor};
 const targetId=self?'11':'22';
 const store={tenantId:'1',email:'old@example.com',directory:'old@example.com',ownerEmail:'old@example.com',companyEmail:'old@example.com',version:1,events:[],targetRole,duplicate,committed:false,rolledBack:false};
 const base=JSON.parse(JSON.stringify(store));
 const cn={
  async beginTransaction(){this.inTransaction=true;},
  async execute(sql,args){
   if(sql.includes('FROM users u JOIN user_roles')&&sql.includes('FOR UPDATE'))return [[{email:store.email,password_hash:'my-secret',role_code:store.targetRole}]];
   if(sql.includes('FROM `tpos_v2_central`.login_directory')&&sql.includes('FOR UPDATE'))return [[{email:store.directory}]];
   if(sql.includes('UPDATE `tpos_v2_central`.login_directory')){
    if(store.duplicate){const e=new Error('duplicate');e.code='ER_DUP_ENTRY';throw e;}
    store.directory=args[0];return [{affectedRows:1}];
   }
   if(sql.includes('UPDATE users SET email=')){store.email=args[0];store.version++;return [{affectedRows:1}];}
   if(sql.includes('UPDATE `tpos_v2_central`.tenants')){store.ownerEmail=args[0];return [{affectedRows:1}];}
   if(sql.includes('UPDATE company_profiles SET email=')){store.companyEmail=args[0];return [{affectedRows:1}];}
   if(sql.includes("'USER_EMAIL_CHANGED'")){store.events.push({actor:args[0],target:args[1],previous:args[2],next:args[3]});return [{}];}
   throw new Error('Unexpected SQL '+sql);
  },
  async commit(){store.committed=true;},
  async rollback(){Object.assign(store,base,{rolledBack:true});},
  release(){}
 };
 const req={params:{id:targetId},body:{email:newEmail,...(password===undefined?{}:{currentPassword:password})},auth:{tenantId:'1',user:u,pool:{getConnection:async()=>cn}}};
 const res={statusCode:200,status(c){this.statusCode=c;return this;},json(value){this.body=value;return this;}};
 return {req,res,store};
}
async function run(opts){const x=makeRequest(opts);try{await changeUserEmail(x.req,x.res);}catch(error){if(error.status)x.res.status(error.status).json({error:error.message});else throw error;}return x;}

test('self edit requires current password; ordinary staff cannot change other users',async()=>{
 const a=await run({self:true});assert.equal(a.res.statusCode,400);assert.equal(a.res.body.error,'CURRENT_PASSWORD_REQUIRED');
 const b=await run({self:false,actor:'CASHIER'});assert.equal(b.res.statusCode,403);assert.equal(b.res.body.error,'EMAIL_EDIT_NOT_ALLOWED');
 const c=await run({self:true,password:'incorrect'});assert.equal(c.res.statusCode,400);assert.equal(c.res.body.error,'WRONG_PASSWORD');
});
test('self change normalizes email, logs change, increments session version and commits both databases',async()=>{
 const x=await run({self:true,password:'my-secret'});
 assert.equal(x.res.body.message,'USER_EMAIL_UPDATED');assert.equal(x.res.body.mustSignInAgain,true);
 assert.equal(x.store.committed,true);assert.equal(x.store.email,'new@example.com');assert.equal(x.store.directory,'new@example.com');assert.equal(x.store.version,2);
 assert.deepEqual(x.store.events[0],{actor:'11',target:'11',previous:'old@example.com',next:'new@example.com'});
});
test('HR and ADMIN can change other users without needing users.manage',async()=>{
 for(const actor of ['HR','ADMIN','OWNER']){
  const x=await run({actor});assert.equal(x.res.statusCode,200);assert.equal(x.store.committed,true);assert.equal(x.res.body.mustSignInAgain,false);
 }
});
test('OWNER account cannot be changed by HR or ADMIN',async()=>{
 for(const actor of ['HR','ADMIN']){
  const x=await run({actor,targetRole:'OWNER'});assert.equal(x.res.statusCode,403);assert.equal(x.res.body.error,'OWNER_PROTECTED');
 }
});
test('OWNER self-edit updates central tenant owner email and company email in same transaction',async()=>{
 const x=await run({actor:'OWNER',self:true,targetRole:'OWNER',password:'my-secret'});
 assert.equal(x.res.statusCode,200);assert.equal(x.store.ownerEmail,'new@example.com');assert.equal(x.store.companyEmail,'new@example.com');assert.equal(x.store.directory,'new@example.com');
});
test('duplicate login email rolls back and does not overwrite old identity',async()=>{
 const x=await run({actor:'ADMIN',duplicate:true});assert.equal(x.res.statusCode,409);assert.equal(x.res.body.error,'EMAIL_ALREADY_REGISTERED');
 assert.equal(x.store.rolledBack,true);assert.equal(x.store.directory,'old@example.com');assert.equal(x.store.email,'old@example.com');
});
test('no-op email change preserves authentication and does not log',async()=>{
 const x=await run({self:true,password:'my-secret',newEmail:'old@example.com'});
 assert.equal(x.res.body.mustSignInAgain,false);assert.equal(x.store.events.length,0);assert.equal(x.store.version,1);
});
test('registered PATCH endpoint checks authentication; full user update still requires users.manage',async()=>{
 const app=await readFile(appUrl,'utf8');
 assert.match(app,/app\.patch\('\/api\/v2\/users\/:id\/email',authenticate,changeUserEmail\)/);
 assert.match(app,/app\.put\('\/api\/v2\/users\/:id',authenticate,permitted\('users\.manage'\),updateUser\)/);
 assert.match(source,/if\(data\.email!==undefined && data\.email!==target\.email\)/);
 assert.match(source,/if\(!\['OWNER','ADMIN'\]\.includes\(user\.role_code\)\)/);
});
test('frontend supports editable Email for normal edit, email-only HR and self flows',async()=>{
 const app=await readFile(frontendUrl,'utf8');
 assert.match(app,/<Field label="Email" required type="email" value=\{form\.email\}/);
 assert.match(app,/canEditOthersEmail=\['OWNER','ADMIN','HR'\]/);
 assert.match(app,/method:'PATCH',body:payload/);
 assert.match(app,/Current Password/);
 assert.match(app,/setSelfEmailEdit\(true\)/);
});
