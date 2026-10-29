import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseSupplierCsv,supplierCsvTemplate } from '../src/suppliers-csv.js';
const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const head='supplier_name,contact_name,phone_no,email,address,status\r\n';
test('V1 Supplier CSV header and six fields remain compatible',()=>{
 assert.match(supplierCsvTemplate(),/supplier_name,contact_name,phone_no,email,address,status/);
 const [r]=parseSupplierCsv(supplierCsvTemplate());
 assert.equal(r.data.supplierName,'ABC Trading Sdn Bhd');
 assert.equal(r.data.status,'ACTIVE');
});
test('Supplier CSV supports BOM, CRLF, quoted commas and normalized email/status',()=>{
 const [r]=parseSupplierCsv('\uFEFF'+head+'Alpha Limited,Jane,019-777-9999,JANE@EXAMPLE.COM,"Lot 1, Road 2",inactive\r\n');
 assert.equal(r.data.email,'jane@example.com');assert.equal(r.data.address,'Lot 1, Road 2');assert.equal(r.data.status,'INACTIVE');
});
test('Supplier CSV rejects malformed quoting and wrong headers',()=>{
 for(const text of ['name,phone\nAlpha,0123\n',head+'"Unclosed,Jane,,,,ACTIVE\n',head+'A"quoted,B,1,a@b.com,c,ACTIVE\n'])assert.throws(()=>parseSupplierCsv(text));
});
test('Supplier CSV rejects empty files, oversized files and more than 200 rows',()=>{
 assert.throws(()=>parseSupplierCsv(head));
 assert.throws(()=>parseSupplierCsv(head+'Z'.repeat(300000)));
 assert.throws(()=>parseSupplierCsv(head+'Alpha,,,,,ACTIVE\n'.repeat(201)));
});
test('Supplier CSV rejects duplicate names and invalid email/status',()=>{
 const rows=parseSupplierCsv(head+'ACME,,,,,ACTIVE\nacme,,,,,ACTIVE\n');
 assert.equal(rows[1].error,'DUPLICATE_IN_FILE');
 assert.equal(parseSupplierCsv(head+'Bad,,,invalid-email,,ACTIVE\n')[0].error,'SUPPLIER_VALIDATION_ERROR');
 assert.equal(parseSupplierCsv(head+'Bad,,,,,EXPIRED\n')[0].error,'SUPPLIER_VALIDATION_ERROR');
});
test('Supplier has separate idempotent SQL, soft archive, unique name, audit, explicit grants',async()=>{
 const sql=await read('database/006_tenant_suppliers.sql');
 for(const table of ['suppliers','supplier_audit_logs'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`,'i'));
 assert.match(sql,/UNIQUE KEY uq_supplier_active_name/);
 assert.match(sql,/supplier_code VARCHAR/);
 for(const key of ['view','create','update','delete','import','export','audit'])assert.ok(sql.includes(`suppliers.${key}`));
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
});
test('Supplier API routes require auth and separate permissions',async()=>{
 const app=await read('backend/src/app.js');
 for(const key of ['view','create','update','delete','import','export','audit'])assert.match(app,new RegExp(`permitted\\('suppliers\\.${key}'\\)`));
 assert.match(app,/app\.post\('\/api\/v2\/suppliers\/import\/preview'/);
 assert.match(app,/app\.delete\('\/api\/v2\/suppliers\/:id'/);
});
test('Supplier imports use read-only preview, atomic DB transaction and audit',async()=>{
 const source=await read('backend/src/suppliers.js');
 const preview=source.slice(source.indexOf('export async function previewSupplierImport'),source.indexOf('export async function importSuppliers'));
 assert.doesNotMatch(preview,/INSERT INTO|UPDATE suppliers|beginTransaction/);
 assert.match(source,/await conn\.beginTransaction\(\)/);
 assert.match(source,/await conn\.rollback\(\)/);
 assert.match(source,/SUPPLIER_IMPORT/);
 assert.match(source,/UPDATE suppliers SET is_deleted=1/);
 assert.match(source,/SUPPLIER_DUPLICATE/);
});
test('New tenant provisioning and existing tenant installer both include Supplier SQL',async()=>{
 const [tenants,setup]=await Promise.all([read('backend/src/tenants.js'),read('backend/scripts/setup-suppliers.js')]);
 assert.match(tenants,/executeSchema\(dbName,'006_tenant_suppliers.sql'\)/);
 assert.match(setup,/process\.argv\.includes\('--apply'\)/);
 assert.match(setup,/status='ACTIVE'/);
 assert.match(setup,/CURRENT/);
});
test('Supplier UI has icons, live search, import preview, PDF business name, no report copyright',async()=>{
 const [page,app]=await Promise.all([read('frontend/src/Suppliers.jsx'),read('frontend/src/App.jsx')]);
 for(const action of ['Add Supplier','Edit','Archive','Supplier Activity Log','Import Suppliers CSV','Export Suppliers CSV','Print or Save Suppliers PDF','Refresh Suppliers','Preview Import','Confirm Import'])assert.ok(page.includes(action),action);
 assert.match(page,/onChange=\{e=>setQuery\(e.target.value\)\}/);
 assert.match(page,/profile\.business\?\.name/);
 assert.doesNotMatch(page,/© 2026|MNII Alpha Ent/);
 assert.match(page,/<IconAction icon=\{Printer\}/);
 assert.match(app,/page==='suppliers'&&canViewSuppliers\?<Suppliers/);
});
