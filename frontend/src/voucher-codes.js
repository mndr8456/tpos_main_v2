import QRCode from './vendor/qr/index.js';
import {CODE128_PATTERNS} from './voucher-codes-data.js';

export function qrSvg(code){
 if(!/^[A-Z0-9_-]{4,64}$/.test(code))throw new Error('INVALID_VOUCHER_CODE');
 const qr=new QRCode(0,0);qr.addData(code);qr.make();
 const n=qr.getModuleCount(),margin=4;
 let path='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))path+=`M${x+margin} ${y+margin}h1v1h-1z`;
 return `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 ${n+margin*2} ${n+margin*2}"><rect width="100%" height="100%" fill="white"/><path fill="#101a2c" d="${path}"/></svg>`;
}
export function barcodeSvg(code){
 // Code 128-B supports voucher ASCII identifier; FNC/stop/checksum are generated locally.
 if(!/^[A-Z0-9_-]{4,64}$/.test(code))throw new Error('INVALID_VOUCHER_CODE');
 const symbols=[104,...[...code].map(x=>x.charCodeAt(0)-32)];
 let check=104;for(let i=1;i<symbols.length;i++)check+=symbols[i]*i;
 symbols.push(check%103,106);
 let x=10,rects='';for(const symbol of symbols){const pattern=CODE128_PATTERNS[symbol];for(const ch of pattern){const width=(ch.toLowerCase().charCodeAt(0)-96);if(ch>='A'&&ch<='Z')rects+=`<rect x="${x}" y="0" width="${width}" height="55"/>`;x+=width;}}
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x+10} 55" preserveAspectRatio="none"><rect width="100%" height="100%" fill="white"/><g fill="#121b2a">${rects}</g></svg>`;
}
export const svgData=svg=>'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
