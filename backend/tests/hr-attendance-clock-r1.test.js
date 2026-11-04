import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {canonicalClockNetwork,clockNetworkMatches,clockNetworkObservation,clockAccessDecision} from '../src/attendance-clock-ip.js';
import {getClockGatewayHeaders} from '../../frontend/tpos-clock-gateway.js';
const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const fake=(ip,channel,peer='127.0.0.1')=>({socket:{remoteAddress:peer},headers:{'x-tpos-clock-client-ip':ip,'x-tpos-clock-channel':channel}});

test('Clock Office CIDR canonicalization and IPv4 match',()=>{
 assert.equal(canonicalClockNetwork('192.168.0.156/24'),'192.168.0.0/24');
 assert.equal(canonicalClockNetwork('192.168.0.156'),'192.168.0.156/32');
 assert.equal(clockNetworkMatches('192.168.0.201','192.168.0.0/24'),true);
 assert.equal(clockNetworkMatches('192.168.1.201','192.168.0.0/24'),false);
 assert.equal(clockNetworkMatches('127.0.0.1','127.0.0.1'),true);
});
test('Reject invalid, impossible and overly broad Office network values',()=>{
 for(const value of ['not-ip','192.168.0.999','192.168.1.1/33','10.1.1.1/','1.2.3.04','0.0.0.0/-1'])assert.throws(()=>canonicalClockNetwork(value));
 const backend=source('../src/attendance-clock.js');assert.match(backend,/OFFICE_RANGE_TOO_BROAD/);
});
test('Office network allows exact local/LAN gateway but not a tunnel relay that looks loopback',()=>{
 const office=['127.0.0.1/32','192.168.0.0/24'];
 assert.deepEqual(clockAccessDecision(clockNetworkObservation(fake('127.0.0.1','LOCAL')),office,false).allowed,true);
 assert.equal(clockAccessDecision(clockNetworkObservation(fake('127.0.0.1','LOCAL')),['192.168.0.0/24'],false).allowed,false);
 assert.equal(clockAccessDecision(clockNetworkObservation(fake('127.0.0.1','LOCAL')),[],false).allowed,false);
 assert.deepEqual(clockAccessDecision(clockNetworkObservation(fake('192.168.0.200','LAN')),office,false).allowed,true);
 assert.deepEqual(clockAccessDecision(clockNetworkObservation(fake('127.0.0.1','TUNNEL')),office,false).allowed,false);
});
test('Remote duty requires an explicit grant, never inferred from an external IP',()=>{
 const observed=clockNetworkObservation(fake('127.0.0.1','TUNNEL'));
 assert.equal(clockAccessDecision(observed,['127.0.0.1/32'],false).reason,'OUTSIDE_OFFICE_NETWORK');
 assert.equal(clockAccessDecision(observed,['127.0.0.1/32'],true).mode,'REMOTE');
 const outside=clockNetworkObservation(fake('8.8.8.8','LAN'));
 assert.equal(clockAccessDecision(outside,['192.168.0.0/24'],false).allowed,false);
 assert.equal(clockAccessDecision(outside,['192.168.0.0/24'],true).allowed,true);
});
test('Untrusted backend peer and malformed/spoofed header values fail closed',()=>{
 for(const req of [fake('192.168.0.100','LAN','10.0.0.9'),fake('not-an-ip','LAN'),fake('192.168.0.100','INVALID'),fake('127.0.0.1','LAN')]){
  const access=clockNetworkObservation(req);assert.equal(access.channel,'UNVERIFIED');assert.equal(clockAccessDecision(access,['0.0.0.0/0'],true).allowed,false);
 }
});
test('Vite observes the socket and marks HTTPS Dev Tunnels as remote, ignoring spoofed forwards',()=>{
 const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'192.168.0.55','x-tpos-clock-client-ip':'192.168.0.22'}};
 assert.deepEqual(getClockGatewayHeaders(req,{host:'abc-5174.asse.devtunnels.ms',proto:'https'}),{ip:'127.0.0.1',channel:'TUNNEL'});
 assert.deepEqual(getClockGatewayHeaders(req,{host:'127.0.0.1:5174',proto:'http'}),{ip:'127.0.0.1',channel:'LOCAL'});
 assert.deepEqual(getClockGatewayHeaders({socket:{remoteAddress:'192.168.0.230'},headers:{}},{host:'192.168.0.156:5174',proto:'http'}),{ip:'192.168.0.230',channel:'LAN'});
});
test('Vite proxy overwrites observed-IP headers before forwarding to backend',()=>{
 const s=source('../../frontend/vite.config.js');assert.match(s,/removeHeader\('X-TPOS-Clock-Client-IP'\)/);assert.match(s,/setHeader\('X-TPOS-Clock-Client-IP', observed.ip\)/);assert.match(s,/getPublicProxyContext/);
});
test('Tenant 027 is isolated, append-only punch events, explicit permissions and no destructive statements',()=>{
 const sql=source('../../database/027_tenant_attendance_clock.sql');
 for(const table of ['hr_clock_office_networks','hr_clock_remote_grants','hr_clock_events','hr_clock_policy_audit'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.match(sql,/UNIQUE KEY uq_clock_punch_once\(attendance_id,event_type\)/);assert.match(sql,/\('attendance_clock\.manage'/);
 for(const t of ['DROP TABLE','TRUNCATE','DELETE FROM hr_attendances','ALTER TABLE hr_attendances'])assert.ok(!sql.includes(t),`Destructive SQL ${t}`);
});
test('Clock punches are self-only, server-timestamped, transactional and concurrency guarded',()=>{
 const s=source('../src/attendance-clock.js');
 assert.match(s,/WHERE sp\.user_id=\?/);assert.match(s,/UTC_TIMESTAMP\(6\)/);assert.match(s,/FOR UPDATE/);
 assert.match(s,/await c\.beginTransaction\(\)/);assert.match(s,/await c\.rollback\(\)/);
 assert.match(s,/UNIQUE KEY|CLOCK_ALREADY_RECORDED/);assert.match(s,/CLOCK_IN_REQUIRED/);assert.match(s,/SCHEDULE_NOT_AVAILABLE/);
 assert.match(s,/clockAccessDecision/);assert.match(s,/attendance_source='Web'/);
 assert.match(s,/z\.object\(\{notes:note,breakMinutes:/);assert.ok(!/req\.body\.(clock_in|clock_out)/.test(s));
});
test('Remote grants are bounded, revocable and staff-specific',()=>{
 const s=source('../src/attendance-clock.js');
 assert.match(s,/starts_at<=\? AND ends_at>=\?/);assert.match(s,/revoked_at IS NULL/);assert.match(s,/duration>43200/);
 assert.match(s,/REMOTE_GRANT/);assert.match(s,/REMOTE_REVOKE/);
});
test('Permissioned app routes and navigation expose Attendance Clock without modifying the accepted Attendances UI',()=>{
 const app=source('../src/app.js'),main=source('../../frontend/src/App.jsx');
 for(const p of ["/api/v2/attendance-clock/today","/api/v2/attendance-clock/history","/api/v2/attendance-clock-admin/meta"])assert.ok(app.includes(p));
 assert.match(main,/label:'Attendance Clock'/);assert.match(main,/attendance_clock\.view/);
 assert.match(app,/permitted\('attendance_clock\.punch'\)/);assert.match(app,/permitted\('attendance_clock\.manage'\)/);
});
test('Installer is read-only unless --apply and tenant registration adds 027 after 026',()=>{
 const s=source('../scripts/setup-attendance-clock.js'),t=source('../src/tenants.js');
 assert.match(s,/process\.argv\.includes\('--apply'\)/);assert.match(s,/if\(apply&&!current\)await executeSchema/);
 assert.ok(t.indexOf("026_tenant_hr_attendances.sql")<t.indexOf("027_tenant_attendance_clock.sql"));
});
