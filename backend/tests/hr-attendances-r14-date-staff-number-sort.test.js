import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compareAttendanceRows} from '../../frontend/src/attendance-sort.js';

const backend=readFileSync(new URL('../src/attendances.js',import.meta.url),'utf8');
const page=readFileSync(new URL('../../frontend/src/Attendances.jsx',import.meta.url),'utf8');

const record=(attendance_date,staff_no,session_no=1,id='1')=>({attendance_date,staff_no,session_no,id});

test('R1.4 date latest-first and Staff No numeric ascending within each day',()=>{
 const records=[
  record('2026-11-03','SAT-0010',1,'8'),
  record('2026-11-04','SAT-0002',1,'6'),
  record('2026-11-03','SAT-0002',1,'4'),
  record('2026-11-04','SAT-0010',1,'7'),
  record('2026-11-04','SAT-0001',1,'5'),
  record('2026-11-03','SAT-0001',2,'2'),
  record('2026-11-03','SAT-0001',1,'1'),
 ];
 const rows=records.sort(compareAttendanceRows);
 assert.deepEqual(rows.map(x=>[x.attendance_date,x.staff_no,x.session_no]),[
  ['2026-11-04','SAT-0001',1],['2026-11-04','SAT-0002',1],['2026-11-04','SAT-0010',1],
  ['2026-11-03','SAT-0001',1],['2026-11-03','SAT-0001',2],['2026-11-03','SAT-0002',1],['2026-11-03','SAT-0010',1],
 ]);
});

test('R1.4 stable tie-break and different prefixes preserve Staff Profile numeric style',()=>{
 const rows=[record('2026-11-04','ABC-0010',1,'7'),record('2026-11-04','SAT-0001',1,'4'),record('2026-11-04','ABC-0002',1,'2'),record('2026-11-04','ABC-0002',1,'1')];
 rows.sort(compareAttendanceRows);
 assert.deepEqual(rows.map(x=>x.id),['1','2','7','4']);
});

test('R1.4 backend orders BEFORE LIMIT by attendance date, numeric staff and session',()=>{
 assert.match(backend,/ORDER BY a\.attendance_date DESC,SUBSTRING_INDEX\(sp\.staff_no,'-',1\) ASC,CAST\(SUBSTRING_INDEX\(sp\.staff_no,'-',-1\) AS UNSIGNED\) ASC,sp\.id ASC,a\.session_no ASC,a\.id ASC LIMIT \$\{f\.limit\}/);
 assert.doesNotMatch(backend,/ORDER BY a\.attendance_date DESC,sp\.staff_no ASC/);
});

test('R1.4 frontend sorts after filters and before page limit; PDF uses same displayed order',()=>{
 assert.match(page,/\.filter\(r=>[\s\S]*?\.sort\(compareAttendanceRows\)\.slice\(0,Number\(limit\)\)/);
 assert.match(page,/createAttendancePdf\(filtered,/);
 assert.match(page,/\{filtered\.map\(r=>/);
});

test('R1.4 keeps the cleaned Auto Calculated heading and four backend-authoritative figures',()=>{
 assert.match(page,/<div className="att-calculated"><b>Auto Calculated<\/b>/);
 assert.doesNotMatch(page,/Auto Calculated\s*[—-]\s*Backend/);
 for(const f of ['working_minutes','overtime_minutes','late_minutes','early_leave_minutes'])assert.ok(page.includes(`minutes(calculated?.${f})`));
});
