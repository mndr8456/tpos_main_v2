// Attendance Clock IP policy. An IP restriction is a network control, not proof of GPS location.
import {isIP} from 'node:net';

const unwrap = value => String(value || '').trim().replace(/^::ffff:/i, '');
const ipv4 = text => {
 const parts = String(text).split('.');
 if(parts.length !== 4 || parts.some(x=>!/^(0|[1-9]\d{0,2})$/.test(x)||Number(x)>255))return null;
 return parts.reduce((result,n)=>((result<<8)>>>0)+Number(n),0)>>>0;
};
export function canonicalClockNetwork(value){
 const text=String(value||'').trim();
 const segments=text.split('/');
 if(segments.length>2)throw Error('INVALID_OFFICE_IP_RANGE');
 const ip=unwrap(segments[0]);
 if(isIP(ip)===4){
  const value4=ipv4(ip);if(value4===null)throw Error('INVALID_OFFICE_IP_RANGE');
  const prefix=segments.length===2?Number(segments[1]):32;
  if(!/^\d{1,2}$/.test(segments[1]??'32')||!Number.isInteger(prefix)||prefix<0||prefix>32)throw Error('INVALID_OFFICE_IP_RANGE');
  const mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;
  const masked=value4&mask;
  return `${[masked>>>24,(masked>>>16)&255,(masked>>>8)&255,masked&255].join('.')}/${prefix}`;
 }
 if(isIP(ip)===6 && segments.length===1)return ip.toLowerCase();
 throw Error('INVALID_OFFICE_IP_RANGE');
}
export function clockNetworkMatches(ipInput,networkInput){
 try{
  const ip=unwrap(ipInput),network=canonicalClockNetwork(networkInput);
  if(!ip)return false;
  if(network.includes(':'))return ip.toLowerCase()===network;
  const raw=ipv4(ip);if(raw===null)return false;
  const [net,bits]=network.split('/');const prefix=Number(bits),mask=prefix===0?0:(0xffffffff<<(32-prefix))>>>0;
  return (raw&mask)===(ipv4(net)&mask);
 }catch{return false;}
}
export function clockNetworkObservation(req){
 // Only the same-machine Vite gateway may supply these headers. It overwrites
 // caller-supplied values from the socket, never forwarding X-Forwarded-For.
 // Production must supply a separately authenticated trusted gateway; fail closed by default.
 const peer=unwrap(req.socket?.remoteAddress);
 if((process.env.NODE_ENV==='production'&&process.env.TPOS_CLOCK_TRUSTED_GATEWAY!=='loopback')||!['127.0.0.1','::1'].includes(peer))return {ip:null,channel:'UNVERIFIED'};
 const ip=unwrap(req.headers?.['x-tpos-clock-client-ip']);
 const channel=req.headers?.['x-tpos-clock-channel'];
 if(!['LOCAL','LAN','TUNNEL'].includes(channel)||isIP(ip)===0)return {ip:null,channel:'UNVERIFIED'};
 if(channel==='LOCAL'&& !['127.0.0.1','::1'].includes(ip))return {ip:null,channel:'UNVERIFIED'};
 if(channel==='LAN'&&['127.0.0.1','::1'].includes(ip))return {ip:null,channel:'UNVERIFIED'};
 return {ip,channel};
}
export function clockAccessDecision(observation,officeNetworks,hasRemoteGrant){
 if(observation.channel==='UNVERIFIED')return {allowed:false,mode:'BLOCKED',reason:'NETWORK_UNVERIFIED'};
 if(observation.channel!=='TUNNEL'&&officeNetworks.some(x=>clockNetworkMatches(observation.ip,x)))return {allowed:true,mode:'OFFICE',reason:'OFFICE_NETWORK'};
 if(hasRemoteGrant)return {allowed:true,mode:'REMOTE',reason:'APPROVED_REMOTE_DUTY'};
 return {allowed:false,mode:'BLOCKED',reason:'OUTSIDE_OFFICE_NETWORK'};
}
