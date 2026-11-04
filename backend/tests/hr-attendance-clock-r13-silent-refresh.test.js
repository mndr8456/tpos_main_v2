import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {refreshPage} from '../../frontend/src/refresh-page.js';

const ui = readFileSync(fileURLToPath(new URL('../../frontend/src/AttendanceClock.jsx', import.meta.url)), 'utf8');

// Page-wide notifications are owned by App.jsx; explicit Refresh must use the
// same clear-then-load helper as all other approved TPOS pages.
test('R1.3 Refresh clears the previous Clock In / Clock Out notice before loading', async () => {
  assert.match(ui, /import \{refreshPage\} from '\.\/refresh-page\.js';/);
  assert.match(ui, /iconButton\('Refresh Attendance Clock',RefreshCw,\(\)=>refreshPage\(refresh,notify\),loading\|\|busy\)/);
  const events=[];
  const result=await refreshPage(async()=>{events.push('reload');return 'loaded';},(msg,err)=>events.push(['notice',msg,err]));
  assert.deepEqual(events,[['notice','',undefined],'reload']);
  assert.equal(result,'loaded');
});

test('R1.3 mounting the page and changing history filters do not clear the punch notice', () => {
  assert.match(ui,/useEffect\(\(\)=>\{refresh\(\);\},\[refresh\]\)/);
  assert.doesNotMatch(ui,/useEffect\(\(\)=>\{refreshPage\(/);
});

test('R1.3 a successful Clock In/Out retains its initial success notice and Refresh is silent', () => {
  assert.match(ui,/notify\(`\$\{label\} recorded\.\`\)/);
  const refreshBody=ui.split('const refresh=useCallback(async()=>{')[1]?.split('},[loadToday,loadHistory,notify]);')[0];
  assert.ok(refreshBody,'Refresh loader must remain present');
  assert.match(refreshBody,/await Promise\.all\(\[loadToday\(\),loadHistory\(\)\]\)/);
  assert.doesNotMatch(refreshBody,/notify\([^)]*recorded/);
  assert.match(refreshBody,/catch\(e\)\{notify\(clockError\(e\),true\);\}/);
});

test('R1.3 Refresh preserves schedule, trusted IP and punch restrictions', () => {
  assert.match(ui,/disabled=\{!t\.canClockIn\|\|busy\|\|loading\}/);
  assert.match(ui,/disabled=\{!t\.canClockOut\|\|busy\|\|loading\}/);
  assert.match(ui,/if\(!today\?\.access\?\.allowed\|\|busy\)return/);
  assert.match(ui,/No attendance schedule for \$\{dmy\(t\.date\)\}/);
  assert.match(ui,/Office \/ Shop Network/);
  assert.match(ui,/Approved Remote Duty/);
});
