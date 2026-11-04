// Dependency-free client-side A4 landscape PDF; never exports IC, statutory or bank data.
import {buildPdfFromJpegs} from './voucher-pdf.js';

const fmtDate=value=>{
 const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(value||''));
 return match?`${match[3]}/${match[2]}/${match[1]}`:String(value||'—');
};
const fmtTime=value=>value?String(value).slice(11,16):'—';
const fmtDuration=value=>{const minutes=Math.max(0,Number(value||0));return `${Math.floor(minutes/60)}h ${Math.floor(minutes%60)}m`;};
const PAGE={width:1754,height:1240,widthPt:841.89,heightPt:595.276}; // ISO A4 landscape, points.
const TABLE={x:64,y:235,width:1626,headerHeight:76,rowHeight:58,firstBaseline:352,rowsPerPage:14};
const COLUMNS=[
 {header:['DATE'],width:125,key:'attendance_date',format:fmtDate},
 {header:['STAFF NO.'],width:125,key:'staff_no'},
 {header:['NAME'],width:255,key:'full_name'},
 {header:['SCHEDULED','CLOCK IN'],width:161,key:'scheduled_clock_in',format:fmtTime,center:true},
 {header:['SCHEDULED','CLOCK OUT'],width:161,key:'scheduled_clock_out',format:fmtTime,center:true},
 {header:['CLOCK IN'],width:133,key:'clock_in',format:fmtTime,center:true},
 {header:['CLOCK OUT'],width:133,key:'clock_out',format:fmtTime,center:true},
 {header:['WORKING'],width:132,key:'working_minutes',format:fmtDuration,center:true},
 {header:['STATUS'],width:198,key:'attendance_status'},
 {header:['APPROVAL'],width:203,key:'approval_status'}
];

function toJpeg(canvas){
 const uri=canvas.toDataURL('image/jpeg',0.93);
 const binary=atob(uri.slice(uri.indexOf(',')+1));
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function font(ctx,size=19,weight='normal'){
 ctx.font=`${weight} ${size}px Arial, sans-serif`;
}
function fitText(ctx,value,maxWidth){
 const input=String(value??'—');
 if(ctx.measureText(input).width<=maxWidth)return input;
 const suffix='…';
 let low=0,high=input.length;
 while(low<high){
  const mid=Math.ceil((low+high)/2);
  if(ctx.measureText(input.slice(0,mid)+suffix).width<=maxWidth)low=mid;
  else high=mid-1;
 }
 return input.slice(0,low)+suffix;
}
function drawText(ctx,value,x,y,width,{size=19,weight='normal',color='#173457',center=false}={}){
 ctx.fillStyle=color;font(ctx,size,weight);
 const fitted=fitText(ctx,value,width);
 if(center){ctx.textAlign='center';ctx.fillText(fitted,x+width/2,y);ctx.textAlign='left';}
 else ctx.fillText(fitted,x,y);
}
function renderPage(rows,page,count,businessName,title){
 const canvas=document.createElement('canvas');
 canvas.width=PAGE.width;canvas.height=PAGE.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('PDF_CANVAS_UNAVAILABLE');
 ctx.textBaseline='alphabetic';ctx.textAlign='left';
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,PAGE.width,PAGE.height);
 drawText(ctx,businessName,74,92,1535,{size:31,weight:'bold'});
 drawText(ctx,title,74,149,1535,{size:42,weight:'bold'});
 drawText(ctx,`Date format: DD/MM/YYYY  |  Timezone: MYT  |  Page ${page+1} of ${count}`,74,191,1535,{size:21,color:'#64748b'});
 ctx.strokeStyle='#cddbed';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(69,210);ctx.lineTo(1684,210);ctx.stroke();
 ctx.fillStyle='#eef3fa';ctx.fillRect(TABLE.x,TABLE.y,TABLE.width,TABLE.headerHeight);
 let x=TABLE.x;
 for(const column of COLUMNS){
  const left=x+12,maxWidth=column.width-24;
  column.header.forEach((line,index)=>drawText(ctx,line,left,TABLE.y+(column.header.length===1?45:31+index*27),maxWidth,{size:18,weight:'bold',center:column.center}));
  x+=column.width;
 }
 rows.forEach((record,row)=>{
  const baseline=TABLE.firstBaseline+row*TABLE.rowHeight;
  if(row%2){ctx.fillStyle='#f7fafe';ctx.fillRect(TABLE.x,baseline-37,TABLE.width,TABLE.rowHeight);}
  let cellX=TABLE.x;
  for(const column of COLUMNS){
   const raw=record[column.key];
   const value=column.format?column.format(raw):String(raw??'—');
   const pad=12;
   drawText(ctx,value,cellX+pad,baseline,column.width-pad*2,{size:19,weight:column.key==='staff_no'?'bold':'normal',center:column.center});
   cellX+=column.width;
  }
  ctx.strokeStyle='#e0e8f2';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(TABLE.x,baseline+20);ctx.lineTo(TABLE.x+TABLE.width,baseline+20);ctx.stroke();
 });
 ctx.strokeStyle='#cddbed';ctx.beginPath();ctx.moveTo(69,1149);ctx.lineTo(1684,1149);ctx.stroke();
 drawText(ctx,'HR Attendances  |  Authorized report  |  No sensitive staff identifiers included',74,1190,1500,{size:18,color:'#64748b'});
 return {jpeg:toJpeg(canvas),pixelWidth:PAGE.width,pixelHeight:PAGE.height,widthPt:PAGE.widthPt,heightPt:PAGE.heightPt};
}
export async function createAttendancePdf(records,{businessName='TPOS V2',title='Attendances'}={}){
 if(!Array.isArray(records)||records.length>1000)throw new Error('PDF_EXPORT_LIMIT_1000');
 const pages=[];
 const count=Math.max(1,Math.ceil(records.length/TABLE.rowsPerPage));
 for(let page=0;page<count;page++){
  const offset=page*TABLE.rowsPerPage;
  pages.push(renderPage(records.slice(offset,offset+TABLE.rowsPerPage),page,count,businessName,title));
 }
 return buildPdfFromJpegs(pages);
}
export function downloadAttendancePdf(pdf,name='Attendances.pdf'){
 const url=URL.createObjectURL(pdf);
 const link=document.createElement('a');link.href=url;link.download=name;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),5000);
}
