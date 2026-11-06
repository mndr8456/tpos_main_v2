import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const files=[
 ['frontend/src/Products.jsx',['ProductCodeLabels','Generate Product Barcode and QR Labels','Refresh Products']],
 ['frontend/src/ProductCodeLabels.jsx',['Print A4 / Save PDF','buildProductLabelPrintHtml','Select valid only']],
 ['frontend/src/ProductCodeLabels.css',['product-code-preview-grid','product-code-dialog']],
 ['frontend/src/product-code-labels.js',['PRODUCT_LABELS_PER_PAGE','Code 128','A4 portrait']],
 ['backend/tests/product-label-codes-r1.test.js',['Print labels display QR SKU','Product toolbar and row action']],
 ['docs/products/PRODUCT_BARCODE_QR_A4_R1_INSTALL_TEST.md',['OWNER Live UI Acceptance']]
];
let failed=0;
for(const [relative,markers] of files){
 const filename=path.join(root,relative);
 let status='CURRENT',missingMarkers=[];
 if(!fs.existsSync(filename)){status='MISSING';missingMarkers=markers;failed++;}
 else {const text=fs.readFileSync(filename,'utf8');missingMarkers=markers.filter(marker=>!text.includes(marker));if(missingMarkers.length){failed++;status='OUTDATED';}}
 console.log(JSON.stringify({event:'product_label_r1_file',file:relative,status,missingMarkers}));
}
console.log(JSON.stringify({event:'product_label_r1_complete',projectRoot:root,files:files.length,failed}));
if(failed)process.exitCode=1;
