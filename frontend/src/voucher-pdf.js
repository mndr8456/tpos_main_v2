// Voucher print/export helpers. One issued voucher code appears at most once per batch.
// No third-party PDF service, external images, or checkout writes are used.
import {qrSvg,barcodeSvg,svgData} from './voucher-codes.js';

const encoder=new TextEncoder();
const cmToPt=cm=>Number(cm)*72/2.54;
const money=value=>Number(value??0).toFixed(2);
const validity=value=>String(value||'').slice(0,16).replace('T',' ');

export function selectUniqueVouchers(rows,selectedIds){
 const ids=new Set(selectedIds.map(String));
 const codes=new Set();
 return rows.filter(row=>ids.has(String(row.id))).filter(row=>{
  const code=String(row.voucher_code||'').trim().toUpperCase();
  if(!code||codes.has(code))return false;
  codes.add(code);
  return true;
 });
}

// Small dependency-free PDF writer embedding a high-resolution voucher JPEG per page.
// Page dimensions are kept in physical cm; JPEG content is generated locally.
export function buildPdfFromJpegs(pages){
 if(!Array.isArray(pages)||!pages.length)throw new Error('NO_VOUCHERS_SELECTED');
 const chunks=[];let length=0;const offsets=[0];
 function add(bytes){const b=typeof bytes==='string'?encoder.encode(bytes):bytes;chunks.push(b);length+=b.length;}
 function obj(id,body){offsets[id]=length;add(`${id} 0 obj\n`);add(body);add('\nendobj\n');}
 add('%PDF-1.4\n%TPOS\n');
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 const refs=pages.map((_,i)=>`${5+i*3} 0 R`).join(' ');
 obj(2,`<< /Type /Pages /Kids [ ${refs} ] /Count ${pages.length} >>`);
 pages.forEach((page,i)=>{
  const imageId=3+i*3,contentId=4+i*3,pageId=5+i*3;
  const {jpeg,pixelWidth,pixelHeight,widthPt,heightPt}=page;
  if(!(jpeg instanceof Uint8Array)||jpeg.length===0||![pixelWidth,pixelHeight,widthPt,heightPt].every(v=>Number.isFinite(v)&&v>0))throw new Error('INVALID_VOUCHER_PDF_PAGE');
  offsets[imageId]=length;add(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');
  const instructions=`q\n${widthPt.toFixed(3)} 0 0 ${heightPt.toFixed(3)} 0 0 cm\n/Im0 Do\nQ\n`;
  obj(contentId,`<< /Length ${encoder.encode(instructions).length} >>\nstream\n${instructions}endstream`);
  obj(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(3)} ${heightPt.toFixed(3)}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
 });
 const startXref=length;const size=3+pages.length*3;
 add(`xref\n0 ${size}\n0000000000 65535 f \n`);
 for(let i=1;i<size;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
 add(`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`);
 return new Blob(chunks,{type:'application/pdf'});
}

function fit(ctx,text,maxWidth,size,weight='700',min=10){
 let value=size;
 while(value>min){ctx.font=`${weight} ${value}px Arial, sans-serif`;if(ctx.measureText(text).width<=maxWidth)break;value--;
 }
 ctx.font=`${weight} ${value}px Arial, sans-serif`;
 return value;
}
function loadSvg(xml){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('VOUCHER_CODE_IMAGE_FAILED'));img.src=svgData(xml);});}
function jpegBytes(canvas){const uri=canvas.toDataURL('image/jpeg',0.98);const bin=atob(uri.slice(uri.indexOf(',')+1));const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;}

