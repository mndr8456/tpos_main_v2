// R2.3: View Discount must follow the accepted Voucher View card layout.
// This intentionally tests the view, not just the separate Print/PDF paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../frontend/src');
const discount=readFileSync(resolve(root,'Discounts.jsx'),'utf8');
const voucher=readFileSync(resolve(root,'Vouchers.jsx'),'utf8');

test('View Discount renders the same card and detail grid classes as accepted View Voucher',()=>{
 assert.match(voucher,/function VoucherView\(/);
 assert.match(voucher,/className="dialog wide voucher-view"/);
 assert.match(voucher,/className="voucher-print-card"/);
 assert.match(discount,/function DiscountView\(\{discount,settings,businessName,close,onPrint,canPrint\}\)/);
 assert.match(discount,/className="dialog wide voucher-view"/);
 assert.match(discount,/<DiscountCard discount=\{discount\} settings=\{settings\} businessName=\{businessName\}\/>/);
 assert.match(discount,/className="voucher-print-card"/);
 assert.match(discount,/className="voucher-view-grid"/);
 assert.doesNotMatch(discount,/className="discount-view-hero"/);
});

test('View Discount has barcode + QR for identical rule code, and uses OWNER print size',()=>{
 assert.match(discount,/import \{qrSvg,barcodeSvg,svgData\} from '\.\/discount-codes-render\.js'/);
 assert.match(discount,/const barcode=svgData\(barcodeSvg\(code\)\)/);
 assert.match(discount,/const qr=svgData\(qrSvg\(code\)\)/);
 assert.match(discount,/className="voucher-barcode"/);
 assert.match(discount,/className="voucher-qr"/);
 assert.match(discount,/aspectRatio:width\/height/);
 assert.match(discount,/settings\.widthCm/);
 assert.match(discount,/settings\.heightCm/);
 assert.match(discount,/Not redeemable/);
 assert.match(discount,/Print Discount<\/button>/);
 assert.match(discount,/canPrint&&/);
 assert.match(discount,/canPrint=\{allowed\('discounts\.export'\)\}/);
});
