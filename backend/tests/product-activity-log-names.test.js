import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

// This isolated test runs the real endpoint function without requiring a live tenant MySQL server.
async function loadAuditHandler() {
 const backend = await read('backend/src/products.js');
 const start = backend.indexOf('export async function productAudit(req,res){');
 const end = backend.indexOf('function requireBranch(req,branchId)', start);
 assert.ok(start >= 0 && end > start, 'Product audit handler exists');
 const source = backend.slice(start, end).replace(/^export /, '');
 const sanitized = (value,canCost) => {
  if (canCost || value == null) return value;
  const copy = {...value}; delete copy.cost_price; delete copy.costPrice; return copy;
 };
 const fn = new Function('costAllowed','sanitizedAuditDetail', `${source}\nreturn productAudit;`);
 return fn(req => req.auth.user.permissions.includes('products.cost.view'),sanitized);
}

test('Product Activity Log joins product and user names within tenant, including archived products',async()=>{
 const handler = await loadAuditHandler();
 let sql = '';
 const req = {auth:{pool:{execute:async statement=>{
  sql = statement;
  return [[{
   id:42, product_id:574, product_name:'Nasi Goreng Special',
   actor_user_id:7, user_name:'Ahmad Bin Ali',
   action_type:'PRODUCT_IMPORT',previous_data:{cost_price:'3.00',sku:'PRD-000574'},
   next_data:{costPrice:'4.00',sku:'PRD-000574'},created_at:'2026-10-29 20:00:00'
  }]];
 }},user:{permissions:['products.audit']}}};
 let result;
 const res={json:payload=>{result=payload; return payload;}};
 await handler(req,res);
 assert.match(sql,/FROM product_audit_logs al/);
 assert.match(sql,/LEFT JOIN products p ON p\.id=al\.product_id/);
 assert.match(sql,/LEFT JOIN users u ON u\.id=al\.actor_user_id/);
 assert.match(sql,/p\.product_name/);
 assert.match(sql,/AS user_name/);
 assert.doesNotMatch(sql,/is_deleted\s*=\s*0/i);
 assert.equal(result.logs.length,1);
 assert.equal(result.logs[0].product_name,'Nasi Goreng Special');
 assert.equal(result.logs[0].user_name,'Ahmad Bin Ali');
 assert.equal(result.logs[0].product_id,'574');
 assert.equal(result.logs[0].previous_data.cost_price,undefined);
 assert.equal(result.logs[0].next_data.costPrice,undefined);
 assert.equal(result.logs[0].next_data.sku,'PRD-000574');
});

test('Product Activity Log displays names and accurate per-action attribution without disturbing Edit/View',async()=>{
 const front = await read('frontend/src/Products.jsx');
 const section = front.slice(front.indexOf('Product Activity Log</h2>'));
 assert.ok(section.length > 0);
 assert.match(section,/<th>Product<\/th><th>Action By<\/th>/);
 assert.match(section,/x\.product_name/);
 assert.match(section,/x\.user_name/);
 assert.doesNotMatch(section,/\{x\.product_id\}|\{x\.actor_user_id\}|<th>Actor ID<\/th>|<th>Product ID<\/th>/);
 for(const [action,label] of [
  ['PRODUCT_CREATE','Created by'],['PRODUCT_IMPORT','Imported by'],
  ['PRODUCT_UPDATE','Updated by'],['PRODUCT_BRANCH_PRICE','Price updated by'],
  ['PRODUCT_ACTIVATE','Activated by'],['PRODUCT_DEACTIVATE','Deactivated by'],
  ['PRODUCT_ARCHIVE','Archived by']
 ]) assert.ok(front.includes(`${action}:'${label}'`),`${action} attribution`);
 assert.match(front,/icon=\{Pencil\}/);
 assert.match(front,/icon=\{Eye\}/);
 assert.match(front,/Branch Selling Prices/);
});
