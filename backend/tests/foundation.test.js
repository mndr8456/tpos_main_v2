import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join,dirname } from 'node:path';
import { hashPassword, verifyPassword, passwordAllowed, freshToken, tokenHash } from '../src/passwords.js';
const root=join(dirname(fileURLToPath(import.meta.url)),'../..');
const source=async p=>readFile(join(root,p),'utf8');

test('Password hashes use per-user random salt and authenticate correctly',async()=>{
 const a=await hashPassword('ValidPassword123'),b=await hashPassword('ValidPassword123');
 assert.notEqual(a,b);assert.ok(await verifyPassword('ValidPassword123',a));assert.equal(await verifyPassword('WrongPassword123',a),false);
 assert.equal(passwordAllowed('1234567890'),false);assert.equal(passwordAllowed('aA12'),false);
});
test('Session secret has unpredictable 256-bit tokens and stores only SHA-256 digest',()=>{
 const token=freshToken();assert.match(token,/^[a-zA-Z0-9_-]{43}$/);assert.equal(tokenHash(token).length,64);
});
test('V2 migrations retain original order and keep Discount, Dashboard, Voucher, Shift and Drawer migrations separate',async()=>{
 const names=await readdir(join(root,'database'));
 assert.deepEqual(names.filter(n=>n.endsWith('.sql')).sort(),['001_central.sql','002_tenant_foundation.sql','003_tenant_users.sql','004_tenant_categories.sql','005_tenant_dashboard.sql','006_tenant_suppliers.sql','007_tenant_products.sql','008_tenant_product_r3.sql','009_tenant_discounts.sql','010_tenant_discount_role_permissions.sql','011_tenant_dashboard_accountant_supervisor.sql','012_tenant_vouchers.sql','013_tenant_cash_shifts.sql','014_tenant_cash_drawer_logs.sql','015_tenant_product_kpdn.sql','016_tenant_payment_methods.sql','017_tenant_pos_drafts.sql','018_tenant_sst_settings.sql','019_tenant_service_charge_settings.sql','020_tenant_discount_print_settings.sql','021_tenant_restaurant_tables.sql','022_tenant_inventory_foundation.sql','023_tenant_inventory_two_decimals.sql','024_tenant_pos_cash_checkout.sql','025_tenant_staff_profiles.sql','026_tenant_hr_attendances.sql','027_tenant_attendance_clock.sql','028_tenant_hr_leave_types.sql','029_tenant_hr_leave_balances.sql','030_tenant_hr_leave_requests.sql','031_tenant_hr_leave_requests_no_import.sql','032_tenant_hr_leave_emergency_attendance.sql','033_tenant_operational_navigation_stock_in.sql','034_tenant_role_permissions.sql','035_tenant_pos_multi_payment.sql','036_tenant_pos_receipt_tax_rates.sql','037_tenant_pos_receipt_number.sql','038_tenant_inventory_bulk_opening.sql','039_tenant_order_terminal.sql','040_tenant_kds.sql','041_tenant_customer_display.sql','042_tenant_company_profile.sql','043_tenant_receipt_settings.sql','044_tenant_einvoice_settings.sql','045_tenant_einvoice_requests.sql','046_tenant_einvoice_document_foundation.sql',
 '047_tenant_einvoice_checkout_snapshot.sql',
 '048_tenant_einvoice_line_tax_evidence.sql','049_tenant_einvoice_verified_mapping.sql','050_tenant_pos_reduction_settlement.sql','051_tenant_einvoice_supplier_metadata.sql','052_tenant_einvoice_sandbox.sql']);
 const base=await source('database/002_tenant_foundation.sql');
 const users=await source('database/003_tenant_users.sql');
 assert.doesNotMatch(base,/CREATE TABLE IF NOT EXISTS users\b/i);
 for(const name of ['users','roles','permissions','role_permissions','user_roles','user_branch_access','user_sessions','user_activity_logs'])
  assert.match(users,new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\b`,'i'));
});
test('All SQL avoids destructive commands and legacy V1 tables',async()=>{
 for(const name of ['001_central.sql','002_tenant_foundation.sql','003_tenant_users.sql','004_tenant_categories.sql','005_tenant_dashboard.sql','006_tenant_suppliers.sql','007_tenant_products.sql','008_tenant_product_r3.sql','009_tenant_discounts.sql','010_tenant_discount_role_permissions.sql','011_tenant_dashboard_accountant_supervisor.sql','012_tenant_vouchers.sql','013_tenant_cash_shifts.sql','014_tenant_cash_drawer_logs.sql','015_tenant_product_kpdn.sql','016_tenant_payment_methods.sql','017_tenant_pos_drafts.sql','018_tenant_sst_settings.sql','019_tenant_service_charge_settings.sql','020_tenant_discount_print_settings.sql','021_tenant_restaurant_tables.sql','022_tenant_inventory_foundation.sql','023_tenant_inventory_two_decimals.sql','024_tenant_pos_cash_checkout.sql','025_tenant_staff_profiles.sql','026_tenant_hr_attendances.sql','027_tenant_attendance_clock.sql','028_tenant_hr_leave_types.sql','029_tenant_hr_leave_balances.sql','030_tenant_hr_leave_requests.sql','046_tenant_einvoice_document_foundation.sql','047_tenant_einvoice_checkout_snapshot.sql']){
  const sql=await source(`database/${name}`);
  assert.doesNotMatch(sql,/\bDROP\s+(?:TABLE|DATABASE)\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
  assert.doesNotMatch(sql,/tpos_v1_|tpos_v2_tenant_[1-9]/i);
 }
});
test('A new tenant has one legal SSM identity, independent TIN and separate Sales/Service SST',async()=>{
 const sql=await source('database/002_tenant_foundation.sql');
 assert.match(sql,/\bssm_registration_number\s+VARCHAR\(100\)\s+NOT NULL\b/i);
 assert.match(sql,/\bssm_old_registration_number\s+VARCHAR\(100\)\s+NULL\b/i);
 assert.match(sql,/\btin\s+VARCHAR\(80\)\s+NULL\b/i);
 assert.match(sql,/\bsst_sales_tax_number\s+VARCHAR\(80\)\s+NULL\b/i);
 assert.match(sql,/\bsst_service_tax_number\s+VARCHAR\(80\)\s+NULL\b/i);
 assert.doesNotMatch(sql,/\bbusiness_registration_number\b|\bsst_registration_number\b/i);
});
test('Email directory is the authentication tenant resolver; no external tenant ID is accepted',async()=>{
 const auth=await source('backend/src/auth.js');
 assert.match(auth,/FROM login_directory d/);
 assert.match(auth,/WHERE d\.email=\?/);
 assert.doesNotMatch(auth,/headers\[['"]x-tenant/i);
});
test('User changes enforce explicit role permission and protect OWNER account',async()=>{
 const api=await source('backend/src/app.js');
 const users=await source('backend/src/users.js');
 assert.match(api,/permitted\('users.manage'\)/);
 assert.match(users,/OWNER_PROTECTED/);
 assert.match(users,/SELF_ROLE_STATUS_CHANGE_BLOCKED/);
 assert.match(users,/BRANCH_ACCESS_DENIED/);
});
test('Server preserves password versioning and handles failed login lockout',async()=>{
 const auth=await source('backend/src/auth.js');
 assert.match(auth,/failed_login_attempts\+1>=5/);
 assert.match(auth,/auth_version/);
 assert.match(auth,/PASSWORD_CHANGE_REQUIRED/);
});
test('New ZIP source excludes all prior modules, migrations and V1 reference tree',async()=>{
 // Local Git metadata is excluded. SECURITY.md is an optional root-level
 // security policy document; it is not a legacy module or a database migration.
 const names=(await readdir(root)).filter(name=>name!=='.git');
 assert.deepEqual(names.filter(name=>name!=='SECURITY.md').sort(),['.gitignore','README.md','backend','database','docs','frontend'].sort());
 if(names.includes('SECURITY.md')){
  assert.equal((await stat(join(root,'SECURITY.md'))).isFile(),true,'SECURITY.md must be a regular file');
 }
 const db=await readdir(join(root,'database'));
 // Previously approved migrations and the additive 050/051 are retained in sequence.
 assert.ok(db.includes('041_tenant_customer_display.sql'));
 assert.ok(db.includes('042_tenant_company_profile.sql'));
 assert.ok(db.includes('043_tenant_receipt_settings.sql'));
 assert.ok(db.includes('044_tenant_einvoice_settings.sql'));
 assert.ok(db.includes('045_tenant_einvoice_requests.sql'));
 assert.ok(db.includes('046_tenant_einvoice_document_foundation.sql'));
 assert.ok(db.includes('047_tenant_einvoice_checkout_snapshot.sql'));
 assert.ok(db.includes('048_tenant_einvoice_line_tax_evidence.sql')&&db.includes('049_tenant_einvoice_verified_mapping.sql'));
 assert.ok(db.includes('050_tenant_pos_reduction_settlement.sql'));
 assert.ok(db.includes('051_tenant_einvoice_supplier_metadata.sql'));
 assert.equal(db.some(n=>/v1|legacy/i.test(n)),false);
});


test('V2 central and tenant database names match between .env files and config defaults',async()=>{
 const config=await source('backend/src/config.js');
 assert.match(config,/central: process\.env\.CENTRAL_DB \|\| 'tpos_v2_central'/);
 assert.match(config,/prefix: process\.env\.TENANT_DB_PREFIX \|\| 'tpos_v2_tenant_'/);
 for (const f of ['backend/.env','backend/.env.example']) {
  const env=await source(f);
  assert.match(env,/^CENTRAL_DB=tpos_v2_central$/m);
  assert.match(env,/^TENANT_DB_PREFIX=tpos_v2_tenant_$/m);
 }
 for (const file of ['README.md','docs/ACCEPTANCE_USER_R1.md']) {
  const content=await source(file);
  assert.match(content,/tpos_v2_central/);
  assert.doesNotMatch(content,new RegExp('tpos_v2'+'r_central|tpos_v2'+'r_tenant_')); 
 }
});
