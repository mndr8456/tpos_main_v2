# TPOS Main V2 — Voucher R1 (PC Acceptance)

## Baseline and scope

Baseline: `tpos_main_v2-LATEST_29102026_2257.zip` plus the installed Discount R1, Discount R1.1/R1.2/R1.3 and Dashboard R1.1 changed-file packages. The delivery is Changed Files Only; keep current `.env`, installed tenant data, and all approved modules. Voucher is a **separate module** from Discount. It does not mutate Product, Sales, Voucher V1 or accounting journals.

Tenant migration: **012_tenant_vouchers.sql**. It adds voucher master, target mappings, print settings, reservation ledger, audit, and permissions. It does not re-run SQL 009/010/011 or use legacy V1 databases.

## Install

1. Back up the current V2 source and tenant database. Extract ZIP into `D:\www\tpos_main_v2` with existing files replaced; retain `.env`. Do not copy any V1 tree into the V2 project root.
2. In CMD:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:vouchers
npm run db:vouchers -- --apply
npm run db:vouchers
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Expected tenant status: `MISSING` then `APPLIED` then `CURRENT`; `failures:0`. Restart backend and refresh frontend. Logout/login to refresh tenant permissions. Run the installer for all active tenants; its output reports the number found.

## Manual acceptance checklist

- Sign in as OWNER. Vouchers must appear in sidebar; Create Voucher and Owner Voucher Print Size controls visible. As ADMIN, Create, View, Edit, Archive, Import/Export CSV and Print are available, but **Print Size settings not editable**. MANAGER/ACCOUNTANT/SUPERVISOR can View only. CASHIER does not gain voucher master access by this migration.
- Create `GIFT2026_001`, Fixed RM10, minimum RM20, validity 2026-10-01 00:00 to 2027-12-31 23:59 (Malaysia time), Target ALL, Usage Limit 2, Per Customer Limit 1, Status ACTIVE. Verify duplicate voucher code is rejected.
- Change validity to past/future and see preview reason `OUTSIDE_VALIDITY`; reject invalid end-before-start, negative money, discount >100%, target missing or inactive.
- Select Product/Category eligibility; Preview (read-only) uses the selected tenant Product Master price, rather than accepting an arbitrary client subtotal. Confirm eligible and ineligible products have expected RM amounts.
- Print voucher. Default size must be **18.55 cm wide × 8.45 cm high**. Verify that the printed text, Code 128 barcode and QR scan back to **the exact same voucher code**. Printing is not a redemption. Paper settings are printer-dependent; select matching paper dimensions in OS print dialog and turn off scaling/fit-to-page when possible.
- OWNER changes Width to 20.00 cm and Height to 9.00 cm; save. Reopen View/Print and confirm preview and CSS `@page` size update. Default factory setting remains available by entering 18.55 and 8.45. Allowed dimensions: Width 5–30 cm; Height 3–20 cm.
- Import CSV: Download template or use `docs/voucher_r1_acceptance/01_valid_example.csv` (Preview then Confirm). Use `02_duplicate_codes.csv`, `03_invalid_dates.csv`, and `04_invalid_over_1000_rows.csv` to confirm errors and no partial import. Preview 1,001 rows must reject with `CSV_ROW_LIMIT`. Existing codes from earlier tests may need changing before repeating the valid import. Export CSV and validate columns/target codes.
- Activity Log shows voucher name, code, user and action; print-settings change produces a user-attributed audit event. Archive blocks a voucher with an active reserved checkout.

## POS boundary (important)

The V2 POS Terminal and payment/sales persistence are not yet built in this rebuild. Voucher R1 therefore **does not expose public Reserve / Redeem / Release HTTP endpoints**. It contains tested internal methods in `backend/src/voucher-pos.js` to be invoked by a future, authoritative POS transaction adapter:

1. `reserveVoucher(conn, context)`: lock voucher row `FOR UPDATE`; validate validity, customer/scope/product targeting and usage; create an idempotent reservation key; count *Reserved + Redeemed* toward limit. Do not trust user-entered subtotals.
2. `redeemVoucher(conn, context)`: allow `RESERVED -> REDEEMED` only when a trusted `verifyPersistedSale` function confirms the persisted sale, customer/checkout linkage, payment and voucher amount within the same DB transaction. The future POS checkout adapter must implement that verification.
3. `releaseVoucher(conn, context)`: allow `RESERVED -> RELEASED` only after `verifyUnpaidCheckout` confirms there is no paid sale. Released reservations free capacity; redeemed reservations cannot be released.

The caller **owns the transaction** (`beginTransaction/commit/rollback`). No reservation expiry release is automated without durable checkout verification. Checkout types supported by the contract: RETAIL, SINGLE_ORDER, COMBINED_ORDER, SPLIT_ORDER. POS integration and live redemption are **NOT PASS** until a tested POS adapter exists. Never call these internal methods directly with untrusted HTTP request bodies.

## Local technical verification and known limitations

- Backend `npm run check`: syntax verified in sandbox.
- Voucher-only node tests: see `backend/tests/vouchers-r1.test.js`.
- QR was scanned in an automated local image test; standalone Code 128 output was checked for pattern generation. Physical barcode scanner/printer verification is still required.
- Backend full regression, frontend Vite build, live MySQL migration and manual UI acceptance must be verified on the user PC before Voucher R1 is marked LULUS/LOCKED.
- The V1 Voucher reference was used only to preserve reservation/commit/release safety, not copied into V2 runtime. QR generator is bundled locally with MIT attribution at `frontend/src/vendor/qr/LICENSE.md`; barcode symbols are locally generated and no external network QR service is used.
