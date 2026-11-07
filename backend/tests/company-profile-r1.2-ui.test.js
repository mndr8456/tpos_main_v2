import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source = await readFile(new URL('../../frontend/src/CompanyProfile.jsx', import.meta.url), 'utf8');
const refreshHelper = await readFile(new URL('../../frontend/src/refresh-page.js', import.meta.url), 'utf8');

test('Company Profile R1.2 Refresh clears notice then reloads using approved shared helper', () => {
  assert.match(source, /import\s*\{refreshPage\}\s*from\s*['"]\.\/refresh-page\.js['"]/);
  assert.match(source, /onClick=\{\(\)=>refreshPage\(load,notify\)\}/);
  assert.match(refreshHelper, /notify\(''\)/);
  assert.match(refreshHelper, /return load\(\)/);
  assert.doesNotMatch(source, /onClick=\{load\}/);
});

test('Company Profile R1.2 toolbar has icon-only Refresh and Activity Log with accessible tooltips', () => {
  for (const [label, icon] of [['Refresh', 'RefreshCw'], ['Activity Log', 'History']]) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(source, new RegExp(`<button[^>]*className="outline action-icon"[^>]*title="${escaped}"[^>]*aria-label="${escaped}"[\\s\\S]*?<${icon} size=\\{18\\}\\/></button>`));
  }
  assert.doesNotMatch(source, /<RefreshCw[^>]*\/>\s*Refresh\s*<\/button>/);
  assert.doesNotMatch(source, /<History[^>]*\/>\s*Activity Log\s*<\/button>/);
});

test('Company Profile R1.2 Save button is compact and retains successful save behaviour', () => {
  assert.match(source, /className="primary" disabled=\{busy\|\|loading\|\|JSON\.stringify\(profile\)===JSON\.stringify\(form\)\}/);
  assert.match(source, /\{busy\?'Saving\.\.\.':'Save'\}/);
  assert.doesNotMatch(source, /Save Company Profile/);
  assert.match(source, /notify\('Company Profile saved successfully\.'\)/);
});

test('Company Profile R1.2 retains editable identity and existing API route', () => {
  assert.match(source, /identityFields\.map/);
  assert.match(source, /request\('\/company-profile',\{method:'PUT',body\}\)/);
  assert.match(source, /request\('\/company-profile\/audit'\)/);
});
