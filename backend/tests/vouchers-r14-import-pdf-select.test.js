import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {selectUniqueVouchers,buildPdfFromJpegs} from '../../frontend/src/voucher-pdf.js';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const ui=readFileSync(resolve(project,'frontend/src/Vouchers.jsx'),'utf8');
const css=readFileSync(resolve(project,'frontend/src/style.css'),'utf8');

test('Voucher R1.4 Import renders a real modal with template, Preview, Confirm and row errors',()=>{
 assert.match(ui,/function VoucherImport\(/);
 assert.match(ui,/\/vouchers\/import\/template/);
 assert.match(ui,/\/vouchers\/import\/preview/);
 assert.match(ui,/\/vouchers\/import['`]/);
 assert.match(ui,/Confirm Import/);
 assert.match(ui,/preview\.valid/);
 assert.match(ui,/voucher-import-error/);
});

test('Voucher R1.4 print selects unique issued codes and does not multiply barcode copies',()=>{
 const rows=[{id:1,voucher_code:'VCH-AAA'},{id:2,voucher_code:'VCH-BBB'},{id:3,voucher_code:'VCH-AAA'},{id:4,voucher_code:'VCH-CCC'}];
 const selected=selectUniqueVouchers(rows,[1,2,3,4]);
 assert.deepEqual(selected.map(v=>v.voucher_code),['VCH-AAA','VCH-BBB','VCH-CCC']);
 assert.match(ui,/function SelectVoucherDialog\(/);
 assert.match(ui,/Select Visible/);
 assert.match(ui,/unique vouchers selected/);
 assert.doesNotMatch(ui,/function PrintJobDialog\(|Copies/);
 assert.match(ui,/runPrintVouchers\(vouchers\)/);
});

test('Voucher R1.4 Export downloads a real application PDF as voucher-sized pages',async()=>{
 assert.match(ui,/generateVoucherPdf\(vouchers,settings,businessName\)/);
 assert.match(ui,/Export Vouchers PDF/);
 assert.match(ui,/\.pdf`/);
 assert.doesNotMatch(ui,/function exportCsv\(/);
 const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
 const page={jpeg,pixelWidth:50,pixelHeight:50,widthPt:525.827,heightPt:239.528};
 const blob=buildPdfFromJpegs([page,page]);
 const pdf=new TextDecoder().decode(await blob.arrayBuffer());
 assert.ok(pdf.startsWith('%PDF-1.4'));
 assert.match(pdf,/\/Count 2/);
 assert.match(pdf,/525\.827 239\.528/);
 assert.match(pdf,/%%EOF/);
});

test('Voucher R1.4 brand and Valid appear in View and printable voucher under barcode',()=>{
 assert.match(ui,/profile\?\.business\?\.name/);
 assert.match(ui,/voucher-print-brand">\{businessName/);
 assert.match(ui,/voucher-print-code">\{voucher\.voucher_code\}<\/strong><p className="voucher-print-date">Valid:/);
 assert.match(ui,/<div class="code">\$\{safe\(voucher\.voucher_code\)\}<\/div><div class="date">\$\{date\}/);
 assert.match(css,/\.voucher-print-date\{[^}]*text-align:center/);
});

test('Voucher R1.4 print HTML renders one unique voucher sheet per selected code',async()=>{
 const {qrSvg,barcodeSvg,svgData}=await import('../../frontend/src/voucher-codes.js');
 const extract=ui.match(/function buildPrintHtml\([\s\S]*?\n}\n(?=function VoucherView)/)?.[0];
 assert.ok(extract,'Printable HTML function must exist');
 const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dt=v=>String(v||'').slice(0,16).replace(' ','T');
 const labelDiscount=v=>`RM ${Number(v.discount_value).toFixed(2)}`;
 const build=Function('svgData','qrSvg','barcodeSvg','safe','dt','labelDiscount',`${extract}\nreturn buildPrintHtml;`)(svgData,qrSvg,barcodeSvg,safe,dt,labelDiscount);
 const items=[
  {id:1,voucher_code:'VCH-AAAA00001111',voucher_name:'Voucher 1',description:'',discount_type:'FIXED_AMOUNT',discount_value:'10',starts_at:'2026-11-01 00:01',ends_at:'2026-11-30 23:59'},
  {id:2,voucher_code:'VCH-BBBB00002222',voucher_name:'Voucher 2',description:'',discount_type:'FIXED_AMOUNT',discount_value:'20',starts_at:'2026-11-01 00:01',ends_at:'2026-11-30 23:59'},
  {id:3,voucher_code:'VCH-AAAA00001111',voucher_name:'Duplicate',description:'',discount_type:'FIXED_AMOUNT',discount_value:'10',starts_at:'2026-11-01 00:01',ends_at:'2026-11-30 23:59'}
 ];
 const html=build(selectUniqueVouchers(items,[1,2,3]),{widthCm:'18.55',heightCm:'8.45'},'Business & Company');
 assert.equal((html.match(/<section class="sheet">/g)||[]).length,2);
 assert.match(html,/@page\{size:18\.55cm 8\.45cm/);
 assert.match(html,/Business &amp; Company/);
 for(const code of ['VCH-AAAA00001111','VCH-BBBB00002222']){
  assert.equal((html.match(new RegExp(`<div class="code">${code}<\\/div>`,'g'))||[]).length,1);
 }
 assert.match(html,/<div class="date">Valid: 2026-11-01 00:01 – 2026-11-30 23:59<\/div>/);
});
