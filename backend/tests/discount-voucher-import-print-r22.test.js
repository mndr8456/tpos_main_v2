import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDiscountCsv,discountCsvTemplate,DISCOUNT_CSV_HEADERS} from '../src/discounts-csv.js';
import {buildDiscountPrintHtml} from '../../frontend/src/discount-print.js';
import {barcodeSvg,qrSvg} from '../../frontend/src/discount-codes-render.js';
import {generateDiscountPdf} from '../../frontend/src/discount-pdf.js';

const source=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const csv=(rows)=>'\uFEFF'+DISCOUNT_CSV_HEADERS.join(',')+'\r\n'+rows.map(row=>DISCOUNT_CSV_HEADERS.map(field=>'"'+String(row[field]??'').replaceAll('"','""')+'"').join(',')).join('\r\n');
const sample={discount_name:'Meal Discount',discount_type:'PERCENTAGE',discount_scope:'ORDER',discount_value:'10.00',minimum_spend:'0.00',eligibility_type:'ALL',status:'ACTIVE'};
const printable=(code='DSC-F7DJ2345KLMNPQRS')=>({id:'1',discount_code:code,discount_name:'Meal Offer',discount_type:'PERCENTAGE',discount_value:10,discount_scope:'ORDER',eligibility_type:'ALL',description:'Discount master rule',minimum_spend:0,status:'ACTIVE',start_date:'2026-11-01',end_date:'2026-11-30'});

test('Discount import template matches Voucher: code blank; auto-code is not a required CSV value',()=>{
 const rows=parseDiscountCsv(discountCsvTemplate());
 assert.equal(rows.length,1);
 assert.equal(rows[0].data.discountCode,'');
 assert.equal(DISCOUNT_CSV_HEADERS[0],'discount_code');
 const service=source('backend/src/discounts.js');
 assert.match(service,/discountCode:data.discountCode\|\|'DSC-PREVIEWONLY'/);
 assert.match(service,/discountCode:data.discountCode\|\|''/);
 assert.match(service,/code:r.code\|\|r.data\?\.discountCode\|\|'AUTO-GENERATED'/);
});
test('Discount parser accepts many empty codes together and mixed unique explicit legacy codes',()=>{
 const rows=parseDiscountCsv(csv([{...sample,discount_code:''},{...sample,discount_code:''},{...sample,discount_code:'summer10'},{...sample,discount_code:''},{...sample,discount_code:'SPRING'}]));
 assert.equal(rows.length,5);
 assert.ok(rows.every(x=>!x.error));
 assert.deepEqual(rows.map(x=>x.data.discountCode),['','','SUMMER10','','SPRING']);
});
test('Duplicate explicitly supplied codes still fail Preview, while blank rows do not',()=>{
 const rows=parseDiscountCsv(csv([{...sample,discount_code:''},{...sample,discount_code:'welcome10'},{...sample,discount_code:''},{...sample,discount_code:'WELCOME10'}]));
 assert.equal(rows[3].error,'DUPLICATE_CODE_IN_FILE');
 assert.ok(rows.slice(0,3).every(r=>!r.error));
});
test('Import Confirm generates code inside tenant transaction with retries and intact explicit legacy codes',()=>{
 const service=source('backend/src/discounts.js');
 const fn=service.slice(service.indexOf('export async function importDiscounts('),service.indexOf('// Read-only calculator'));
 assert.match(fn,/await transaction\(req.auth.pool,async conn=>/);
 assert.match(fn,/if\(!data.discountCode\)/);
 assert.match(fn,/generateDiscountCode\(\)/);
 assert.match(fn,/if\(e.code==='ER_DUP_ENTRY'&&attempt<4\)continue/);
 assert.match(fn,/await insertDiscount\(conn,data,req.auth.user.id,'DISCOUNT_IMPORT'\)/);
 assert.match(fn,/generatedCount\+\+/);
 assert.match(fn,/message:'DISCOUNTS_IMPORTED'/);
 assert.doesNotMatch(fn,/DISCOUNT_CODE_AUTO_GENERATED/);
 const jsx=source('frontend/src/Discounts.jsx');
 assert.match(jsx,/Leave Discount Code empty for unique auto-generated codes/);
 assert.match(jsx,/r.code\|\|'AUTO-GENERATED'/);
});
test('Voucher-parity discount print has equal barcode & QR payloads, safe HTML and precise physical paper dimensions',()=>{
 const row=printable('DSC-ABCD1234');
 const html=buildDiscountPrintHtml([row],{widthCm:18.55,heightCm:8.45},'A&B Traders');
 assert.match(html,/@page\{size:18.55cm 8.45cm;margin:0\}/);
 assert.match(html,/DISCOUNT RULE · NOT A VOUCHER/);
 assert.match(html,/Not a redeemable voucher/);
 assert.match(html,/A&amp;B Traders/);
 assert.match(html,/class="barcode"/);
 assert.match(html,/class="qr"/);
 assert.match(html,/DSC-ABCD1234/);
 assert.ok(barcodeSvg('DSC-ABCD1234').includes('<svg'));
 assert.ok(qrSvg('DSC-ABCD1234').includes('<svg'));
 // Historic two-character codes are valid master data, and must remain printable.
 assert.ok(barcodeSvg('AB').includes('<svg'));
 assert.ok(qrSvg('AB').includes('<svg'));
 assert.throws(()=>buildDiscountPrintHtml([row,row],{widthCm:18.55,heightCm:8.45},'Co'),/DUPLICATE_DISCOUNT_CODE/);
});
test('Discount PDF uses Voucher card image layout and produces two separate correctly sized PDF pages',async()=>{
 const oldImage=globalThis.Image,oldDocument=globalThis.document;
 const drawn=[];
 try{
  globalThis.Image=class {set src(_){queueMicrotask(()=>this.onload?.());}};
  globalThis.document={createElement(type){assert.equal(type,'canvas');const canvas={width:0,height:0,toDataURL(){return 'data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64');}};
   canvas.getContext=()=>({canvas,fillRect(){},strokeRect(){},drawImage(){},fillText(text){drawn.push(String(text));},measureText(t){return {width:String(t).length*7};},set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set font(v){},set textAlign(v){},set textBaseline(v){},set imageSmoothingEnabled(v){}});
   return canvas;
  }};
  const first=printable('DSC-AAAA1234'),second=printable('DSC-BBBB1234');second.id='2';
  const blob=await generateDiscountPdf([first,second],'A&B Traders',{widthCm:18.55,heightCm:8.45});
  assert.equal(blob.type,'application/pdf');
  const pdf=Buffer.from(await blob.arrayBuffer()).toString('latin1');
  assert.match(pdf,/\/Count 2/);
  assert.match(pdf,/\/MediaBox \[0 0 525\.827 239\.528\]/);
  assert.ok(drawn.includes('A&B Traders'));
  assert.ok(drawn.includes('DISCOUNT RULE · NOT A VOUCHER'));
  assert.ok(drawn.includes('DSC-AAAA1234')&&drawn.includes('DSC-BBBB1234'));
  assert.ok(drawn.includes('Not redeemable'));
 }finally{globalThis.Image=oldImage;globalThis.document=oldDocument;}
});
