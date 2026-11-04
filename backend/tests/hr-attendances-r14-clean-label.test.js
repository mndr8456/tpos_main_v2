import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const jsx=readFileSync(new URL('../../frontend/src/Attendances.jsx',import.meta.url),'utf8');

test('R1.4 Attendance form shows the approved Auto Calculated heading without internal Backend label',()=>{
  assert.match(jsx,/<div className="att-calculated"><b>Auto Calculated<\/b>/);
  assert.doesNotMatch(jsx,/Auto Calculated\s*[—-]\s*Backend/);
});

test('R1.4 retains all four calculated values and server-authoritative recalculation guidance',()=>{
  for(const name of ['working_minutes','overtime_minutes','late_minutes','early_leave_minutes']){
    assert.match(jsx,new RegExp(`minutes\\(calculated\\?\\.${name}\\)`));
  }
  assert.match(jsx,/Final values are recalculated by the server when saved/);
  assert.match(jsx,/Clock In \(HR manual only\)/);
  assert.match(jsx,/Clock Out \(HR manual only\)/);
});
