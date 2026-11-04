// HR Leave Balances R1: real ISO A4 landscape report of filtered, permissioned records.
import {buildPdfFromJpegs} from './voucher-pdf.js';
const PAGE={width:1754,height:1240,widthPt:841.89,heightPt:595.276};
const columns=[
 {key:'staff_no',label:'STAFF NO.',width:156},
 {key:'full_name',label:'STAFF NAME',width:250},
 {key:'leave_code',label:'TYPE',width:85},
 {key:'balance_year',label:'YEAR',width:90},
 {key:'entitlement_days',label:'ENTITLE',width:120,fmt:v=>Number(v||0).toFixed(2)},
 {key:'carried_forward_days',label:'CARRY',width:110,fmt:v=>Number(v||0).toFixed(2)},
 {key:'adjustment_days',label:'ADJUST',width:112,fmt:v=>Number(v||0).toFixed(2)},
 {key:'used_days',label:'USED',width:106,fmt:v=>Number(v||0).toFixed(2)},
 {key:'pending_days',label:'PENDING',width:118,fmt:v=>Number(v||0).toFixed(2)},
 {key:'expired_days',label:'EXPIRED',width:116,fmt:v=>Number(v||0).toFixed(2)},
 {key:'remaining_days',label:'REMAIN',width:124,fmt:v=>Number(v||0).toFixed(2)},
 {key:'status',label:'STATUS',width:125}
];
const jpeg=canvas=>{const data=canvas.toDataURL('image/jpeg',0.92);const b=atob(data.slice(data.indexOf(',')+1));return Uint8Array.from(b,c=>c.charCodeAt(0));};
function drawText(ctx,value,x,y,max,{font=19,bold=false,color='#173451'}={}){
 ctx.font=`${bold?'bold ':''}${font}px Arial,sans-serif`;ctx.fillStyle=color;
 let str=String(value??'—');while(str.length&&ctx.measureText(str).width>max)str=str.slice(0,-2)+'…';ctx.fillText(str,x,y);
}
function paint(items,page,count,businessName){
 const canvas=document.createElement('canvas');canvas.width=PAGE.width;canvas.height=PAGE.height;
 const ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF_CANVAS_UNAVAILABLE');
 ctx.fillStyle='#fff';ctx.fillRect(0,0,PAGE.width,PAGE.height);
 drawText(ctx,businessName,70,94,1600,{font:32,bold:true});drawText(ctx,'Leave Balances',70,151,1600,{font:43,bold:true});
 drawText(ctx,`Annual Leave Balance Report  |  Year/Staff No. order  |  Page ${page+1} of ${count}`,70,196,1600,{font:19,color:'#667c95'});
 const left=56,top=235,headHeight=68,height=55,width=columns.reduce((t,c)=>t+c.width,0);
 ctx.fillStyle='#edf3fa';ctx.fillRect(left,top,width,headHeight);
 let x=left;for(const column of columns){drawText(ctx,column.label,x+10,top+43,column.width-18,{font:17,bold:true});x+=column.width;}
 for(let i=0;i<items.length;i++){
  const y=top+headHeight+i*height;if(i%2){ctx.fillStyle='#f5f8fc';ctx.fillRect(left,y,width,height);}
  let colX=left;for(const col of columns){const value=col.fmt?col.fmt(items[i][col.key]):items[i][col.key];drawText(ctx,value,colX+10,y+36,col.width-20,{font:17,bold:['staff_no','remaining_days'].includes(col.key)});colX+=col.width;}
  ctx.strokeStyle='#e1e9f3';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y+height);ctx.lineTo(left+width,y+height);ctx.stroke();
 }
 ctx.strokeStyle='#cad7e5';ctx.beginPath();ctx.moveTo(left,1154);ctx.lineTo(left+width,1154);ctx.stroke();
 drawText(ctx,'HR Leave Balances  |  Authorized report  |  No staff IC, bank or salary information',70,1194,1620,{font:18,color:'#64748b'});
 return {jpeg:jpeg(canvas),pixelWidth:PAGE.width,pixelHeight:PAGE.height,widthPt:PAGE.widthPt,heightPt:PAGE.heightPt};
}
export async function createLeaveBalancesPdf(rows,{businessName='TPOS V2'}={}){
 if(!Array.isArray(rows)||rows.length>1000)throw Error('PDF_EXPORT_LIMIT_1000');
 const per=14,count=Math.max(1,Math.ceil(rows.length/per)),pages=[];
 for(let i=0;i<count;i++)pages.push(paint(rows.slice(i*per,(i+1)*per),i,count,businessName));
 return buildPdfFromJpegs(pages);
}
export function downloadLeaveBalancesPdf(blob,name='Leave Balances.pdf'){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
