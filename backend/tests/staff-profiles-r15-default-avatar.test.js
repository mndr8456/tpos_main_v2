import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=name=>readFileSync(resolve(root,name),'utf8');

// Mysql2 may return a boolean, numeric 0/1, textual '0'/'1', or byte-like flag.
// A truthy '0' must NEVER make an absent image look present.
test('Staff image flag is false for missing image regardless of mysql2 zero representation',()=>{
 const api=source('backend/src/staff-profiles.js');
 const expression=api.match(/^const stringifyIds=row=>\(\{[^\n;]+\}\);/m)?.[0];
 assert.ok(expression,'Staff response normalization is missing');
 const normalize=runInNewContext(`${expression}\nstringifyIds`,{Buffer});
 for(const value of [false,0,'0',null,undefined,Buffer.from([0])]){
  assert.equal(normalize({id:3,user_id:2,has_image:value}).has_image,false,`missing-image flag ${String(value)} must be false`);
 }
 for(const value of [true,1,'1',Buffer.from([1])]){
  assert.equal(normalize({id:3,user_id:2,has_image:value}).has_image,true,`valid-image flag ${String(value)} must be true`);
 }
});

test('Staff SQL only reports image available for a recognized MIME with actual image bytes',()=>{
 const api=source('backend/src/staff-profiles.js');
 assert.match(api,/CASE WHEN sp\.image_mime IN \('image\/png','image\/jpeg','image\/webp'\) AND OCTET_LENGTH\(sp\.image_data\) > 0 THEN 1 ELSE 0 END AS has_image/);
 assert.doesNotMatch(api,/has_image:Boolean\(row\.has_image\)/);
 assert.match(api,/export async function staffImage\(/);
 assert.match(api,/STAFF_IMAGE_NOT_FOUND/);
});

test('Staff list and View/Edit use the same default portrait, including if an image request fails',()=>{
 const ui=source('frontend/src/StaffProfiles.jsx');
 const css=source('frontend/src/StaffProfiles.css');
 assert.match(ui,/function DefaultStaffAvatar\(\{large=false\}\)/);
 assert.match(ui,/role="img" aria-label="Default staff image"/);
 assert.match(ui,/function StaffAvatarImage\(\{src,large\}\)/);
 assert.match(ui,/onError=\{\(\)=>setFailed\(true\)\}/);
 assert.match(ui,/<DefaultStaffAvatar large=\{large\}\/>/);
 assert.match(ui,/row\?\.has_image===true&&row\?\.id\?imageUrl\(row\.id\):null/);
 assert.match(ui,/<StaffAvatar row=\{record\|\|\{\}\} large\/>/);
 assert.match(ui,/<StaffAvatar row=\{row\}\/>/);
 assert.match(css,/\.sp-initial\{[^}]*background:#e9edf2/);
 assert.match(css,/\.sp-initial svg\{[^}]*width:90%/);
 assert.doesNotMatch(ui,/alt="Staff profile"/);
});

test('Staff avatar R1.5 retains R1.4 staff-number sort, print and permission scopes',()=>{
 const ui=source('frontend/src/StaffProfiles.jsx');
 const api=source('backend/src/staff-profiles.js');
 assert.match(ui,/\.sort\(compareStaffByNumber\)/);
 assert.match(api,/ORDER BY SUBSTRING_INDEX\(sp\.staff_no, '-'/);
 assert.match(ui,/openStaffPrint\(/);
 assert.match(api,/const sensitive=\['ic_no'/);
 assert.match(api,/const selfFields=\[/);
});
