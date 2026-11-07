TPOS Main V2 — Company Profile R1.1 Edit Business Identity
SOURCE: tpos_main_v2 LATEST_071120262210.zip + Company Profile R1 Phase1 Patch + Foundation Test Fix

CHANGED FILES ONLY — no database migration.
Extract ZIP into D:\www\tpos_main_v2 (retain folder paths).
Restart backend/frontend.

Test:
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/company-profile-r1.test.js
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build

Owner/Admin: Settings > Company Profile > Edit Business Identity > Save.
Check changed Business Name and Business Type after refresh/login and verify Activity Log.
Test unauthorized role cannot edit; inspect updated SSM and trading names.
Business Type changes can affect POS behavior. Avoid changing to an incorrect category in a live business.

NOTE: central and tenant identity edits now use one InnoDB cross-database transaction, requiring configured MYSQL_USER to have UPDATE permissions on central tenants and tenant profile/registration/audit.
If an operation is denied, transaction rolls back; do not manually update one database only.
No locked Customer Display, KDS, POS or receipt files included.
STATUS: 5/5 targeted static tests PASS locally; runtime MySQL and full regression require PC validation.
