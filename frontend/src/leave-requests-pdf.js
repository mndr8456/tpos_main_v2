// TPOS V2 Leave Requests R1 - A4 landscape print of the current authorized, filtered rows.
import {buildPdfFromJpegs} from './voucher-pdf.js';
const width=1754,height=1240;
const fields=[['request_no','REQUEST',153],['staff_no','STAFF NO.',135],['full_name','STAFF',250],['leave_code','TYPE',100],['period','PERIOD',236],['total_days','DAYS',90],['request_status','STATUS',138],['balance','BALANCE',125],['attachment_count','FILES',92],['reason','REASON',281]];
const text=(ctx,v,x,y,w,{font=19,bold=false,color='#173451'}={})=>{ctx.fillStyle=color;ctx.font=`${bold?'bold ':''}${font}px Arial,sans-serif`;let t=String(v??'—');while(t.length&&ctx.measureText(t).width>w)t=t.slice(0,-2)+'…';ctx.fillText(t,x,y);};
const period=r=>r.start_date===r.end_date?r.start_date:`${r.start_date} – ${r.end_date}`;
const paint=(rows,page,pages,businessName)=>{
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF_CANVAS_UNAVAILABLE');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
 text(ctx,businessName,65,90,1580,{font:33,bold:true});text(ctx,'Leave Requests',65,146,1580,{font:44,bold:true});text(ctx,`Staff Leave Applications  |  Filtered records  |  Page ${page+1} of ${pages}`,65,195,1600,{color:'#667c95'});
 let x=55;ctx.fillStyle='#edf3fa';ctx.fillRect(55,236,1600,65);
 for(const [key,title,w] of fields){text(ctx,title,x+9,278,w-16,{font:16,bold:true});x+=w;}
 for(let i=0;i<rows.length;i++){const r=rows[i],y=301+i*64;if(i%2){ctx.fillStyle='#f5f8fc';ctx.fillRect(55,y,1600,64);}x=55;
  for(const [key,,w] of fields){let value=r[key];if(key==='period')value=period(r);if(key==='total_days')value=Number(value).toFixed(2);if(key==='balance')value=r.balance_remaining_days===null?'—':Number(r.balance_remaining_days).toFixed(2);text(ctx,value,x+9,y+41,w-17,{font:17,bold:key==='request_no'});x+=w;}
  ctx.strokeStyle='#e3eaf4';ctx.beginPath();ctx.moveTo(55,y+64);ctx.lineTo(1655,y+64);ctx.stroke();}
 ctx.strokeStyle='#d4dfea';ctx.beginPath();ctx.moveTo(55,1150);ctx.lineTo(1655,1150);ctx.stroke();text(ctx,'HR Leave Requests  |  Authorized report  |  Excludes attachment contents and confidential identifiers',65,1193,1600,{color:'#667c95',font:18});
 const raw=canvas.toDataURL('image/jpeg',.92).split(',')[1],binary=atob(raw);return {jpeg:Uint8Array.from(binary,c=>c.charCodeAt(0)),pixelWidth:width,pixelHeight:height,widthPt:841.89,heightPt:595.276};
};
export async function createLeaveRequestsPdf(rows,{businessName='TPOS V2'}={}){if(!Array.isArray(rows)||rows.length>1000)throw Error('PDF_EXPORT_LIMIT_1000');const per=12,total=Math.max(1,Math.ceil(rows.length/per)),pages=[];for(let i=0;i<total;i++)pages.push(paint(rows.slice(i*per,(i+1)*per),i,total,businessName));return buildPdfFromJpegs(pages);}
export function downloadLeaveRequestsPdf(blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Leave Requests.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
