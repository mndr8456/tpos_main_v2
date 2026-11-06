import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const src=async p=>readFile(new URL(`../../${p}`,import.meta.url),'utf8');

test('POS UI selects Food & Beverage versus Retail using approved tenant business types',async()=>{
 const ui=await src('frontend/src/PosTerminal.jsx');
 assert.match(ui,/FNB_TYPES=new Set\(\['RESTAURANT','CAFE','FOOD_TRUCK','STREET_FOOD'\]\)/);
 assert.match(ui,/TABLE_TYPES=new Set\(\['RESTAURANT','CAFE'\]\)/);
 assert.match(ui,/getPosBusinessMode\(profile\?\.business\?\.type\)/);
 assert.match(ui,/data-pos-mode=\{businessMode\.mode\}/);
 assert.match(ui,/isFnb\?'Menu & Products':'Products'/);
 assert.match(ui,/Restaurant Table \/ Dine In/);
});

test('POS grid uses real categories, product images, barcode scan and branch prices',async()=>{
 const ui=await src('frontend/src/PosTerminal.jsx');
 const backend=await src('backend/src/pos-drafts.js');
 assert.match(ui,/pos-product-tiles/);assert.match(ui,/pos-category-tabs/);
 assert.match(ui,/categoryMap/);assert.match(ui,/product_image_url/);
 assert.match(ui,/priceMap\.get\(String\(p\.id\)\)/);
 assert.match(ui,/found=bootstrap\.products\.find/);
 assert.match(backend,/FROM categories c WHERE c\.is_deleted=0 AND c\.status='ACTIVE'/);
 assert.match(backend,/product_branch_prices WHERE branch_id IN/);
 assert.match(backend,/branchPrices:branchPriceRows/);
 assert.match(backend,/const \{pool\}=req\.auth/);
 assert.doesNotMatch(backend,/req\.headers\[['"]x-tenant/);
});

test('POS checkout remains protected while Dine In has a dedicated table adapter',async()=>{
 const ui=await src('frontend/src/PosTerminal.jsx');
 const backend=await src('backend/src/pos-drafts.js');
 assert.match(await src('frontend/src/PosMultiPayment.jsx'),/pos-payment-methods/);
 assert.match(await src('frontend/src/PosMultiPayment.jsx'),/SARA\/MyKasih and automatic provider transactions require a certified provider connection/);
 assert.match(ui,/Select Dine In Table/);
 assert.match(backend,/POS_DINE_IN_TABLE_REQUIRED/);
 assert.match(backend,/POS_TABLE_NOT_AVAILABLE/);
 assert.match(backend,/assignPosTable/);
 assert.match(backend,/POS_TABLE_OCCUPIED/);
 assert.match(backend,/checkoutAvailable:false/);
 assert.doesNotMatch(backend,/INSERT INTO (?:sales|pos_sales|cash_shift_movements)/i);
});

test('POS UI is responsive, topbar-bound and does not replace already accepted modules',async()=>{
 const css=await src('frontend/src/PosTerminal.css');
 const ui=await src('frontend/src/PosTerminal.jsx');
 assert.match(css,/max-width:1700px/);assert.match(css,/min-width:0/);
 for(const n of [1260,1010,800,550])assert.ok(css.includes(`max-width:${n}px`));
 assert.match(css,/position:sticky/);assert.match(css,/pos-terminal-layout/);
 assert.match(ui,/refreshPage\(load,notify\)/);
});
