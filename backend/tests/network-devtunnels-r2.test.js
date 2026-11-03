import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicProxyContext } from '../../frontend/tpos-dev-proxy.js';
import { isAllowedRequestOrigin } from '../src/request-origin.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const TUNNEL = 'demo-5174.asse.devtunnels.ms';
const ORIGIN = `https://${TUNNEL}`;
const request = ({host='localhost:5174',origin,forwardedHost,forwardedProto,peer='127.0.0.1'}={})=>({
  headers:{host,...(origin===undefined?{}:{origin}),...(forwardedHost===undefined?{}:{'x-forwarded-host':forwardedHost}),...(forwardedProto===undefined?{}:{'x-forwarded-proto':forwardedProto})},
  socket:{remoteAddress:peer,encrypted:false}
});
const backendAccepts=(requestObj,allowlist=[])=>{
  const {host,proto}=getPublicProxyContext(requestObj,allowlist);
  return isAllowedRequestOrigin({
    headers:{host:'127.0.0.1:5100',origin:requestObj.headers.origin,'x-forwarded-host':host,'x-forwarded-proto':proto},
    socket:{remoteAddress:'127.0.0.1',encrypted:false}
  });
};

test('Dev Tunnel forwarded host and HTTPS Origin work without changing developer .env',()=>{
  const input=request({origin:ORIGIN,forwardedHost:TUNNEL,forwardedProto:'https'});
  assert.deepEqual(getPublicProxyContext(input),{host:TUNNEL,proto:'https'});
  assert.equal(backendAccepts(input),true);
});

test('HTTPS default-port forwarded host is normalized against the browser Origin',()=>{
  const input=request({origin:ORIGIN,forwardedHost:`${TUNNEL}:443`,forwardedProto:'https'});
  assert.equal(backendAccepts(input),true);
});

test('same tunnel with a rotated assigned hostname is supported only when headers agree',()=>{
  const host='other-5174.euw.devtunnels.ms';
  const input=request({origin:`https://${host}`,forwardedHost:host,forwardedProto:'https'});
  assert.equal(backendAccepts(input),true);
  assert.equal(backendAccepts({...input,headers:{...input.headers,origin:ORIGIN}}),false);
});

test('malicious origin and mismatched public forwarding are not treated as same-origin',()=>{
  const input=request({origin:'https://attacker.example',forwardedHost:TUNNEL,forwardedProto:'https'});
  assert.deepEqual(getPublicProxyContext(input),{host:'localhost:5174',proto:'http'});
  assert.equal(backendAccepts(input),false);
});

test('untrusted LAN peer cannot forge a Dev Tunnel through X-Forwarded headers',()=>{
  const input=request({host:'192.168.0.156:5174',peer:'192.168.0.22',origin:ORIGIN,forwardedHost:TUNNEL,forwardedProto:'https'});
  assert.deepEqual(getPublicProxyContext(input),{host:'192.168.0.156:5174',proto:'http'});
  assert.equal(backendAccepts(input),false);
});

test('malformed, comma-separated, downgraded and non-Microsoft forwarded hosts fail closed',()=>{
  for (const forwardedHost of [`${TUNNEL},evil.example`,`https://${TUNNEL}`,`${TUNNEL}/foo`,`${TUNNEL}@evil.example`,'evil.example']) {
    const input=request({origin:ORIGIN,forwardedHost,forwardedProto:'https'});
    assert.equal(backendAccepts(input),false,forwardedHost);
  }
  assert.equal(backendAccepts(request({origin:`http://${TUNNEL}`,forwardedHost:TUNNEL,forwardedProto:'http'})),false);
});

test('without a provider forwarded host, an explicitly configured exact tunnel host works',()=>{
  const input=request({origin:ORIGIN});
  assert.equal(backendAccepts(input),false);
  assert.deepEqual(getPublicProxyContext(input,[TUNNEL]),{host:TUNNEL,proto:'https'});
  assert.equal(backendAccepts(input,[TUNNEL]),true);
  assert.equal(backendAccepts(request({origin:'https://evil.example'}),[TUNNEL]),false);
});

test('existing LAN and localhost flows remain unchanged',()=>{
  for (const host of ['192.168.0.156:5174','127.0.0.1:5174','localhost:5174']) {
    const input=request({host,origin:`http://${host}`,peer:'192.168.0.22'});
    assert.equal(backendAccepts(input),true,host);
  }
});

test('Vite configuration only permits exact additional hosts and retains API proxy',()=>{
  const frontend=resolve(fileURLToPath(new URL('../../frontend/',import.meta.url)));
  const source=readFileSync(resolve(frontend,'vite.config.js'),'utf8');
  assert.match(source,/getPublicProxyContext/);
  assert.match(source,/proxy:\s*\{'\/api\/v2'/);
  assert.match(source,/TPOS_DEV_ALLOWED_HOSTS/);
  assert.doesNotMatch(source,/allowedHosts:\s*true/);
  assert.doesNotMatch(source,/allowedHosts:\s*\[\s*['"]\.devtunnels\.ms/);
});
