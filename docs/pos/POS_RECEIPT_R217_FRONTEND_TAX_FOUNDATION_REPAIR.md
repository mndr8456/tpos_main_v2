# TPOS Main V2 — POS Receipt R2.1.7 Installation / Acceptance

## Purpose

This changed-files-only patch fixes exactly the two PC test failures reported after migrations 036 and 037 became CURRENT:

1. `PosCashReceipt.jsx` on the PC was an older copy. Its lines had plain `Sales Tax` / `Service Tax`, and omitted a tax line with value 0.00. The complete R2.1.5 receipt component is included for **overwrite**. The sale-time tax-rate snapshot is displayed as `Sales Tax (8%)` / `Service Tax (6%)`; a legacy rate that was not captured is explicitly marked `rate not recorded` (never inferred from today's Settings).
2. `backend/tests/foundation.test.js` expected the migration catalog to end at 035. The full test is updated to include 036 and 037 in sequence without changing migration files.

## Installation

1. Back up your V2 project files. Extract the ZIP and copy the **contents of its `tpos_main_v2` folder** into `D:\www\tpos_main_v2`, choosing **Replace/Overwrite existing files**. Do not create an extra nested `tpos_main_v2` directory.
2. Run these commands in CMD:

```cmd
cd /d D:\www\tpos_main_v2\backend
node scripts/verify-pos-receipt-r217.js
node --test tests/pos-receipt-tax-rates-r215.test.js
node --test tests/pos-receipt-number-r216.test.js
node --test tests/foundation.test.js
node --test tests/pos-receipt-single-page-r214.test.js
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

The read-only verifier must show `failed:0`. In a Windows CMD, you may independently confirm the new receipt component with:

```cmd
findstr /C:"const showSalesTax=" D:\www\tpos_main_v2\frontend\src\PosCashReceipt.jsx
```

3. Restart the frontend, hard-refresh Chrome, and create a **new test sale** to verify both tax rates, the new Receipt No. format, and one-page receipt printing. Historic receipts may lack a stored tax rate; their original numbers and amounts remain unchanged.

## Critical constraints

- **No SQL migrations** in this patch. Migrations 035, 036 and 037 already reported CURRENT for Tenant 1; DO NOT re-run `--apply`.
- No modification to Cash/QR checkout posting, inventory, journals, Role Permission, customer display, print frame, or other accepted modules.
- `Payment Methods R1.1` and `POS Receipt R2.1.4` remain locked.
- Target acceptance: frontend receipt shows configured rate labels (including zero tax amounts), new transactions have the persisted new receipt number, reprint is stable, one-page print remains intact, `npm test` passes with no failures.
- Source checks alone are not proof of live payment or printing acceptance.
