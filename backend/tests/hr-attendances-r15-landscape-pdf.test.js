import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const pdf=readFileSync(new URL('../../frontend/src/attendance-pdf.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../../frontend/src/Attendances.jsx',import.meta.url),'utf8');

test('R1.5 Attendance PDF is real ISO A4 landscape with bounded rows per page',()=>{
 assert.match(pdf,/const PAGE=\{width:1754,height:1240,widthPt:841\.89,heightPt:595\.276\}/);
 assert.match(pdf,/rowsPerPage:14/);
 assert.match(pdf,/Math\.max\(1,Math\.ceil\(records\.length\/TABLE\.rowsPerPage\)\)/);
 assert.match(pdf,/buildPdfFromJpegs\(pages\)/);
 assert.match(pdf,/records\.length>1000/);
});

test('R1.5 PDF includes both scheduled times plus actual clock punches with readable headings',()=>{
 for(const name of ['scheduled_clock_in','scheduled_clock_out','clock_in','clock_out']){
  assert.ok(pdf.includes(`key:'${name}'`),`${name} missing`);
 }
 assert.match(pdf,/header:\['SCHEDULED','CLOCK IN'\]/);
 assert.match(pdf,/header:\['SCHEDULED','CLOCK OUT'\]/);
 for(const name of ['attendance_date','staff_no','full_name','working_minutes','attendance_status','approval_status']){
  assert.ok(pdf.includes(`key:'${name}'`),`${name} missing`);
 }
 assert.match(pdf,/fitText\(ctx,value,width\)/);
 assert.match(pdf,/ctx\.fillStyle='#ffffff';ctx\.fillRect\(0,0,PAGE\.width,PAGE\.height\)/);
 assert.doesNotMatch(pdf,/fillStyle\s*=\s*['"](?:black|#000000|#000)['"]/i);
});

test('R1.5 PDF contains no IC, statutory, bank or salary columns',()=>{
 for(const name of ['ic_no','bank_account_no','socso_no','epf_no','basic_salary']){
  assert.ok(!pdf.includes(`key:'${name}'`),`sensitive field ${name} must be absent`);
 }
});

test('R1.5 download is Attendances.pdf and export remains filter-scoped',()=>{
 assert.match(page,/createAttendancePdf\(filtered,/);
 assert.match(page,/downloadAttendancePdf\(report,'Attendances\.pdf'\)/);
 assert.match(pdf,/downloadAttendancePdf\(pdf,name='Attendances\.pdf'\)/);
 assert.match(page,/Export PDF \(A4 Landscape\)/);
 assert.doesNotMatch(page,/tpos-attendances-\$\{dateFrom\|\|'all'\}/);
});
