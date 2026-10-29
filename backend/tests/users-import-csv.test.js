import test from 'node:test';
import assert from 'node:assert/strict';
import { parseUsersCsv,userCsvTemplate,userCsvColumns } from '../src/users-import-csv.js';
const header=userCsvTemplate();
const line=(name='Test User',email='test@example.org',extra='MAIN')=>[name,'testuser',email,'+60123456789','cashier','active','TemporaryPass123',extra].map(v=>`"${v.replaceAll('"','""')}"`).join(',');
test('Template retains V1 seven columns with optional branch code',()=>{assert.equal(userCsvColumns.length,8);assert.ok(header.includes('full_name,username,email,phone_no,role,status,temporary_password,branch_code'));});
test('Parses 8-column CSV with quoted comma and normalizes email, role and status',()=>{
 const rows=parseUsersCsv(header+line('Test, User','TEST@EXAMPLE.ORG')+'\r\n');
 assert.equal(rows.length,1);assert.equal(rows[0].data.fullName,'Test, User');assert.equal(rows[0].data.email,'test@example.org');assert.equal(rows[0].data.role,'CASHIER');assert.equal(rows[0].data.status,'ACTIVE');assert.equal(rows[0].data.branchCode,'MAIN');
});
test('V1 seven-column CSV is supported with blank branch (single branch fallback happens in database validation)',()=>{
 const legacy=header.trim().split(',').slice(0,7).join(',')+'\r\n';
 const data=line().split(',').slice(0,7).join(',')+'\r\n';
 assert.equal(parseUsersCsv(legacy+data)[0].data.branchCode,'');
});
test('Owner import is always rejected',()=>{
 const rows=parseUsersCsv(header+line().replace('"cashier"','"OWNER"')+'\r\n');
 assert.equal(rows[0].error,'OWNER_PROTECTED');
});
test('Malformed quote sequences and wrong headers are rejected',()=>{
 assert.throws(()=>parseUsersCsv('garbage\r\nhello'),/CSV_INVALID_HEADERS/);
 assert.throws(()=>parseUsersCsv(header+'"unclosed'),/CSV_MALFORMED/);
});
test('Empty files and 51 rows are rejected',()=>{
 assert.throws(()=>parseUsersCsv(header),/CSV_EMPTY/);
 assert.throws(()=>parseUsersCsv(header+Array(51).fill(line()).join('\r\n')),/CSV_ROW_LIMIT/);
});
test('Bad passwords, invalid email, invalid status and invalid roles are rejected without including password in error',()=>{
 for(const replace of [s=>s.replace('TemporaryPass123','short'),s=>s.replace('test@example.org','invalid'),s=>s.replace('"active"','"MISSING"'),s=>s.replace('"cashier"','"BAD"')]){
  const result=parseUsersCsv(header+replace(line())+'\r\n')[0];assert.ok(result.error);assert.ok(!result.error.includes('TemporaryPass123'));
 }
});
test('Reject oversized CSV and invalid branch identifiers',()=>{
 assert.throws(()=>parseUsersCsv(header+'x'.repeat(257*1024)),/CSV_TOO_LARGE/);
 assert.equal(parseUsersCsv(header+line().replace('"MAIN"','"MAIN SPACE"')+'\r\n')[0].error,'BRANCH_CODE_INVALID');
});
