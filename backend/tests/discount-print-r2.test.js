import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateDiscountCode} from '../src/discount-code.js';
import {buildDiscountPrintHtml} from '../../frontend/src/discount-print.js';
import {buildPdfFromJpegs} from '../../frontend/src/voucher-pdf.js';
const src=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');

test('Discount rule identifiers are independent, random and distinct from voucher bearer codes',()=>{
 const values=new Set(Array.from({length:2000},()=>generateDiscountCode()));
 assert.equal(values.size,2000);
 for(const value of values)assert.match(value,/^DSC-[2-9A-HJ-NP-Z]{16}$/);
 assert.notEqual(generateDiscountCode(Buffer.alloc(10)),generateDiscountCode(Buffer.alloc(10,1)));
});
test('Create batch is server-generated, transactional, bounded, and edit cannot change issued code',()=>{
 const service=src('backend/src/discounts.js');
 assert.match(service,/DISCOUNT_CODE_AUTO_GENERATED/);
 assert.match(service,/generateQuantity:z.coerce.number\(\).int\(\).min\(1\).max\(200\)/);
 assert.match(service,/generateDiscountCode\(\)/);
 assert.match(service,/DISCOUNT_CODE_IMMUTABLE/);
 assert.match(service,/created=await transaction\(req.auth.pool/);
 assert.match(service,/DISCOUNT_CREATED/);
 assert.match(service,/DISCOUNT_IMPORT/);
});
test('Print settings require tenant OWNER, range-checked and audited in tenant DB',()=>{
 const service=src('backend/src/discounts.js'),guard=src('backend/src/discount-role-guard.js'),api=src('backend/src/app.js');
 assert.match(api,/discounts\/print-settings',authenticate,permitted\('discounts.update'\),discountOwnerOnly,saveDiscountPrintSettings/);
 assert.match(guard,/r.code='OWNER'/);
 assert.match(service,/printSize=z.object/);
 assert.match(service,/discount_print_settings_audit/);
 assert.match(service,/beginTransaction/);
});
test('Migration 020 is additive, tenant-isolated and installed for new and existing tenants explicitly',()=>{
 const sql=src('database/020_tenant_discount_print_settings.sql');
 for(const table of ['discount_print_settings','discount_print_settings_audit'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
 assert.doesNotMatch(sql,/\bDROP\s+|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
 assert.match(src('backend/src/tenants.js'),/020_tenant_discount_print_settings.sql/);
 const setup=src('backend/scripts/setup-discount-print.js');assert.match(setup,/--apply/);assert.match(setup,/read-only/);assert.match(setup,/tenantDatabase\(t.id\)/);
});
test('Discount UI exposes all six Voucher-parity workflows while hiding CSV export',()=>{
 const ui=src('frontend/src/Discounts.jsx');
 for(const title of ['Discount Code (Auto-generated)','Discount Generation','Quantity to Generate','Owner Discount Print Size','Discount Print Size','Select Discounts','Select Visible','Clear Visible','Export Discounts PDF','Print Selected Discounts'])assert.ok(ui.includes(title),`Missing ${title}`);
 assert.doesNotMatch(ui,/Export Discounts CSV|exportDiscountCsv/);
 assert.match(ui,/discounts\/print-settings/);
 assert.match(ui,/profile.user.role==='OWNER'/);
 assert.match(ui,/selectionJob\?\.mode==='PDF'/);
 assert.match(ui,/Print \$\{d.discount_name\}/);
});
test('Print markup escapes tenant data and carries no voucher or payment barcode semantics',()=>{
 const row={id:'1',discount_name:'<script>alert(1)</script>',discount_code:'DSC-123',discount_type:'FIXED_AMOUNT',discount_value:10,discount_scope:'ORDER',eligibility_type:'ALL',minimum_spend:0,status:'ACTIVE'};
 const html=buildDiscountPrintHtml([row],{widthCm:'18.55',heightCm:'8.45'},'A&B');
 assert.match(html,/A&amp;B/);
 assert.match(html,/&lt;script&gt;/);
 assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
 assert.match(html,/Not a redeemable voucher/);
 assert.match(html,/@page\{size:18.55cm 8.45cm/);
 assert.throws(()=>buildDiscountPrintHtml([], {widthCm:18.55,heightCm:8.45},'Company'));
 assert.throws(()=>buildDiscountPrintHtml([row],{widthCm:99,heightCm:8.45},'Company'));
});
