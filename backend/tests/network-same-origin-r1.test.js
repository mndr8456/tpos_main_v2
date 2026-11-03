import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {isAllowedRequestOrigin, isTrustedProxyAddress} from '../src/request-origin.js';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const read=path=>readFile(resolve(root,path),'utf8');
const req=(origin,host,{remoteAddress='127.0.0.1',forwardedHost,forwardedProto,encrypted=false}={})=>({
  socket:{remoteAddress,encrypted},
  headers:{host,...(origin===undefined?{}:{origin}),...(forwardedHost===undefined?{}:{'x-forwarded-host':forwardedHost}),...(forwardedProto===undefined?{}:{'x-forwarded-proto':forwardedProto})}
});

test('LAN browser uses the same origin as the Vite /api/v2 proxy',()=>{
 assert.equal(isAllowedRequestOrigin(req('http://192.168.0.156:5174','127.0.0.1:5100',{forwardedHost:'192.168.0.156:5174',forwardedProto:'http'})),true);
 assert.equal(isAllowedRequestOrigin(req('http://127.0.0.1:5174','127.0.0.1:5100',{forwardedHost:'127.0.0.1:5174',forwardedProto:'http'})),true);
 assert.equal(isAllowedRequestOrigin(req('http://localhost:5174','127.0.0.1:5100',{forwardedHost:'localhost:5174',forwardedProto:'http'})),true);
});

test('HTTPS tunnel and production HTTPS origin are accepted only through trusted reverse proxy',()=>{
 const input=req('https://example.devtunnels.ms','127.0.0.1:5100',{forwardedHost:'example.devtunnels.ms',forwardedProto:'https'});
 assert.equal(isAllowedRequestOrigin(input),true);
 assert.equal(isAllowedRequestOrigin(req('https://pos.example.com','127.0.0.1:5100',{forwardedHost:'pos.example.com',forwardedProto:'https'})),true);
 assert.equal(isAllowedRequestOrigin({...input,socket:{remoteAddress:'192.168.1.99'}},''),false);
 assert.equal(isAllowedRequestOrigin({...input,socket:{remoteAddress:'10.10.0.5'}},'10.10.0.5'),true);
});

test('cross-site, mismatched scheme, malformed hosts and untrusted forwarding are rejected',()=>{
 assert.equal(isAllowedRequestOrigin(req('https://evil.example','127.0.0.1:5100',{forwardedHost:'pos.example.com',forwardedProto:'https'})),false);
 assert.equal(isAllowedRequestOrigin(req('http://pos.example.com','127.0.0.1:5100',{forwardedHost:'pos.example.com',forwardedProto:'https'})),false);
 assert.equal(isAllowedRequestOrigin(req('https://pos.example.com','127.0.0.1:5100',{forwardedHost:'pos.example.com,evil.example',forwardedProto:'https'})),false);
 assert.equal(isAllowedRequestOrigin(req('null','127.0.0.1:5100',{forwardedHost:'pos.example.com',forwardedProto:'https'})),false);
 assert.equal(isAllowedRequestOrigin(req('https://pos.example.com/extra','127.0.0.1:5100',{forwardedHost:'pos.example.com',forwardedProto:'https'})),false);
 assert.equal(isAllowedRequestOrigin(req('https://pos.example.com','127.0.0.1:5100',{forwardedHost:'pos.example.com',forwardedProto:'http,https'})),false);
 assert.equal(isTrustedProxyAddress('::ffff:127.0.0.1'),true);
 assert.equal(isTrustedProxyAddress('203.0.113.50'),false);
});

test('direct same-origin and CLI requests work without CORS reflection',()=>{
 assert.equal(isAllowedRequestOrigin(req('http://127.0.0.1:5100','127.0.0.1:5100',{remoteAddress:'192.168.0.7'})),true);
 assert.equal(isAllowedRequestOrigin(req(undefined,'127.0.0.1:5100',{remoteAddress:'192.168.0.7'})),true);
 assert.equal(isAllowedRequestOrigin(req('http://evil.example','127.0.0.1:5100',{remoteAddress:'192.168.0.7',forwardedHost:'evil.example',forwardedProto:'http'})),false);
});

test('all frontend calls are same-origin; there is no hardcoded browser backend',async()=>{
 const srcFiles=['api.js','RestaurantTables.jsx','PaymentMethods.jsx','Discounts.jsx','Products.jsx','CashShifts.jsx','PosTerminal.jsx','CashDrawer.jsx','Vouchers.jsx'];
 for(const file of srcFiles){
  const source=await read(`frontend/src/${file}`);
  assert.doesNotMatch(source,/VITE_BACKEND_URL|https?:\/\/127\.0\.0\.1:5100|https?:\/\/localhost:5100/,file);
 }
 const api=await import('../../frontend/src/api.js');
 assert.equal(api.apiUrl('/auth/login'),'/api/v2/auth/login');
 assert.equal(api.apiUrl('auth/login'),'/api/v2/auth/login');
 assert.equal(api.apiOrigin,'');
});

test('Vite has both dev and preview API proxies with bounded host allowlist',async()=>{
 const config=await read('frontend/vite.config.js');
 const scripts=JSON.parse(await read('frontend/package.json')).scripts;
 assert.match(config,/proxy:\s*\{'\/api\/v2'/);
 assert.match(config,/allowedHosts/);
 assert.doesNotMatch(config,/allowedHosts:\s*true/);
 assert.match(config,/X-Forwarded-Host/);
 assert.match(config,/X-Forwarded-Proto/);
 assert.ok(scripts['dev:lan'].includes('0.0.0.0'));
 assert.ok(scripts['dev'].includes('127.0.0.1'));
});

test('backend requires same-origin writes without wildcard CORS or env edits',async()=>{
 const app=await read('backend/src/app.js');
 assert.match(app,/isAllowedRequestOrigin\(req\)/);
 assert.doesNotMatch(app,/app\.use\(cors\(/);
 const auth=await read('backend/src/auth.js');
 assert.match(auth,/SameSite=Strict/);
 assert.match(auth,/HttpOnly/);
 assert.match(auth,/Secure/);
});


test('login transport sends cookies through a relative API URL and reports proxy outages clearly',async()=>{
 const {request}=await import('../../frontend/src/api.js');
 const original=globalThis.fetch;
 let captured;
 try {
  globalThis.fetch=async (path,options)=>{
   captured={path,options};
   return {ok:true,status:200,headers:{get:()=> 'application/json; charset=utf-8'},json:async()=>({message:'SIGNED_IN'})};
  };
  assert.deepEqual(await request('/auth/login',{method:'POST',body:{email:'a@example.test',password:'example'}}),{message:'SIGNED_IN'});
  assert.equal(captured.path,'/api/v2/auth/login');
  assert.equal(captured.options.credentials,'include');
  assert.equal(captured.options.method,'POST');
  assert.equal(captured.options.cache,'default');
  globalThis.fetch=async ()=>({ok:false,status:502,headers:{get:()=> 'text/html'}});
  await assert.rejects(()=>request('/auth/me'),/TPOS API unavailable.*502/);
  globalThis.fetch=async ()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(()=>request('/auth/me'),/Cannot reach TPOS API/);
 } finally { globalThis.fetch=original; }
});
