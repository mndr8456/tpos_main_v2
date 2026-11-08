import QRCode from './vendor/qr/index.js';
export function requestQrPath(url){
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!/^\/einvoice\/request\/t[1-9][0-9]{0,14}\.[0-9a-f]{64}$/.test(parsed.pathname)||parsed.search||parsed.hash)throw Error('EINVOICE_REQUEST_QR_INVALID');
 const qr=new QRCode(0,0);qr.addData(url);qr.make();const n=qr.getModuleCount(),pad=4;let path='';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))path+=`M${x+pad} ${y+pad}h1v1h-1z`;
 return {path, viewSize:n+pad*2};
}
