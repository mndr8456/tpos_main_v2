import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {normalizeStaffImportDate,normalizeStaffImportDates,describeStaffImportError} from '../src/staff-import-dates.js';

const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const source=path=>readFileSync(resolve(root,path),'utf8');

test('Malaysian Excel D/M/YYYY is converted to canonical ISO before the Add/Edit validator',()=>{
 assert.equal(normalizeStaffImportDate('1/2/2013'),'2013-02-01');
 assert.equal(normalizeStaffImportDate('30/4/2013'),'2013-04-30');
 assert.equal(normalizeStaffImportDate('01/01/2012'),'2012-01-01');
 assert.equal(normalizeStaffImportDate('2013-04-30'),'2013-04-30');
 assert.equal(normalizeStaffImportDate('29/2/2024'),'2024-02-29');
 assert.equal(normalizeStaffImportDate(''),undefined);
 assert.equal(normalizeStaffImportDate('   '),undefined);
});

test('All 11 example Excel date rows convert consistently for Import Preview',()=>{
 const rows=Array.from({length:11},(_,index)=>({
  join_date:`${index+1}/2/2013`,
  confirmation_date:`${index===0?30:index}/4/2013`,
 }));
 // The example shown includes both April and May confirmations; use valid examples.
 rows.forEach((row,index)=>{row.confirmation_date=index===0?'30/4/2013':`${index}/5/2013`;});
 const normalized=rows.map(normalizeStaffImportDates);
 assert.equal(normalized.length,11);
 assert.equal(normalized[0].join_date,'2013-02-01');
 assert.equal(normalized[0].confirmation_date,'2013-04-30');
 assert.equal(normalized[10].join_date,'2013-02-11');
 assert.equal(normalized[10].confirmation_date,'2013-05-10');
});

test('Import rejects impossible dates rather than silently swapping day and month',()=>{
 for(const value of ['31/4/2013','29/2/2013','2/13/2013','2013-02-29','12/31/2013','1/2/13','2013-1-2','31-12-2013','41304']){
  assert.throws(()=>normalizeStaffImportDate(value),Error,value);
 }
});

test('Import dates for three staff fields are canonical and do not mutate original input',()=>{
 const original={user_email:'staff@example.test',join_date:'1/2/2013',confirmation_date:'30/4/2013',resignation_date:'',salary_type:'Monthly'};
 const formatted=normalizeStaffImportDates(original);
 assert.deepEqual(formatted,{...original,join_date:'2013-02-01',confirmation_date:'2013-04-30',resignation_date:undefined});
 assert.equal(original.join_date,'1/2/2013');
});

test('Invalid multiple CSV dates report readable named fields in one row',()=>{
 assert.throws(()=>normalizeStaffImportDates({join_date:'31/4/2013',confirmation_date:'29/2/2013'}),error=>{
  assert.match(error.message,/Join Date:/);
  assert.match(error.message,/Confirmation Date:/);
  assert.doesNotMatch(error.message,/pattern|origin|invalid_format|path/);
  return true;
 });
});

test('Zod-like issues do not expose raw validator JSON or internal regex',()=>{
 const value=describeStaffImportError({issues:[{path:['join_date'],code:'invalid_format',pattern:'SECRET_INTERNAL_REGEX'},{path:['basic_salary'],code:'invalid_format'}]});
 assert.match(value,/Join Date/);
 assert.match(value,/Basic Salary/);
 assert.doesNotMatch(value,/SECRET_INTERNAL_REGEX|origin|invalid_format|"path"/);
 assert.match(describeStaffImportError({message:'USER_NOT_AVAILABLE'}),/active available user/);
 assert.match(describeStaffImportError(new Error('unknown_internal_stack')),/Invalid row/);
});

test('Preview and Confirm continue to share safe CSV validation and no writes during Preview',()=>{
 const api=source('backend/src/staff-profiles.js');
 assert.match(api,/const cleaned=normalizeStaffImportDates\(raw\)/);
 assert.match(api,/normalized\[key\]=cleaned\[key\]\|\|undefined/);
 assert.match(api,/errors\.push\(\{row,error:describeStaffImportError\(e\)\}\)/);
 assert.match(api,/export async function previewStaffImport[\s\S]*?const result=await validateImport\(req,csv\)/);
 assert.match(api,/export async function confirmStaffImport[\s\S]*?const result=await validateImport\(req,csv\);if\(result\.errors\.length\)throw fail/);
 const frontend=source('frontend/src/StaffProfiles.jsx');
 assert.match(frontend,/Dates: DD\/MM\/YYYY \(Malaysia\) or YYYY-MM-DD/);
 assert.match(frontend,/preview\.errors\.length>0/);
});
