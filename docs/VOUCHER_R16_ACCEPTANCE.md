# TPOS Main V2 — Voucher R1.6 (Import Excel + Batch Create)

## Baseline
Voucher R1.5 (with Import, PDF Export, unique Print Select). Apply the complete changed files; do not replace other approved modules.

## Changes
- Import allows `voucher_code` blank; unique secure voucher codes are issued server-side **only during Confirm**, not during Preview.
- Import accepts Malaysian Excel-style dates `DD/MM/YYYY HH:mm` as well as `YYYY-MM-DD HH:mm[:ss]`. Invalid dates remain rejected.
- The CSV Template now has a blank Voucher Code cell by default.
- Explicit manual voucher codes remain supported by CSV and must be unique within a tenant and file.
- Create Voucher shows **Quantity to Generate** (1–200). All records are created in one transaction with one audit row and unique bearer code per voucher.
- For bulk-generated codes (Quantity > 1), empty Total Usage Limit defaults to **one redemption per code**. If the owner explicitly sets a different limit it is respected. Single-code Create retains its earlier behavior.
- For imported rows with empty Voucher Code, empty Usage Limit also defaults to one redemption per code. Manually specified codes retain their existing usage-limit semantics.
- Existing vouchers, print sizes, Discount permissions and SQL 012 are unchanged.

## Installation
1. Back up the current source folder as usual.
2. Extract ZIP into `D:\www\tpos_main_v2\` and replace changed full files.
3. From backend: `npm run check`, then `npm test`.
4. From frontend: `npm run build`.
5. Restart backend, refresh browser (`Ctrl+F5`). Do not run SQL migrations.

## Acceptance tests

**Import**
1. Open Voucher > Import > CSV Template. Confirm that `voucher_code` in the sample row is blank.
2. Load `docs/voucher_r16_acceptance/01_excel_malaysia_blank_codes.csv`; Preview must report 3 valid rows with `AUTO-GENERATED` codes.
3. Confirm once; the system should create 3 vouchers with 3 distinct `VCH-...` codes. No rows should be created before Confirm.
4. Load `02_duplicate_manual_codes_invalid.csv`; Preview must reject the duplicated explicit code and Confirm remain disabled.
5. Test an invalid date such as `31/02/2026 0:00`. Preview must reject it, with no insert.

**Create multiple**
1. Open Create Voucher and enter Voucher RM5 details.
2. Enter Quantity to Generate = 3. Leave Total Usage Limit blank.
3. Save. Verify 3 newly created rows, each with distinct Voucher Code, barcode and QR. Each voucher has Usage Limit 1.
4. Edit a single new voucher; ensure the original code is immutable.
5. Test an invalid Quantity = 201: client must reject; API also rejects.
6. Test transaction failure with database error in a test environment: none of the batch should remain saved.

**Print and PDF**
Use Select Vouchers to choose the 3 unique records. PDF should be 3 voucher-sized pages and Print should issue 3 pages, not repeat one code. Default dimensions remain 18.55 cm × 8.45 cm.

## Status
Backend unit/static regression and frontend parser checks are available locally; Vite build, actual MySQL transaction/rollback, barcode scanning and physical print need acceptance on the user's PC. No PASS/LOCKED claim until live evidence.
