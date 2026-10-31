import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {refreshPage} from '../../frontend/src/refresh-page.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../frontend/src');
const source=name=>readFile(resolve(root,name),'utf8');

test('Explicit Refresh clears previous success/error notice before fetching new data',async()=>{
 const called=[];
 const result=await refreshPage(async()=>{called.push('api-reload');return 'fresh';},message=>called.push(['clear',message]));
 assert.equal(result,'fresh');
 assert.deepEqual(called,[['clear',''],'api-reload']);
});

test('Refresh without an app notice callback still reloads (Dashboard fallback)',async()=>{
 assert.equal(await refreshPage(async()=>42),42);
});

test('All ten page Refresh buttons clear the shared notice and reload from API',async()=>{
 const pages={
  'App.jsx':/title="Refresh" onClick=\{\(\)=>refreshPage\(load,notify\)\}/,
  'Dashboard.jsx':/label="Refresh Dashboard" onClick=\{\(\)=>refreshPage\(refresh,notify\)\}/,
  'Categories.jsx':/label="Refresh Categories" onClick=\{\(\)=>refreshPage\(load,notify\)\}/,
  'Suppliers.jsx':/label="Refresh Suppliers" onClick=\{\(\)=>refreshPage\(load,notify\)\}/,
  'Products.jsx':/label="Refresh Products" onClick=\{\(\)=>refreshPage\(load,notify\)\}/,
  'Discounts.jsx':/title="Refresh Discounts" action=\{\(\)=>refreshPage\(load,notify\)\}/,
  'Vouchers.jsx':/title="Refresh Vouchers" action=\{\(\)=>refreshPage\(load,notify\)\}/,
  'CashShifts.jsx':/label="Refresh Cash Shifts" action=\{\(\)=>refreshPage\(load,notify\)\}/,
  'CashDrawer.jsx':/label="Refresh Drawer Log" onClick=\{\(\)=>refreshPage\(load,notify\)\}/,
  'PaymentMethods.jsx':/label="Refresh Payment Methods" onClick=\{\(\)=>refreshPage\(load,notify\)\}/,
 };
 for(const [file,matcher] of Object.entries(pages)){
  const text=await source(file);
  assert.match(text,matcher,`Explicit Refresh handler missing in ${file}`);
  assert.match(text,/import \{refreshPage\} from '\.\/refresh-page\.js';/);
 }
});

test('Dashboard receives notify, and ordinary post-save reloads do not erase success notices',async()=>{
 const app=await source('App.jsx');
 const dash=await source('Dashboard.jsx');
 const payments=await source('PaymentMethods.jsx');
 assert.match(app,/<Dashboard profile=\{profile\} notify=\{notify\}/);
 assert.match(dash,/function Dashboard\(\{profile,onNavigate,notify\}\)/);
 assert.match(payments,/notify\('Payment settings saved\.[^']*'\);setEditing\(null\);await load\(\)/);
 assert.doesNotMatch(payments,/notify\('Payment settings saved\.[^']*'\);setEditing\(null\);await refreshPage\(/);
});

test('Authenticated GETs bypass browser cache while mutation requests retain their method',async()=>{
 const api=await source('api.js');
 assert.match(api,/cache:\(options\.method\|\|'GET'\)\.toUpperCase\(\)==='GET'\?'no-store':'default'/);
 assert.match(api,/credentials:'include'/);
});
