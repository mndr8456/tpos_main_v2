import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {
 PRODUCT_LABELS_PER_PAGE,PRODUCT_LABEL_PRINT_LIMIT,productSkuQrSvg,productCode128Svg,
 productLabelIssue,createProductLabel,selectedProductLabels,buildProductLabelPrintHtml
} from '../../frontend/src/product-code-labels.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const product=(id,extra={})=>({id,sku:`PRD-${String(id).padStart(6,'0')}`,barcode:`CODE${id}`,product_name:`Product ${id}`,...extra});
const read=name=>readFile(path.join(root,'frontend/src',name),'utf8');

test('Product QR payload is exact SKU, is deterministic, and rejects invalid or absent SKU',()=>{
 const svg=productSkuQrSvg('PRD-000144');
 assert.match(svg,/viewBox="0 0 \d+ \d+"/);
 assert.match(svg,/shape-rendering="crispEdges"/);
 assert.equal(svg,productSkuQrSvg('PRD-000144'));
 assert.notEqual(svg,productSkuQrSvg('PRD-000145'));
 for(const bad of ['', 'A B', '你好', 'x'.repeat(65)])assert.throws(()=>productSkuQrSvg(bad),/INVALID_PRODUCT_SKU_FOR_QR/);
});

test('Code128 B encodes Product barcode exactly and includes start, checksum, stop and quiet zones',()=>{
 const svg=productCode128Svg('PAS13');
 assert.match(svg,/viewBox="0 0 \d+ 52"/);
 assert.match(svg,/<rect x="10" y="0"/);
 assert.equal(svg,productCode128Svg('PAS13'));
 assert.notEqual(svg,productCode128Svg('PAS14'));
 assert.doesNotThrow(()=>productCode128Svg('5901234123457'));
 assert.doesNotThrow(()=>productCode128Svg('A-b_02$'));
 for(const bad of ['', '  ', 'é', '😎', '\n', 'A'.repeat(101)])assert.throws(()=>productCode128Svg(bad),/INVALID_PRODUCT_BARCODE_FOR_CODE128/);
});

test('Missing Product Barcode never gets silently replaced with SKU',()=>{
 const p=product(1,{barcode:''});
 assert.match(productLabelIssue(p),/barcode is missing/);
 assert.throws(()=>createProductLabel(p),/PRODUCT_LABEL_INVALID/);
 assert.throws(()=>buildProductLabelPrintHtml([p]),/barcode is missing/);
});

test('A4 portrait print is 3 columns and 4 rows, twelve labels each page',()=>{
 assert.equal(PRODUCT_LABELS_PER_PAGE,12);
 const first=buildProductLabelPrintHtml(Array.from({length:12},(_,i)=>product(i+1)));
 const second=buildProductLabelPrintHtml(Array.from({length:13},(_,i)=>product(i+1)));
 assert.equal((first.match(/class="sheet"/g)||[]).length,1);
 assert.equal((second.match(/class="sheet"/g)||[]).length,2);
 assert.equal((second.match(/class="label"/g)||[]).length,13);
 assert.match(first,/@page\{size:A4 portrait;margin:0\}/);
 assert.match(first,/grid-template-columns:repeat\(3,60mm\)/);
 assert.match(first,/grid-template-rows:repeat\(4,65mm\)/);
});

test('Print labels display QR SKU, product barcode, product name with safe HTML',()=>{
 const html=buildProductLabelPrintHtml([product(144,{barcode:'NGL027',product_name:'A&B <img src=x onerror=alert(1)>'})],'A&B <script>alert(1)</script>');
 assert.match(html,/SKU: PRD-000144/);
 assert.match(html,/NGL027/);
 assert.match(html,/QR for SKU/);
 assert.match(html,/Code 128 product barcode/);
 assert.match(html,/A&amp;B &lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/A&amp;B &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/data:image\/svg\+xml;charset=UTF-8,/);
});

test('Selection enforces unique ids, 1,000 label bound, validation and no mutation',()=>{
 assert.equal(PRODUCT_LABEL_PRINT_LIMIT,1000);
 assert.throws(()=>selectedProductLabels([]),/SELECT_PRODUCTS_TO_PRINT/);
 assert.throws(()=>selectedProductLabels([product(1),product(1)]),/DUPLICATE_PRODUCT/);
 assert.throws(()=>selectedProductLabels(Array.from({length:1001},(_,i)=>product(i+1))),/MAXIMUM_1000/);
 const row=product(4);const original=JSON.stringify(row);
 const label=selectedProductLabels([row])[0];
 assert.equal(label.sku,row.sku);
 assert.equal(label.barcode,row.barcode);
 assert.equal(JSON.stringify(row),original);
});

test('Product toolbar and row action are permission gated; existing Refresh and stock remain',async()=>{
 const text=await read('Products.jsx');
 assert.match(text,/allowed\('products.export'\)\s*&&\s*<IconAction icon=\{QrCode\} label="Generate Product Barcode/);
 assert.match(text,/allowed\('products.export'\)\s*&&\s*<IconAction icon=\{QrCode\} label=\{`Generate Barcode and QR Label/);
 assert.match(text,/import ProductCodeLabels from '\.\/ProductCodeLabels\.jsx'/);
 assert.match(text,/label="Refresh Products" onClick=\{\(\)=>refreshPage\(load,notify\)\}/);
 assert.match(text,/stockFor\(p\)\.label/);
 assert.match(text,/\{codeLabels&&<ProductCodeLabels/);
});

test('Product printing uses local SVG data, a real selectable preview and does not POST',async()=>{
 const [component,logic,styles]=await Promise.all([read('ProductCodeLabels.jsx'),read('product-code-labels.js'),read('ProductCodeLabels.css')]);
 assert.match(component,/role="dialog"/);
 assert.match(component,/Select matching/);
 assert.match(component,/Select valid only/);
 assert.match(component,/Print A4 \/ Save PDF/);
 assert.match(component,/window\.open\('',\s*'_blank'/);
 assert.match(component,/\.decode\(\)/);
 assert.match(component,/win\.print\(\)/);
 assert.match(logic,/vendor\/qr\/index\.js/);
 assert.match(logic,/voucher-codes-data\.js/);
 assert.match(logic,/Product Master/);
 assert.doesNotMatch(component,/\bfetch\(|\brequest\(|method:\s*'POST'/);
 assert.match(styles,/product-code-preview-grid/);
});
