# TPOS Main V2 — Payment Methods R1.1: Provider API / Bank Details Read-Only

## Scope

- Baseline: `tpos_main_v2 - Latest_05112026_1853.zip` plus accepted Role Permission R1 patch (034).
- Corrects DuitNow QR and E-Wallet section `2. Provider API / Bank Details` for all eight non-OWNER/ADMIN roles.
- OWNER/ADMIN can edit only when `payment_methods.manage` AND `payment_methods.update` are granted. A role having `payment_methods.view` alone is read-only.
- All Provider/Bank text fields, API Key/Secret and `Clear saved API key` checkbox are disabled for view-only roles.
- Existing QR images, provider settings, payment data and other approved modules are unchanged.
- No database migration, no changes to `.env`, no credentials included.

## Install

1. Backup changed files in `D:\\www\\tpos-main-V2`.
2. Extract the full changed files from this patch ZIP, preserving `tpos_main_v2/...` paths.
3. Restart backend/frontend and refresh the browser after deployment.

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
node --test tests/payment-methods-view-only-r11.test.js tests/payment-methods-r1.test.js tests/role-permissions-r1.test.js
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

## Live PC acceptance checks

1. Sign in as SUPERVISOR with `Payment Methods → Read` granted. In both DuitNow QR and E-Wallet, verify that Bank/Provider, Account Reference, Terminal Reference, Provider API URL, and API Key cannot be typed/changed. Any Clear API Key checkbox must also be disabled.
2. Repeat for HR, ACCOUNTANT, MANAGER, CASHIER, WAITER, KITCHEN and STAFF wherever `payment_methods.view` is granted; do not add View grants solely for this test.
3. Verify that image uploads, Active/Inactive toggles, and Save are unavailable to view-only roles.
4. Sign in as OWNER or ADMIN with `payment_methods.manage` plus `payment_methods.update`. Settings should be editable and Save available, subject to the existing provider/encryption configuration.
5. Revoke `payment_methods.update` from a suitable OWNER/ADMIN test configuration (do NOT modify locked OWNER grants). Even if `payment_methods.manage` remains granted, confirm the Settings UI becomes read-only. Restore the grant afterward if appropriate.
6. Verify role matrix and HR Leave Requests unchanged, plus existing backend regression and frontend Vite build.

## Acceptance

Do not mark this patch LULUS until real PC checks are confirmed.
