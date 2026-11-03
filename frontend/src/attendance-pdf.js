// Dependency-free client-side A4 PDF, with no IC/bank/other sensitive staff data.
import {buildPdfFromJpegs} from './voucher-pdf.js';
const fmtDate=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v||''));return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'—');};
const fmtTime=v=>v?String(v).slice(11,16):'—';
function jpegBytes(canvas){const uri=canvas.toDataURL('image/jpeg',0.92);const bin=atob(uri.slice(uri.indexOf(',')+1));return Uint8Array.from(bin,c=>c.charCodeAt(0));}
function text(ctx,text,x,y,maxWidth,weight='normal',size=22){ctx.fillStyle='#193553';ctx.font=`${weight} ${size}px Arial, sans-serif`;ctx.fillText(String(text??''),x,y,maxWidth);}
export async function createAttendancePdf(records,{businessName='TPOS V2',title='Attendances'}={}){
 if(!Array.isArray(records)||records.length>1000)throw new Error('PDF_EXPORT_LIMIT_1000');
 const pages=[];const perPage=21;const count=Math.max(1,Math.ceil(records.length/perPage));
 for(let page=0;page<count;page++){
  const width=1240,height=1754,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF_CANVAS_UNAVAILABLE');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
  text(ctx,businessName,55,78,1120,'bold',29);text(ctx,title,55,125,1100,'bold',36);
  ctx.fillStyle='#64748b';ctx.font='20px Arial';ctx.fillText(`Date format: DD/MM/YYYY  |  Timezone: MYT  |  Page ${page+1} of ${count}`,55,163,1100);
  const headings=['DATE','STAFF NO.','NAME','CLOCK IN','CLOCK OUT','WORK','STATUS','APPROVAL'];
  const x=[55,170,320,630,745,850,945,1080],w=[110,138,296,102,102,85,126,110];
  ctx.fillStyle='#eef3fa';ctx.fillRect(44,190,1152,50);
  for(let i=0;i<headings.length;i++)text(ctx,headings[i],x[i],222,w[i],'bold',17);
  const rows=records.slice(page*perPage,(page+1)*perPage);
  rows.forEach((r,i)=>{const y=276+i*64;if(i%2===1){ctx.fillStyle='#f7fafe';ctx.fillRect(44,y-33,1152,62);}const vals=[fmtDate(r.attendance_date),r.staff_no,r.full_name,fmtTime(r.clock_in),fmtTime(r.clock_out),`${Math.floor(Number(r.working_minutes||0)/60)}h ${Number(r.working_minutes||0)%60}m`,r.attendance_status,r.approval_status];for(let j=0;j<vals.length;j++)text(ctx,vals[j],x[j],y,w[j],j===1?'bold':'normal',17);ctx.strokeStyle='#e3eaf2';ctx.beginPath();ctx.moveTo(45,y+18);ctx.lineTo(1195,y+18);ctx.stroke();});
  ctx.fillStyle='#64748b';ctx.font='18px Arial';ctx.fillText('TPOS V2 · HR Attendances · Approved-role report · No sensitive identifiers included',55,1688,1100);
  pages.push({jpeg:jpegBytes(canvas),pixelWidth:width,pixelHeight:height,widthPt:595.276,heightPt:841.89});
 }
 return buildPdfFromJpegs(pages);
}
export function downloadAttendancePdf(pdf,name='tpos-attendances.pdf'){const url=URL.createObjectURL(pdf);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
