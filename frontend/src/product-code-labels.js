// Product label printing reuses the locally bundled, MIT-licensed QR renderer
// and the Code128 pattern table already used for accepted Voucher/Discount labels.
// All values are read from Product Master; this module never changes a barcode or SKU.
import QRCode from './vendor/qr/index.js';
import {CODE128_PATTERNS} from './voucher-codes-data.js';

export const PRODUCT_LABEL_COLUMNS=3;
export const PRODUCT_LABEL_ROWS=4;
export const PRODUCT_LABELS_PER_PAGE=PRODUCT_LABEL_COLUMNS*PRODUCT_LABEL_ROWS;
export const PRODUCT_LABEL_PRINT_LIMIT=1000;

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,character=>({
 '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
})[character]);
const svgUrl=svg=>'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg);
const validSku=value=>typeof value==='string'&&/^[\x21-\x7e]{1,64}$/.test(value);
const validBarcode=value=>typeof value==='string'&&/^[\x20-\x7e]{1,100}$/.test(value)&&value.trim().length>0;

export function productLabelIssue(product){
 if(!product||!validSku(product.sku))return 'SKU is missing or cannot be encoded as QR';
 if(!validBarcode(product.barcode))return 'Product barcode is missing or cannot be encoded as Code 128';
 if(!String(product.product_name??'').trim())return 'Product Name is missing';
 return null;
}

export function productSkuQrSvg(sku){
 if(!validSku(sku))throw new Error('INVALID_PRODUCT_SKU_FOR_QR');
 const qr=new QRCode(0,0);
 qr.addData(sku);qr.make();
 const n=qr.getModuleCount(),quiet=4;
 let rectangles='';
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(qr.isDark(y,x))rectangles+=`M${x+quiet} ${y+quiet}h1v1h-1z`;
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n+quiet*2} ${n+quiet*2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${rectangles}" fill="#111"/></svg>`;
}

export function productCode128Svg(barcode){
 if(!validBarcode(barcode))throw new Error('INVALID_PRODUCT_BARCODE_FOR_CODE128');
 // Code 128 subset B supports every printable ASCII character without case changes.
 // Start B, data symbols, modulo-103 weighted checksum, STOP.
 const symbols=[104,...Array.from(barcode,character=>character.charCodeAt(0)-32)];
 let checksum=104;
 for(let i=1;i<symbols.length;i++)checksum+=i*symbols[i];
 symbols.push(checksum%103,106);
 let x=10;let bars='';
 for(const symbol of symbols){
  const pattern=CODE128_PATTERNS[symbol];
  if(!pattern)throw new Error('INVALID_CODE128_PATTERN');
  for(const character of pattern){
   const width=character.toLowerCase().charCodeAt(0)-96;
   if(character>='A'&&character<='Z')bars+=`<rect x="${x}" y="0" width="${width}" height="52"/>`;
   x+=width;
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${x+10} 52" preserveAspectRatio="none" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#111">${bars}</g></svg>`;
}

export function createProductLabel(product){
 const error=productLabelIssue(product);
 if(error)throw new Error(`PRODUCT_LABEL_INVALID: ${error} (${String(product?.sku??'Unknown SKU')})`);
 return {
  id:String(product.id),
  sku:product.sku,
  barcode:product.barcode,
  name:String(product.product_name),
  qr:svgUrl(productSkuQrSvg(product.sku)),
  code128:svgUrl(productCode128Svg(product.barcode))
 };
}

export function selectedProductLabels(products){
 if(!Array.isArray(products)||products.length===0)throw new Error('SELECT_PRODUCTS_TO_PRINT');
 if(products.length>PRODUCT_LABEL_PRINT_LIMIT)throw new Error(`MAXIMUM_${PRODUCT_LABEL_PRINT_LIMIT}_PRODUCT_LABELS_PER_JOB`);
 const seen=new Set();
 for(const p of products){
  if(seen.has(String(p.id)))throw new Error('DUPLICATE_PRODUCT_IN_LABEL_SELECTION');
  seen.add(String(p.id));
  const issue=productLabelIssue(p);
  if(issue)throw new Error(`${issue}: ${String(p?.sku??'Unknown SKU')}`);
 }
 return products.map(createProductLabel);
}

function renderLabel(label){
 return `<article class="label"><img class="qr" src="${label.qr}" alt="QR for SKU"/><div class="sku">SKU: ${escapeHtml(label.sku)}</div><img class="barcode" src="${label.code128}" alt="Code 128 product barcode"/><div class="barcode-text">${escapeHtml(label.barcode)}</div><div class="name">${escapeHtml(label.name)}</div></article>`;
}

export function buildProductLabelPrintHtml(products,businessName='TPOS V2'){
 const labels=selectedProductLabels(products);
 const pages=[];
 for(let i=0;i<labels.length;i+=PRODUCT_LABELS_PER_PAGE){
  pages.push(`<section class="sheet">${labels.slice(i,i+PRODUCT_LABELS_PER_PAGE).map(renderLabel).join('')}</section>`);
 }
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(businessName)} — Product QR / Barcode Labels</title><style>
 @page{size:A4 portrait;margin:0}
 *{box-sizing:border-box}
 html,body{margin:0;padding:0;color:#101010;background:#fff;font-family:Arial,Helvetica,sans-serif}
 .sheet{width:210mm;height:297mm;padding:11mm;display:grid;grid-template-columns:repeat(3,60mm);grid-template-rows:repeat(4,65mm);gap:4mm;break-after:page;page-break-after:always;overflow:hidden}
 .sheet:last-of-type{break-after:auto;page-break-after:auto}
 .label{width:60mm;height:65mm;border:.2mm dashed #b9bec8;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:0;padding:2mm 1.5mm 1mm;overflow:hidden;text-align:center;page-break-inside:avoid;break-inside:avoid}
 .qr{width:29mm;height:29mm;object-fit:contain;image-rendering:pixelated;flex:none}
 .sku{font-size:8.5pt;font-weight:700;line-height:4.5mm;height:4.5mm;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
 .barcode{width:52mm;height:12mm;display:block;flex:none}
 .barcode-text{font-size:8pt;font-weight:700;line-height:4.5mm;height:4.5mm;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;letter-spacing:.03em}
 .name{width:100%;height:10mm;min-height:0;line-height:5mm;font-size:9pt;font-weight:800;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
 @media screen{body{background:#edf0f4}.sheet{margin:12px auto;background:white;box-shadow:0 4px 14px #0002}}
 @media print{html,body{background:white}.sheet{margin:0;box-shadow:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
 </style></head><body>${pages.join('')}</body></html>`;
}
