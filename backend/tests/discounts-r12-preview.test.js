import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateDiscount} from '../src/discount-evaluation.js';

const read=relative=>readFile(new URL(`../../${relative}`,import.meta.url),'utf8');
const base={status:'ACTIVE',is_deleted:0,discount_type:'PERCENTAGE',discount_value:10,minimum_spend:0,maximum_discount_amount:null,start_date:null,end_date:null,usage_limit:null};
const evaluation={eligibleSubtotal:100,date:'2026-10-30',usageCount:0,eligible:true};

test('R1.2 calculation preview: percentage, capped amount and fixed discount cannot exceed subtotal',()=>{
 assert.deepEqual(evaluateDiscount(base,evaluation),{eligible:true,reason:'ELIGIBLE',amount:'10.00'});
 assert.equal(evaluateDiscount({...base,maximum_discount_amount:3.5},evaluation).amount,'3.50');
 assert.equal(evaluateDiscount({...base,discount_type:'FIXED_AMOUNT',discount_value:250},evaluation).amount,'100.00');
 assert.equal(evaluateDiscount({...base,discount_value:10},{...evaluation,eligibleSubtotal:19.95}).amount,'2.00');
});

test('R1.2 Usage Limit simulation is a calculation only, and real redemption count is not modified',()=>{
 const r={...base,usage_limit:2};
 assert.equal(evaluateDiscount(r,{...evaluation,usageCount:0}).eligible,true);
 assert.equal(evaluateDiscount(r,{...evaluation,usageCount:1}).eligible,true);
 assert.equal(evaluateDiscount(r,{...evaluation,usageCount:2}).reason,'USAGE_LIMIT_REACHED');
 assert.equal(evaluateDiscount(r,{...evaluation,usageCount:3}).reason,'USAGE_LIMIT_REACHED');
 assert.equal(evaluateDiscount(r,{...evaluation,usageCount:0}).eligible,true);
});

test('R1.2 Calculation Preview rejects inactive, out-of-date, ineligible product/category and minimum spend',()=>{
 assert.equal(evaluateDiscount({...base,status:'INACTIVE'},evaluation).reason,'DISCOUNT_INACTIVE');
 assert.equal(evaluateDiscount({...base,start_date:'2026-10-31'},evaluation).reason,'DISCOUNT_NOT_STARTED');
 assert.equal(evaluateDiscount({...base,end_date:'2026-10-29'},evaluation).reason,'DISCOUNT_EXPIRED');
 assert.equal(evaluateDiscount(base,{...evaluation,eligible:false}).reason,'TARGET_NOT_ELIGIBLE');
 assert.equal(evaluateDiscount({...base,minimum_spend:100.01},evaluation).reason,'MINIMUM_SPEND_NOT_MET');
});

test('R1.2 preview API validates optional simulated usage, uses tenant product lookup and never posts redemption',async()=>{
 const [service,app]=await Promise.all([read('backend/src/discounts.js'),read('backend/src/app.js')]);
 const preview=service.slice(service.indexOf('export async function previewDiscountCalculation'));
 assert.match(preview,/simulatedUsageCount:z\.number\(\)\.int\(\)\.min\(0\)\.max\(1000000000\)/);
 assert.match(preview,/evaluationUsageCount=simulatedUsageCount\?\?actualUsageCount/);
 assert.match(preview,/simulation:simulatedUsageCount!==null/);
 assert.match(preview,/posting:false/);
 assert.match(preview,/productId!=null/);
 assert.match(preview,/category_id,status,is_deleted FROM products/);
 assert.match(preview,/evaluateDiscount\(row,\{eligibleSubtotal,date,usageCount:evaluationUsageCount,eligible\}\)/);
 assert.doesNotMatch(preview,/\b(INSERT|UPDATE|DELETE|REPLACE)\b\s+(INTO|FROM|discounts|sales|discount_usage|orders)/i);
 assert.match(app,/app\.post\('\/api\/v2\/discounts\/:id\/preview-calculation',authenticate,permitted\('discounts\.calculate'\),discountOwnerAdminOnly,previewDiscountCalculation\)/);
});

test('R1.2 frontend presents permissioned preview action, server response and simulation-only indicators',async()=>{
 const [ui,css]=await Promise.all([read('frontend/src/Discounts.jsx'),read('frontend/src/style.css')]);
 for(const phrase of ['Preview Calculation','discount-calc-simulation','Simulate Usage Count (for testing only)','actualUsageCount','evaluationUsageCount','No transaction posted','setCalculation(d)','discounts/${discount.id}/preview-calculation'])assert.ok(ui.includes(phrase),phrase);
 assert.match(ui,/title=\{`Preview Calculation for \$\{d\.discount_name\}`\}/);
 assert.match(ui,/result\.eligible\?'Eligible':'Not Eligible'/);
 assert.match(css,/\.discount-calculator\{/);
});

test('R1.3 permission roles: only OWNER/ADMIN can calculate; read-only roles stay restricted',async()=>{
 const [sql,app,ui]=await Promise.all([read('database/009_tenant_discounts.sql'),read('backend/src/app.js'),read('frontend/src/Discounts.jsx')]);
 assert.match(sql,/r\.code IN \('OWNER','ADMIN'\)/);
 assert.match(sql,/r\.code='MANAGER'.*discounts\.update/); // Original R1 grants; migration 010 revokes elevated grants.
 assert.match(sql,/r\.code IN \('ACCOUNTANT','SUPERVISOR'\).*discounts\.view/);
 assert.doesNotMatch(sql,/r\.code='CASHIER'/);
 for(const perm of ['discounts.view','discounts.update','discounts.delete','discounts.import','discounts.export'])assert.match(app,new RegExp(`permitted\\('${perm.replace('.','\\.')}\\'\\)`));
 assert.match(ui,/allowed\('discounts\.calculate'\)/);
 assert.match(ui,/allowed\('discounts\.update'\)/);
 assert.match(ui,/allowed\('discounts\.delete'\)/);
});
