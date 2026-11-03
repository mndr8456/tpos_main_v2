import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../frontend/src/Attendances.css', import.meta.url), 'utf8');
const jsx = readFileSync(new URL('../../frontend/src/Attendances.jsx', import.meta.url), 'utf8');

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, `Missing selector ${selector}`);
  return match[1];
}

test('Attendance R1.2 enlarges scheduled and clock times without changing the data', () => {
  assert.match(css, /\.att-page \.att-table tbody td:nth-child\(4\) small,\s*\.att-page \.att-table tbody td:nth-child\(5\) small\s*\{[^}]*font-size:\s*13px/s);
  assert.match(jsx, /\{time\(r\.scheduled_clock_in\)\}/);
  assert.match(jsx, /\{time\(r\.clock_out\)\}/);
});

test('Attendance R1.2 centers status badge and active label in column seven', () => {
  assert.match(css, /\.att-page \.att-table tbody td:nth-child\(7\)\s*,/);
  assert.match(css, /\.att-page \.att-table tbody td:nth-child\(7\) \.pill\s*\{[^}]*justify-content:\s*center/s);
  assert.match(rule('.att-page .att-table tbody td:nth-child(7) small'), /text-align:\s*center/);
  assert.match(jsx, /\{r\.attendance_status\}<\/span><small>\{r\.status\}/);
});

test('Attendance R1.2 increases approval readability only within Attendances', () => {
  assert.match(css, /\.att-page \.att-table tbody td:nth-child\(8\) \.pill\s*\{[^}]*font-size:\s*13px/s);
  assert.match(css, /\.att-page \.att-table tbody td:nth-child\(8\)\s*\{\s*text-align:\s*center/);
  assert.match(jsx, /\{approvalDisplay\(r\)\}/);
});