async function drawPdfPage(voucher,settings,businessName){
 const wcm=Number(settings.widthCm),hcm=Number(settings.heightCm);
 if(![wcm,hcm].every(Number.isFinite)||wcm<5||wcm>30||hcm<3||hcm>20)throw new Error('INVALID_VOUCHER_PRINT_SIZE');
 const dpi=220;const width=Math.round(wcm/2.54*dpi),height=Math.round(hcm/2.54*dpi);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF_CANVAS_UNAVAILABLE');
 const scale=Math.min(width/700,height/320);
 const pad=Math.max(10,18*scale),rightWidth=Math.min(height*.56,width*.28),leftW=width-rightWidth-pad*3;
 const code=String(voucher.voucher_code);
 const [bar,qr]=await Promise.all([loadSvg(barcodeSvg(code)),loadSvg(qrSvg(code))]);
 ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#f1f7ff';ctx.fillRect(pad,pad,width-pad*2,height-pad*2);
 ctx.strokeStyle='#bed3ee';ctx.lineWidth=Math.max(1,1.3*scale);ctx.strokeRect(pad,pad,width-pad*2,height-pad*2);
 const x=pad*1.7,maxW=leftW-pad;
 ctx.textAlign='left';ctx.textBaseline='top';ctx.fillStyle='#2b5fa4';
 fit(ctx,businessName,maxW,14*scale,'800',9);ctx.fillText(businessName,x,pad*1.65,maxW);
 ctx.fillStyle='#143861';fit(ctx,voucher.voucher_name,maxW,27*scale,'800',12);ctx.fillText(voucher.voucher_name,x,pad*3.1,maxW);
 ctx.fillStyle='#165bb5';const value=voucher.discount_type==='PERCENTAGE'?`${money(voucher.discount_value)}%`:`RM ${money(voucher.discount_value)}`;
 fit(ctx,value,maxW,37*scale,'900',16);ctx.fillText(value,x,pad*5.3,maxW);
 ctx.fillStyle='#59728b';const description=String(voucher.description||'Present this voucher at an eligible checkout.');
 fit(ctx,description,maxW,12*scale,'400',9);ctx.fillText(description,x,pad*7.7,maxW);
 const bw=Math.min(leftW*.84,310*scale),bh=Math.min(58*scale,height*.16);
 const bx=x+(leftW-bw)/2,by=height-pad*2.1-bh-39*scale;
 ctx.fillStyle='#fff';ctx.fillRect(bx,by,bw,bh);ctx.imageSmoothingEnabled=false;ctx.drawImage(bar,bx,by,bw,bh);
 ctx.imageSmoothingEnabled=true;ctx.textAlign='center';ctx.fillStyle='#143861';fit(ctx,code,bw,13*scale,'800',9);ctx.fillText(code,bx+bw/2,by+bh+4*scale,bw);
 const dates=`Valid: ${validity(voucher.starts_at)} – ${validity(voucher.ends_at)}`;
 ctx.fillStyle='#596f89';fit(ctx,dates,bw*1.1,10*scale,'400',7);ctx.fillText(dates,bx+bw/2,by+bh+20*scale,bw*1.1);
 const q=Math.min(rightWidth-pad*.5,height*.52),qx=width-pad*1.7-q,qy=(height-q)/2-8*scale;
 ctx.fillStyle='#fff';ctx.fillRect(qx-4*scale,qy-4*scale,q+8*scale,q+8*scale);
 ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,qx,qy,q,q);ctx.imageSmoothingEnabled=true;
 ctx.fillStyle='#596f89';ctx.textAlign='center';fit(ctx,'Scan or enter the same code',rightWidth,10*scale,'400',7);ctx.fillText('Scan or enter the same code',qx+q/2,qy+q+9*scale,rightWidth);
 return {jpeg:jpegBytes(canvas),pixelWidth:width,pixelHeight:height,widthPt:cmToPt(wcm),heightPt:cmToPt(hcm)};
}

export async function generateVoucherPdf(vouchers,settings,businessName){
 if(!vouchers.length||vouchers.length>100)throw new Error('SELECT_1_TO_100_VOUCHERS');
 const codes=vouchers.map(v=>String(v.voucher_code||'').toUpperCase());
 if(new Set(codes).size!==codes.length)throw new Error('DUPLICATE_VOUCHER_CODE_IN_EXPORT');
 const pages=[];for(const voucher of vouchers)pages.push(await drawPdfPage(voucher,settings,businessName));
 return buildPdfFromJpegs(pages);
}
