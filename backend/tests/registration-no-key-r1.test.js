import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRegistrationRateLimit} from '../src/registration-rate-limit.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFileSync(path.join(root,file),'utf8');

test('Register UI requires only business and Owner details, no administrator key', () => {
 const app = read('frontend/src/App.jsx');
 assert.doesNotMatch(app,/Administrator Registration Key|registrationKey|X-Registration-Key/);
 assert.match(app,/request\('\/tenants\/register',\{method:'POST',body:form\}\)/);
 assert.match(app,/Registered Business Name/);
 assert.match(app,/SSM Registration Number/);
});

test('Backend public registration preserves validation and provisioning without secret header', () => {
 const tenants = read('backend/src/tenants.js');
 assert.doesNotMatch(tenants,/REGISTRATION_NOT_AUTHORIZED|REGISTRATION_DISABLED|registrationAuthorized|X-Registration-Key/);
 assert.match(tenants,/registrationSchema\.parse\(request\.body\)/);
 assert.match(tenants,/CREATE DATABASE/);
 assert.match(tenants,/status='ACTIVE'/);
 assert.match(tenants,/EMAIL_ALREADY_REGISTERED/);
 const app = read('backend/src/app.js');
 assert.match(app,/app\.post\('\/api\/v2\/tenants\/register',createRegistrationRateLimit\(\),registerTenant\)/);
});

test('Registration limiter blocks eleventh attempt, returns 429 and Retry-After', () => {
 let tick=0;
 const middleware = createRegistrationRateLimit({now:()=>tick,maxAttempts:10,windowMs:60000});
 const resp=()=>({code:0,headers:{},set(key,value){this.headers[key]=value;return this;},status(value){this.code=value;return this;},json(value){this.body=value;return this;}});
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'203.0.113.1'}};
 for(let i=0;i<10;i++){let n=0; middleware(req,resp(),()=>{n+=1});assert.equal(n,1);}
 const rejected=resp();let advanced=0;middleware(req,rejected,()=>advanced++);
 assert.equal(advanced,0);assert.equal(rejected.code,429);assert.equal(rejected.body.error,'REGISTRATION_RATE_LIMIT');assert.equal(rejected.headers['Retry-After'],'60');
 tick=60000;middleware(req,resp(),()=>advanced++);assert.equal(advanced,1);
});

test('Registration limiter separates client addresses and never trusts forwarded address', () => {
 let tick=0;const m=createRegistrationRateLimit({now:()=>tick,maxAttempts:1,windowMs:60000});
 const resp=()=>({status(v){this.code=v;return this;},set(){return this;},json(){return this;}});
 let passed=0;
 const req=ip=>({socket:{remoteAddress:ip},headers:{'x-forwarded-for':'192.0.2.6'}});
 m(req('127.0.0.1'),resp(),()=>passed++);
 m(req('127.0.0.2'),resp(),()=>passed++);
 assert.equal(passed,2);
 m(req('127.0.0.1'),resp(),()=>passed++);assert.equal(passed,2);
});
