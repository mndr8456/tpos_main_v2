import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {compareStaffByNumber} from '../../frontend/src/staff-no-sort.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = path => readFileSync(resolve(root,path),'utf8');

test('Staff Profile table orders imported Staff No numerically, not by name or import order', () => {
  const items = [
    {id:'11',staff_no:'SAT-0011',full_name:'Azman'},
    {id:'2',staff_no:'SAT-0002',full_name:'Admin'},
    {id:'7',staff_no:'SAT-0007',full_name:'Amun'},
    {id:'10',staff_no:'SAT-0010',full_name:'B'},
    {id:'1',staff_no:'SAT-0001',full_name:'Z'},
    {id:'9',staff_no:'SAT-0009',full_name:'C'},
  ];
  assert.deepEqual(items.sort(compareStaffByNumber).map(x => x.staff_no), [
    'SAT-0001','SAT-0002','SAT-0007','SAT-0009','SAT-0010','SAT-0011',
  ]);
});

test('Staff No sort remains numeric with mixed prefixes and a stable ID tie break', () => {
  const items = [
    {id:'11',staff_no:'STF-0002'},
    {id:'10',staff_no:'SAT-0010'},
    {id:'3',staff_no:'SAT-0002'},
    {id:'2',staff_no:'SAT-0001'},
    {id:'8',staff_no:'STF-0001'},
    {id:'2',staff_no:'SAT-0002'},
  ];
  assert.deepEqual(items.sort(compareStaffByNumber).map(x=>`${x.staff_no}/${x.id}`), [
    'SAT-0001/2','SAT-0002/2','SAT-0002/3','SAT-0010/10','STF-0001/8','STF-0002/11',
  ]);
});

test('Staff API sorts by prefix and numeric suffix before LIMIT, frontend preserves this after filters', () => {
  const backend = source('backend/src/staff-profiles.js');
  const frontend = source('frontend/src/StaffProfiles.jsx');
  assert.match(backend, /ORDER BY SUBSTRING_INDEX\(sp\.staff_no, '-'/);
  assert.match(backend, /CAST\(SUBSTRING_INDEX\(sp\.staff_no, '-', -1\) AS UNSIGNED\)/);
  assert.doesNotMatch(backend, /ORDER BY u\.full_name,sp\.id LIMIT 1000/);
  assert.match(frontend, /\.filter\(s=>.*?\)\.sort\(compareStaffByNumber\)/);
  assert.match(frontend, /\['Staff','Employment','Contact','Statutory','Bank \/ Salary','Status','Actions'\]/);
});
