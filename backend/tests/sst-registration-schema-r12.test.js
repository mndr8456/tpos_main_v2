import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {classifySstRegistrationColumns,ensureSstRegistrationColumns} from '../src/sst-registration-schema.js';

const expected = ['sst_sales_tax_number','sst_service_tax_number'];
const row = name => ({COLUMN_NAME:name,DATA_TYPE:'varchar',CHARACTER_MAXIMUM_LENGTH:80,IS_NULLABLE:'YES'});

function fakePool(initial = []) {
  const columns = new Set(initial);
  const sql = [];
  return {
    sql,
    async execute(query) {
      sql.push(query);
      assert.match(query, /information_schema\.COLUMNS/);
      return [Array.from(columns, row)];
    },
    async query(query) {
      sql.push(query);
      assert.match(query, /^ALTER TABLE company_registrations /);
      for (const name of expected) if (query.includes(`\`${name}\``)) columns.add(name);
      return [{affectedRows:0}];
    }
  };
}

test('R1.2 detects the exact two columns missing from a legacy tenant instead of falsely reporting CURRENT', () => {
  assert.deepEqual(classifySstRegistrationColumns([]).missingColumns,expected);
  assert.deepEqual(classifySstRegistrationColumns([row(expected[0])]).missingColumns,[expected[1]]);
  assert.deepEqual(classifySstRegistrationColumns(expected.map(row)).missingColumns,[]);
});

test('R1.2 read-only check never changes an existing tenant', async () => {
  const pool = fakePool([]);
  const result = await ensureSstRegistrationColumns(pool);
  assert.deepEqual(result.missingColumns,expected);
  assert.equal(result.changed,false);
  assert.equal(pool.sql.filter(x=>x.startsWith('ALTER')).length,0);
});

test('R1.2 --apply adds missing columns exactly once without dropping or overwriting registrations', async () => {
  const pool = fakePool([]);
  const result = await ensureSstRegistrationColumns(pool,{apply:true});
  assert.equal(result.changed,true);
  assert.deepEqual(result.missingColumns,[]);
  const alter=pool.sql.find(x=>x.startsWith('ALTER'));
  assert.match(alter,/ADD COLUMN `sst_sales_tax_number` VARCHAR\(80\) NULL/);
  assert.match(alter,/ADD COLUMN `sst_service_tax_number` VARCHAR\(80\) NULL/);
  assert.doesNotMatch(alter,/\bDROP\b|\bUPDATE\b|\bDELETE\b|\bTRUNCATE\b/i);
  const twice=await ensureSstRegistrationColumns(pool,{apply:true});
  assert.equal(twice.changed,false);
  assert.equal(pool.sql.filter(x=>x.startsWith('ALTER')).length,1);
});

test('R1.2 repairs only the absent field, preserving an existing SST registration field', async () => {
  const pool = fakePool(['sst_service_tax_number']);
  const out = await ensureSstRegistrationColumns(pool,{apply:true});
  assert.equal(out.changed,true);
  const alter=pool.sql.find(x=>x.startsWith('ALTER'));
  assert.match(alter,/`sst_sales_tax_number`/);
  assert.doesNotMatch(alter,/`sst_service_tax_number`/);
});

test('R1.2 rejects incompatible registration fields instead of silently altering them', async () => {
  const pool={execute:async()=>[[{...row(expected[0]),DATA_TYPE:'int'},row(expected[1])]],query:()=>{throw Error('DDL_NOT_ALLOWED');}};
  await assert.rejects(ensureSstRegistrationColumns(pool,{apply:true}),/SST_REGISTRATION_COLUMNS_INCOMPATIBLE/);
});

test('R1.2 does not falsely claim success if ALTER fails or the repair remains incomplete', async () => {
  const pool=fakePool([]);
  pool.query=async()=>{const err=new Error('No ALTER grant');err.code='ER_TABLEACCESS_DENIED_ERROR';throw err;};
  await assert.rejects(ensureSstRegistrationColumns(pool,{apply:true}),/No ALTER grant/);
  const racePool=fakePool([]);
  racePool.query=async()=>{const err=new Error('Concurrent column addition');err.code='ER_DUP_FIELDNAME';throw err;};
  await assert.rejects(ensureSstRegistrationColumns(racePool,{apply:true}),/SST_REGISTRATION_COLUMNS_REPAIR_INCOMPLETE/);
});

test('R1.2 installer checks missing registration columns and validates tenant DB identity',()=>{
  const src=readFileSync(new URL('../scripts/setup-sst-settings.js',import.meta.url),'utf8');
  assert.match(src,/ensureSstRegistrationColumns\(pool, \{apply\}\)/);
  assert.match(src,/tenantDatabase\(tenant.id\)/);
  assert.match(src,/missingRegistrationColumns/);
  assert.match(src,/status = missing \? 'MISSING'/);
  assert.doesNotMatch(src,/DROP\s+TABLE|TRUNCATE\s+TABLE|DELETE\s+FROM/i);
});
