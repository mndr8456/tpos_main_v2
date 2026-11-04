import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const ui = readFileSync(fileURLToPath(new URL('../../frontend/src/AttendanceClock.jsx', import.meta.url)), 'utf8');
const backend = readFileSync(fileURLToPath(new URL('../src/attendance-clock.js', import.meta.url)), 'utf8');

test('R1.2: unscheduled/off-day/completed states retain a visible disabled Clock In action', () => {
  assert.match(ui, /t\.mode!==\x27READY\x27&&t\.mode!==\x27WORKING\x27&&<button[^>]*disabled aria-disabled="true"[^>]*><LogIn size=\{18\}\/> Clock In<\/button>/);
  assert.doesNotMatch(ui, /Clock Unavailable/);
});

test('R1.2: reason identifies the authoritative attendance date and HR scheduling step', () => {
  assert.match(ui, /No attendance schedule for \$\{dmy\(t\.date\)\}/);
  assert.match(ui, /HR → Attendances before Clock In/);
});

test('R1.2: ready and working modes retain disabled guards and official punch routes', () => {
  assert.match(ui, /t\.mode===\x27READY\x27&&<div className="clock-punch-form"/);
  assert.match(ui, /disabled=\{!t\.canClockIn\|\|busy\|\|loading\}/);
  assert.match(ui, /t\.mode===\x27WORKING\x27&&<div className="clock-punch-form"/);
  assert.match(ui, /disabled=\{!t\.canClockOut\|\|busy\|\|loading\}/);
  assert.match(ui, /const punch=async kind=>\{if\(!today\?\.access\?\.allowed\|\|busy\)return;/);
});

test('R1.2: backend still requires a scheduled attendance and trusted network, without client timestamps', () => {
  assert.match(backend, /SCHEDULE_NOT_AVAILABLE/);
  assert.match(backend, /clockAccessDecision/);
  assert.match(backend, /UTC_TIMESTAMP\(6\)/);
  assert.match(backend, /req\.auth\.user\.id/);
  assert.doesNotMatch(backend, /req\.body\.(clock_in|clock_out)/);
});
