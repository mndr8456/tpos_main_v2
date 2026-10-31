// Downloadable Discount Master report, generated locally without a remote renderer.
// Discounts are reusable rules, not one-time vouchers: do not print voucher barcodes.
import {buildPdfFromJpegs} from './voucher-pdf.js';

const money = value => Number(value ?? 0).toFixed(2);
const date = value => value ? String(value).slice(0,10) : '—';
const label = discount => discount.discount_type === 'PERCENTAGE'
  ? `${money(discount.discount_value)}%`
  : `RM ${money(discount.discount_value)}`;
const text = value => String(value ?? '');

function jpegData(canvas){
 const data=canvas.toDataURL('image/jpeg',0.94);
 const binary=atob(data.slice(data.indexOf(',')+1));
 const bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return bytes;
}

export function drawDiscountReportPage(ctx,records,company,pageNo,totalPages){
 const width=ctx.canvas.width,height=ctx.canvas.height;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
 const pad=65;
 ctx.fillStyle='#163b6c';ctx.font='bold 38px Arial';ctx.fillText('Discounts Report',pad,85);
 ctx.fillStyle='#526985';ctx.font='22px Arial';ctx.fillText(text(company).slice(0,80),pad,120);
 ctx.font='17px Arial';ctx.fillText(`${records.length} record(s) on this page  |  ${new Date().toLocaleDateString('en-MY')}`,pad,152);
 const columns=[{name:'CODE',x:pad},{name:'DISCOUNT',x:220},{name:'SCOPE',x:570},{name:'VALUE',x:720},{name:'VALIDITY',x:850},{name:'STATUS',x:1290}];
 ctx.fillStyle='#e8f0fa';ctx.fillRect(pad,190,width-2*pad,50);
 ctx.fillStyle='#173d6e';ctx.font='bold 17px Arial';
 columns.forEach(c=>ctx.fillText(c.name,c.x,223));
 records.forEach((d,i)=>{
  const y=258+i*35;
  if(i%2===0){ctx.fillStyle='#f5f8fd';ctx.fillRect(pad,y-23,width-2*pad,35);}
  ctx.fillStyle='#1b385a';ctx.font='16px Arial';
  ctx.fillText(text(d.discount_code).slice(0,16),pad,y);
  ctx.fillText(text(d.discount_name).slice(0,36),220,y);
  ctx.fillText(text(d.discount_scope).slice(0,14),570,y);
  ctx.fillText(label(d),720,y);
  ctx.fillText(`${date(d.start_date)} / ${date(d.end_date)}`,850,y);
  ctx.fillText(text(d.status),1290,y);
 });
 ctx.fillStyle='#627895';ctx.font='16px Arial';
 ctx.fillText(`TPOS V2 | Page ${pageNo} of ${totalPages}`,pad,height-42);
}

export async function generateDiscountPdf(discounts,company){
 if(!Array.isArray(discounts)||discounts.length===0)throw new Error('NO_DISCOUNTS_TO_EXPORT');
 if(discounts.length>1000)throw new Error('PDF_EXPORT_LIMIT_1000');
 if(typeof document==='undefined')throw new Error('PDF_REQUIRES_BROWSER');
 const perPage=20,pageCount=Math.ceil(discounts.length/perPage),pages=[];
 for(let index=0;index<pageCount;index++){
  const canvas=document.createElement('canvas');canvas.width=1587;canvas.height=1123;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF_CANVAS_UNAVAILABLE');
  drawDiscountReportPage(ctx,discounts.slice(index*perPage,(index+1)*perPage),company,index+1,pageCount);
  pages.push({jpeg:jpegData(canvas),pixelWidth:canvas.width,pixelHeight:canvas.height,widthPt:841.89,heightPt:595.28});
 }
 return buildPdfFromJpegs(pages);
}
