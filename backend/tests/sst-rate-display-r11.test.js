import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {formatSstTaxRate} from '../../frontend/src/sst-rate-format.js';

const ui = readFileSync(new URL('../../frontend/src/SstSettings.jsx', import.meta.url), 'utf8');

test('SST rate displays default and saved whole-hundredth rates with two decimals', () => {
  for (const [input, expected] of [
    [null, '0.00'], ['0.000', '0.00'], ['0', '0.00'],
    ['8.000', '8.00'], ['8.5', '8.50'], ['10.00', '10.00'],
    ['6.250', '6.25'], ['100.000', '100.00'],
  ]) assert.equal(formatSstTaxRate(input), expected, `${input}`);
});

test('SST rate formatting never silently changes a meaningful legacy third decimal', () => {
  for (const value of ['6.125', '0.001', '8.257']) {
    assert.equal(formatSstTaxRate(value), value);
  }
});

test('SST Sales Tax and Service Tax use a 0.01 step, blur formatting and formatted save', () => {
  assert.match(ui, /const empty=\{isEnabled:false,registrationNumber:'',taxRate:'0\.00'\}/);
  assert.match(ui, /const displayForm=data=>/);
  assert.match(ui, /useEffect\(\(\)=>setForm\(displayForm\(data\)\),\[data\]\)/);
  assert.match(ui, /step="0\.01"/);
  assert.match(ui, /onBlur=\{\(\)=>update\('taxRate',formatSstTaxRate\(form\.taxRate\)\)\}/);
  assert.match(ui, /onSave\(definition\.type,\{\.\.\.form,taxRate:formatSstTaxRate\(form\.taxRate\)\}\)/);
  assert.match(ui, /SST Sales Tax/);
  assert.match(ui, /SST Service Tax/);
});
