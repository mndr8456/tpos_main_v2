import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCategoryCsv,categoryCsvTemplate } from '../src/categories-csv.js';
const read=async path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
test('CSV template has V1 headers plus default preparation station and status',()=>{
 assert.match(categoryCsvTemplate(),/category_name,description,default_preparation_station,status/);
 const rows=parseCategoryCsv(categoryCsvTemplate());assert.equal(rows.length,1);assert.equal(rows[0].data.stationCode,'DRINK');
});
test('CSV quoted comma, BOM, CRLF and case normalization',()=>{
 const rows=parseCategoryCsv('\uFEFFcategory_name,description,default_preparation_station,status\r\nBeverages,"Hot, cold and fresh",Drink,active\r\n');
 assert.equal(rows[0].data.description,'Hot, cold and fresh');assert.equal(rows[0].data.stationCode,'DRINK');assert.equal(rows[0].data.status,'ACTIVE');
});
test('CSV rejects malformed quotes, wrong headers, empty and oversize',()=>{
 for(const raw of ['a,b,c,d\n', 'category_name,description,default_preparation_station,status\n"oops,hi,DRINK,ACTIVE', 'category_name,description,default_preparation_station,status\n'+('X'.repeat(270000))])assert.throws(()=>parseCategoryCsv(raw));
});
test('CSV rejects invalid status, repeated name and invalid station code',()=>{
 const header='category_name,description,default_preparation_station,status\n';
 assert.equal(parseCategoryCsv(header+'Food,,Kitchen,something\n')[0].error,'CATEGORY_VALIDATION_ERROR');
 assert.equal(parseCategoryCsv(header+'Food,,Kitchen,ACTIVE\nfood,,DRINK,ACTIVE\n')[1].error,'DUPLICATE_IN_FILE');
 assert.equal(parseCategoryCsv(header+'Food,,bad station,ACTIVE\n')[0].error,'CATEGORY_VALIDATION_ERROR');
});
test('Category has dedicated tenant SQL, idempotent DDL, stations, permissions and audit',async()=>{
 const sql=await read('database/004_tenant_categories.sql');
 for(const table of ['categories','preparation_stations','category_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`,'i'));
 for(const permission of ['categories.view','categories.create','categories.update','categories.delete','categories.import','categories.export','categories.audit','categories.stations.manage'])assert.ok(sql.includes(permission));
 assert.doesNotMatch(sql,/\bDROP\s+|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
 assert.match(sql,/UNIQUE KEY uq_category_active_name/i);
});
test('New tenants provision 004 and existing tenants have explicit --apply installer',async()=>{
 const tenants=await read('backend/src/tenants.js'),setup=await read('backend/scripts/setup-categories.js');
 assert.match(tenants,/executeSchema\(dbName,'004_tenant_categories.sql'\)/);
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/status='ACTIVE'/);
});
test('Category routes enforce distinct permissions, including audit and station management',async()=>{
 const api=await read('backend/src/app.js');
 for(const perm of ['categories.view','categories.create','categories.update','categories.delete','categories.import','categories.audit','categories.stations.manage'])assert.ok(api.includes(`permitted('${perm}')`));
});
test('Category SQL keeps users and original foundation isolated',async()=>{
 const sql=await read('database/004_tenant_categories.sql');
 assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS users\b|CREATE TABLE IF NOT EXISTS login_directory\b/i);
});
test('Category preview is read-only, import and category edits use DB transactions and audit',async()=>{
 const src=await read('backend/src/categories.js');
 const preview=src.slice(src.indexOf('export async function previewCategoryImport'),src.indexOf('export async function importCategories'));
 assert.doesNotMatch(preview,/beginTransaction|INSERT INTO categories|DELETE FROM categories|UPDATE categories/);
 assert.match(src,/async function transaction\(pool,work\)/);
 assert.match(src,/await conn\.rollback\(\)/);
 assert.match(src,/await audit\(conn,req\.auth\.user\.id,'CATEGORY_IMPORT'/);
});
test('Category uses soft archive, duplicate guard and rejects inactive stations',async()=>{
 const src=await read('backend/src/categories.js');
 assert.match(src,/UPDATE categories SET is_deleted=1/);
 assert.match(src,/STATION_INACTIVE/);
 assert.match(src,/CATEGORY_DUPLICATE/);
 assert.match(src,/STATION_IN_USE/);
 assert.doesNotMatch(src,/DELETE FROM categories/i);
});
test('Category UI icon-only actions, automatic search and V1 station selection',async()=>{
 const src=await read('frontend/src/Categories.jsx');
 assert.match(src,/<IconAction icon=\{Plus\} label="Add Category"/);
 for(const action of ['Edit','Archive','Import Categories CSV','Export Categories CSV','Print or Save Categories PDF','Refresh Categories','Manage Preparation Stations','Category Activity Log'])assert.ok(src.includes(action),action);
 assert.match(src,/onChange=\{e=>setQuery\(e.target.value\)\}/);
 assert.match(src,/Preview Import/);assert.match(src,/Confirm Import/);
 assert.doesNotMatch(src,/window\.confirm/);
});
test('Category is mounted in sidebar, export is permissioned, and DELETE sends JSON',async()=>{
 const [ui,api,backend]=await Promise.all([read('frontend/src/App.jsx'),read('backend/src/app.js'),read('frontend/src/Categories.jsx')]);
 assert.match(ui,/page==='categories'&&canViewCategories/);
 assert.match(api,/\/categories\/export',authenticate,permitted\('categories.export'\)/);
 assert.match(backend,/method:'DELETE',body:\{\}/);
});
