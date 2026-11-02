// Discount print card: shares Voucher's visual design and Code128/QR renderer.
// The encoded value identifies a reusable discount RULE, never a redeemable voucher.
import {qrSvg,barcodeSvg,svgData} from './discount-codes-render.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=d=>d.discount_type==='PERCENTAGE'?`${Number(d.discount_value).toFixed(2)}%`:`RM ${Number(d.discount_value).toFixed(2)}`;
const validity=v=>String(v||'No date restriction').slice(0,16).replace('T',' ');
export function buildDiscountPrintHtml(discounts,settings,businessName){
 const w=Number(settings.widthCm),h=Number(settings.heightCm);
 if(!Number.isFinite(w)||w<5||w>30||!Number.isFinite(h)||h<3||h>20)throw new Error('INVALID_PRINT_DIMENSIONS');
 if(!Array.isArray(discounts)||discounts.length<1||discounts.length>100)throw new Error('INVALID_PRINT_SELECTION');
 const codes=discounts.map(d=>String(d.discount_code||'').toUpperCase());
 if(new Set(codes).size!==codes.length)throw new Error('DUPLICATE_DISCOUNT_CODE_IN_PRINT');
 const cards=discounts.map(d=>{
  const code=String(d.discount_code||'').toUpperCase();
  const bar=svgData(barcodeSvg(code)),qr=svgData(qrSvg(code));
  const date=`Valid: ${validity(d.start_date)} – ${validity(d.end_date)}`;
  return `<section class="sheet"><main><div class="left"><div class="brand">${esc(businessName)}</div><div class="kind">DISCOUNT RULE · NOT A VOUCHER</div><h1>${esc(d.discount_name)}</h1><div class="value">${esc(amount(d))}</div><div class="desc">${esc(d.description||'Discount master rule reference. Not a redeemable voucher.')}</div><div class="barcode-group"><img class="barcode" src="${bar}" alt="Discount rule barcode"/><div class="code">${esc(code)}</div><div class="date">${esc(date)}</div></div></div><div class="right"><img class="qr" src="${qr}" alt="Discount rule QR"/><small>Code128 and QR identify the same discount rule.<br/>Not a redeemable voucher.</small></div></main></section>`;
 }).join('');
 return `<!doctype html><html><head><meta charset="utf-8"><title>Selected Discounts</title><style>@page{size:${w}cm ${h}cm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff;font-family:Arial,sans-serif;color:#12315a}.sheet{width:${w}cm;height:${h}cm;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}main{width:${w}cm;height:${h}cm;display:grid;grid-template-columns:minmax(0,1fr) 26%;padding:.5cm .6cm;gap:.3cm;border:.06cm solid #b7cde5;overflow:hidden}.left{display:flex;min-width:0;flex-direction:column}.brand{font-weight:800;font-size:11px;color:#2861aa;letter-spacing:.8px;overflow-wrap:anywhere}.kind{font-size:9px;font-weight:700;color:#617a93;letter-spacing:.7px;margin-top:.12cm}h1{font-size:clamp(15px,2.2vw,25px);margin:.12cm 0}.value{font-size:clamp(18px,3vw,32px);font-weight:900;color:#154b9c;margin:.2cm 0}.desc{font-size:11px;margin:.1cm 0 .15cm;overflow-wrap:anywhere}.barcode-group{width:min(100%,8.6cm);margin:auto auto 0;display:flex;flex-direction:column;align-items:center;gap:.06cm;padding-top:.1cm}.barcode{width:100%;height:1.1cm;display:block}.code{width:100%;text-align:center;font-size:12px;line-height:1.35;letter-spacing:.08em;font-weight:900;overflow-wrap:anywhere}.date{width:100%;text-align:center;font-size:10px;color:#5a6c82;line-height:1.35}.right{display:flex;align-items:center;justify-content:center;flex-direction:column;gap:.1cm}.qr{width:100%;max-width:3.6cm;aspect-ratio:1}.right small{font-size:8px;text-align:center;color:#5a6c82}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${cards}</body></html>`;
}
