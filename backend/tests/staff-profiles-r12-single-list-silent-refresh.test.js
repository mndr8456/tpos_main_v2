import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {refreshPage} from '../../frontend/src/refresh-page.js';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const file=name=>readFileSync(resolve(root,name),'utf8');

test('R1.2 Staff Profile uses one table and no duplicated My Staff Profile card',()=>{
 const jsx=file('frontend/src/StaffProfiles.jsx');
 const css=file('frontend/src/StaffProfiles.css');
 assert.doesNotMatch(jsx,/My Staff Profile<\/h2>|className="sp-self"|Last refreshed:|Staff Profiles refreshed\./);
 assert.doesNotMatch(css,/\.sp-self\b|\.sp-last-refreshed\b/);
 assert.match(jsx,/\(canList\|\|own\)\&\&<div className="table-panel"/);
 assert.match(jsx,/const filtered=useMemo\(\(\)=>\(canList\?staff:own\?\[own\]:\[\]\)\.filter/);
 assert.match(jsx,/\{canList\&\&<div className="stat-grid sp-stats"/);
});

test('R1.2 self-only employee still has a single own row and restricted Edit',()=>{
 const jsx=file('frontend/src/StaffProfiles.jsx');
 const backend=file('backend/src/staff-profiles.js');
 assert.match(jsx,/canSelf=profile\.user\.permissions\.includes\('staff_profiles\.self'\)/);
 assert.match(jsx,/\!canList\&\&canSelf\&\&String\(row\.user_id\)===String\(profile\.user\.id\)\&\&action\('Update Staff Profile',Pencil,\(\)=>setForm\(\{kind:'self',row\}\)\)/);
 assert.match(jsx,/request\(self\?'\/staff-profiles\/me'/);
 assert.match(backend,/export async function updateMyStaff/);
 assert.match(backend,/const data=selfBody\.parse\(req\.body\)/);
 assert.doesNotMatch(jsx,/\!canList\&\&canSelf\&\&action\('Print Form Staff'/);
});

test('R1.2 Refresh hides old notice, runs the loader, and never emits success notification',async()=>{
 let called=0;const notices=[];
 const success=await refreshPage(async()=>{called++;return true;}, (...args)=>notices.push(args));
 assert.equal(success,true);assert.equal(called,1);assert.deepEqual(notices,[['']]);
 const failed=await refreshPage(async()=>{called++;return false;}, (...args)=>notices.push(args));
 assert.equal(failed,false);assert.equal(called,2);assert.deepEqual(notices,[[''],['']]);
 const jsx=file('frontend/src/StaffProfiles.jsx');
 assert.match(jsx,/const manualRefresh=\(\)=>refreshPage\(load,notify\)/);
 assert.doesNotMatch(jsx,/notify\('Staff Profiles refreshed\.'/);
 assert.match(jsx,/catch\(e\)\{notify\(e\.message,true\);return false;/);
});
