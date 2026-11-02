// Discount PDF uses the same physical page size and card visual hierarchy as Voucher.
// Its Code128 and QR encode discount RULE identifiers, not POS-redeemable bearer codes.
import {qrSvg,barcodeSvg,svgData} from './discount-codes-render.js';
import {buildPdfFromJpegs} from './voucher-pdf.js';

const money=value=>Number(value??0).toFixed(2);
const validity=value=>value?String(value).slice(0,16).replace('T',' '):'No date restriction';
function fit(ctx,text,maxWidth,size,weight='700',min=10){
 let n=size;while(n>min){ctx.font=`${weight} ${n}px Arial, sans-serif`;if(ctx.measureText(text).width<=maxWidth)break;n--;}
 ctx.font=`${weight} ${n}px Arial, sans-serif`;return n;
}
function loadSvg(svg){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('DISCOUNT_CODE_IMAGE_FAILED'));img.src=svgData(svg);});}
function jpegBytes(canvas){const uri=canvas.toDataURL('image/jpeg',0.98),binary=atob(uri.slice(uri.indexOf(',')+1));const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes;}
export async function generateDiscountPdf(discounts,company,settings={widthCm:'18.55',heightCm:'8.45'}){
 if(!Array.isArray(discounts)||!discounts.length)throw new Error('NO_DISCOUNTS_TO_EXPORT');
 if(discounts.length>100)throw new Error('PDF_EXPORT_LIMIT_100');
 if(typeof document==='undefined')throw new Error('PDF_REQUIRES_BROWSER');
 const wcm=Number(settings.widthCm),hcm=Number(settings.heightCm);
 if(!Number.isFinite(wcm)||wcm<5||wcm>30||!Number.isFinite(hcm)||hcm<3||hcm>20)throw new Error('INVALID_PRINT_DIMENSIONS');
 const codes=discounts.map(d=>String(d.discount_code||'').toUpperCase());
 if(new Set(codes).size!==codes.length)throw new Error('DUPLICATE_DISCOUNT_CODE_IN_EXPORT');
 const pages=[];
 for(const discount of discounts){
  const code=String(discount.discount_code||'').toUpperCase();
  const [bar,qr]=await Promise.all([loadSvg(barcodeSvg(code)),loadSvg(qrSvg(code))]);
  const dpi=220,width=Math.round(wcm/2.54*dpi),height=Math.round(hcm/2.54*dpi);
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF_CANVAS_UNAVAILABLE');
  const scale=Math.min(width/700,height/320);
  const pad=Math.max(10,18*scale),rightWidth=Math.min(height*.56,width*.28),leftW=width-rightWidth-pad*3;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#f1f7ff';ctx.fillRect(pad,pad,width-pad*2,height-pad*2);
  ctx.strokeStyle='#bed3ee';ctx.lineWidth=Math.max(1,1.3*scale);ctx.strokeRect(pad,pad,width-pad*2,height-pad*2);
  const x=pad*1.7,maxW=leftW-pad;
  ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#2b5fa4';
  fit(ctx,String(company),maxW,14*scale,'800',9);ctx.fillText(String(company),x,pad*1.45,maxW);
  ctx.fillStyle='#59728b';fit(ctx,'DISCOUNT RULE · NOT A VOUCHER',maxW,9*scale,'700',7);ctx.fillText('DISCOUNT RULE · NOT A VOUCHER',x,pad*2.65,maxW);
  ctx.fillStyle='#143861';fit(ctx,String(discount.discount_name),maxW,27*scale,'800',12);ctx.fillText(String(discount.discount_name),x,pad*3.45,maxW);
  const value=discount.discount_type==='PERCENTAGE'?`${money(discount.discount_value)}%`:`RM ${money(discount.discount_value)}`;
  ctx.fillStyle='#165bb5';fit(ctx,value,maxW,37*scale,'900',16);ctx.fillText(value,x,pad*5.45,maxW);
  const description=String(discount.description||'Discount master rule reference. Not a redeemable voucher.');
  ctx.fillStyle='#59728b';fit(ctx,description,maxW,11*scale,'400',9);ctx.fillText(description,x,pad*7.75,maxW);
  const bw=Math.min(leftW*.84,310*scale),bh=Math.min(58*scale,height*.16);
  const bx=x+(leftW-bw)/2,by=height-pad*2.1-bh-39*scale;
  ctx.fillStyle='#fff';ctx.fillRect(bx,by,bw,bh);ctx.imageSmoothingEnabled=false;ctx.drawImage(bar,bx,by,bw,bh);
  ctx.imageSmoothingEnabled=true;ctx.textAlign='center';ctx.fillStyle='#143861';fit(ctx,code,bw,13*scale,'800',9);ctx.fillText(code,bx+bw/2,by+bh+4*scale,bw);
  const dates=`Valid: ${validity(discount.start_date)} – ${validity(discount.end_date)}`;
  ctx.fillStyle='#596f89';fit(ctx,dates,bw*1.1,10*scale,'400',7);ctx.fillText(dates,bx+bw/2,by+bh+20*scale,bw*1.1);
  const q=Math.min(rightWidth-pad*.5,height*.52),qx=width-pad*1.7-q,qy=(height-q)/2-8*scale;
  ctx.fillStyle='#fff';ctx.fillRect(qx-4*scale,qy-4*scale,q+8*scale,q+8*scale);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,qx,qy,q,q);ctx.imageSmoothingEnabled=true;
  ctx.fillStyle='#596f89';ctx.textAlign='center';fit(ctx,'Rule reference only',rightWidth,10*scale,'400',7);ctx.fillText('Rule reference only',qx+q/2,qy+q+9*scale,rightWidth);
  fit(ctx,'Not redeemable',rightWidth,9*scale,'400',7);ctx.fillText('Not redeemable',qx+q/2,qy+q+22*scale,rightWidth);
  pages.push({jpeg:jpegBytes(canvas),pixelWidth:width,pixelHeight:height,widthPt:wcm*72/2.54,heightPt:hcm*72/2.54});
 }
 return buildPdfFromJpegs(pages);
}
