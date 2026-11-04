// HR Leave Types PDF: ISO A4 landscape, visible filters only; no employee personal data.
import {buildPdfFromJpegs} from './voucher-pdf.js';
const PAGE={width:1754,height:1240,widthPt:841.89,heightPt:595.276};
const COLS=[
 {key:'leave_code',name:'CODE',width:125},
 {key:'leave_name',name:'LEAVE NAME',width:330},
 {key:'attendance_status',name:'ATTENDANCE MAPPING',width:320},
 {key:'default_entitlement_days',name:'DAYS',width:135,format:n=>Number(n||0).toFixed(2)},
 {key:'is_paid',name:'PAY TYPE',width:190,format:n=>Number(n)?'Paid':'Unpaid'},
 {key:'requires_attachment',name:'ATTACHMENT',width:245,format:n=>Number(n)?'Required':'Not Required'},
 {key:'status',name:'STATUS',width:265}
];
const toJpeg=canvas=>{const url=canvas.toDataURL('image/jpeg',0.92);const b=atob(url.slice(url.indexOf(',')+1));return Uint8Array.from(b,x=>x.charCodeAt(0));};
function text(ctx,v,x,y,w,{size=20,bold=false,color='#173451'}={}){
 ctx.font=`${bold?'bold ':''}${size}px Arial, sans-serif`;ctx.fillStyle=color;
 const data=String(v??'—');let result=data;
 while(result.length&&ctx.measureText(result).width>w)result=result.slice(0,-2)+'…';
 ctx.fillText(result,x,y);
}
function pageCanvas(items,index,pages,business){
 const canvas=document.createElement('canvas');canvas.width=PAGE.width;canvas.height=PAGE.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF_CANVAS_UNAVAILABLE');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE.width,PAGE.height);
 text(ctx,business,72,94,1520,{size:31,bold:true});text(ctx,'Leave Types',72,155,1520,{size:44,bold:true});
 text(ctx,`Tenant HR Policy Catalog  |  Page ${index+1} of ${pages}`,72,195,1520,{size:20,color:'#64748b'});
 const left=65,top=238,width=1610,header=68,rowHeight=57;
 ctx.fillStyle='#edf3fa';ctx.fillRect(left,top,width,header);
 let x=left;
 for(const col of COLS){text(ctx,col.name,x+13,top+43,col.width-25,{size:18,bold:true});x+=col.width;}
 items.forEach((item,i)=>{
  const y=top+header+i*rowHeight;
  if(i%2){ctx.fillStyle='#f6f9fd';ctx.fillRect(left,y,width,rowHeight);}
  let colX=left;
  for(const col of COLS){const val=col.format?col.format(item[col.key]):item[col.key];text(ctx,val,colX+13,y+36,col.width-26,{size:19,bold:col.key==='leave_code'});colX+=col.width;}
  ctx.strokeStyle='#dfe9f3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y+rowHeight);ctx.lineTo(left+width,y+rowHeight);ctx.stroke();
 });
 ctx.strokeStyle='#cbd8e6';ctx.beginPath();ctx.moveTo(left,1155);ctx.lineTo(left+width,1155);ctx.stroke();
 text(ctx,'HR Leave Types  |  Authorized policy report  |  No staff personal information',72,1195,1535,{size:18,color:'#64748b'});
 return {jpeg:toJpeg(canvas),pixelWidth:PAGE.width,pixelHeight:PAGE.height,widthPt:PAGE.widthPt,heightPt:PAGE.heightPt};
}
export async function createLeaveTypesPdf(items,{businessName='TPOS V2'}={}){
 if(!Array.isArray(items)||items.length>1000)throw Error('PDF_EXPORT_LIMIT_1000');
 const perPage=14,count=Math.max(1,Math.ceil(items.length/perPage));const pages=[];
 for(let i=0;i<count;i++)pages.push(pageCanvas(items.slice(i*perPage,(i+1)*perPage),i,count,businessName));
 return buildPdfFromJpegs(pages);
}
export function downloadLeaveTypesPdf(blob,name='Leave Types.pdf'){
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
