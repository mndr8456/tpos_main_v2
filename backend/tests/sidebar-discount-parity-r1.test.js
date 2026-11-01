import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const app=readFileSync(new URL('../../frontend/src/App.jsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../../frontend/src/style.css',import.meta.url),'utf8');
const discount=readFileSync(new URL('../../frontend/src/Discounts.jsx',import.meta.url),'utf8');
const pdf=readFileSync(new URL('../../frontend/src/discount-pdf.js',import.meta.url),'utf8');
const appRoutes=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

test('V1 master data order is retained for implemented modules (excluding loyalty)',()=>{
 const master=app.slice(app.indexOf("title:'Master Data'"),app.indexOf("title:'Transactions'"));
 const names=['users','categories','products','suppliers','vouchers','discounts','cash-shifts'];
 const indices=names.map(id=>master.indexOf(`id:'${id}'`));
 assert.ok(indices.every(n=>n>=0));
 assert.deepEqual(indices,[...indices].sort((a,b)=>a-b));
 assert.doesNotMatch(master,/loyalty|Customers.*disabled/);
});
test('V1 navigation groups show only allowed implemented pages, and Dashboard follows grants',()=>{
 assert.match(app,/title:'Transactions'/);
 assert.match(app,/title:'Settings'/);
 assert.match(app,/entries:group\.entries\.filter\(entry=>entry\.show\)/);
 assert.match(app,/canViewDashboard&&navItem/);
 assert.match(app,/aria-current=\{page===entry\.id\?'page'/);
 assert.match(app,/openNavGroups/);
});
test('desktop sidebar is fixed to viewport, pushes content, closes on outside click; mobile overlay remains',()=>{
 assert.match(css,/\.workspace \.sidebar\.open\{width:258px/);
 assert.match(css,/\.workspace \.sidebar\{display:block;position:fixed;top:0;left:0;bottom:0/);
 assert.match(css,/height:100vh;height:100dvh/);
 assert.doesNotMatch(css,/\.workspace \.sidebar \{position:sticky/);
 assert.match(css,/\.workspace\.sidebar-expanded \.main-column\{margin-left:258px/);
 assert.match(css,/\.workspace\.sidebar-expanded \.main-column\{margin-left:0/);
 assert.match(css,/@media\(max-width:900px\)/);
 assert.match(css,/\.workspace \.sidebar-scrim\{display:none/);
 assert.match(css,/\.workspace \.sidebar-scrim\{display:block/);
 assert.match(app,/document\.addEventListener\('pointerdown',onOutside\)/);
 assert.match(app,/document\.removeEventListener\('pointerdown',onOutside\)/);
 assert.match(app,/target\?\.closest\?\.\('#workspace-navigation, \[data-sidebar-toggle\]'\)/);
 assert.match(app,/data-sidebar-toggle aria-controls="workspace-navigation"/);
 assert.match(app,/inert=\{!sidebar\}/);
 assert.match(app,/setSidebar\(current=>!current\)/);
});
test('Discount forms and table use accepted Voucher UI patterns without replacing Discount business rules',()=>{
 for(const token of ['voucher-dialog','voucher-section','voucher-target-picker','voucher-target-list','voucher-view-grid','voucher-row-actions','voucher-table-scroll','voucher-footer'])assert.ok(discount.includes(token),token);
 assert.match(discount, /<button type="submit" className="primary" disabled=\{busy\}><Save size=\{18\}\/>/);
 assert.match(discount, /'Valid From','Valid Until'/);
 assert.match(discount, /'Discount Code','Name'/);
 assert.match(css,/\.discount-dialog\.voucher-dialog\{width:min\(950px,100%\)/);
 assert.match(css,/\.discount-table-scroll\.voucher-table-scroll table\{min-width:1260px/);
 assert.match(discount,/allowed\('discounts\.calculate'\)/);
 assert.match(discount,/allowed\('discounts\.delete'\)/);
});
test('Discount matches Voucher action pattern with view preview edit status and archive',()=>{
 for(const role of ['discounts.calculate','discounts.update','discounts.delete'])assert.ok(discount.includes(role));
 assert.match(discount,/switchStatus\(d\)/);
 assert.match(discount,/\?X:CheckCircle2/);
 assert.match(discount,/Activate.*discount_name/);
 assert.match(appRoutes,/discountOwnerAdminOnly,discountStatus/);
 assert.match(discount,/Refresh Discounts/);
});
test('Discount retains CSV Preview & Confirm and exports a downloadable PDF report',()=>{
 assert.match(discount,/discounts\/import\/preview/);
 assert.match(discount,/discounts\/import'/);
 assert.match(discount,/Export Discounts CSV/);
 assert.match(discount,/Download Discounts PDF/);
 assert.match(discount,/generateDiscountPdf\(filtered,/);
 assert.match(pdf,/buildPdfFromJpegs/);
 assert.match(pdf,/generateDiscountPdf/);
 assert.doesNotMatch(pdf,/fetch\(|XMLHttpRequest/);
});
test('discount PDF has bounded page lengths and uses tenant business label',()=>{
 assert.match(pdf,/PDF_EXPORT_LIMIT_1000/);
 assert.match(pdf,/perPage=20/);
 assert.match(pdf,/drawDiscountReportPage\(ctx,/);
 assert.match(discount,/profile\.business\?\.name/);
});
