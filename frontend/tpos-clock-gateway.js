// Node-only development proxy adapter. Never use browser-supplied X-Forwarded-For.
import {isIP} from 'node:net';
const normalized=raw=>String(raw||'').replace(/^::ffff:/i,'');
export function getClockGatewayHeaders(request,publicContext){
 if(!publicContext?.host)return null;
 const ip=normalized(request.socket?.remoteAddress);
 if(!isIP(ip))return null;
 const host=String(publicContext?.host||'').toLowerCase();
 const hostname=host.replace(/:\d+$/,'').replace(/^\[|\]$/g,'');
 const local=['localhost','127.0.0.1','::1'].includes(hostname);
 // All public hostnames, including Dev Tunnels, are treated as remote even if
 // the relay's TCP socket looks like localhost. Such traffic is never Office.
 const channel=local&&['127.0.0.1','::1'].includes(ip)?'LOCAL':!local&&isIP(hostname)===0?'TUNNEL':'LAN';
 return {ip,channel};
}
