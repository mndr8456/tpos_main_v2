# TPOS Main V2 — Voucher R1.1 Automatic Code

## Scope

Voucher Create now assigns a cryptographically random, high-entropy voucher code on the backend. It is unique per tenant by the existing `vouchers.voucher_code` unique constraint. Generated format: `VCH-` followed by 16 uppercase, unambiguous characters (80 bits of randomness). A rare unique constraint collision triggers up to five independently generated attempts with transaction rollback. It is never derived from predictable `MAX(id)+1` values.

Voucher Code in Create is read-only with `Generated automatically on save`. Create ignores a legacy empty code field and rejects an explicitly supplied nonempty code. The API returns `voucherCode`, and the UI displays it after creation. Once issued, Voucher Code is immutable on Edit, enforced by backend; other editable details are unchanged.

The same `voucher_code` is used by the printed text, Code 128 and QR. Existing voucher codes and CSV import/export format remain intact. CSV import retains explicit master codes for compatibility with existing voucher records. No changes to SQL 012, reservations, POS or other modules.

## Install (full changed source files only)

1. Extract ZIP at `D:\www\tpos_main_v2\` and replace the paths included.
2. Restart backend and refresh the frontend after a successful frontend build.
3. Run:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

No migrations or `.env` updates are needed. Do not rerun Voucher SQL 012.

## PC acceptance

1. OWNER or ADMIN signs in and opens Vouchers > Create Voucher.
2. Voucher Code shows `Generated automatically on save`, and cannot be typed into. Fill Voucher Name, Value, Validity and any required rules; save.
3. A success message includes a unique `VCH-...` code. Find the voucher in the table; confirm that exact code is listed.
4. Repeat Create with a different voucher: generated codes must differ.
5. Open View > Print; verify barcode, QR and printed text share the same code. Scan QR with a device and compare the exact text.
6. Open Edit: Voucher Code remains read-only. Attempting to replace the code through a direct API request must be rejected (`VOUCHER_CODE_IMMUTABLE`); this check must not alter the stored voucher.
7. Confirm older voucher codes and CSV Import / Export are not changed.
8. Verify backend tests and frontend build PASS on the PC.

## Tested in the delivered source environment

- `npm run check`: PASS
- `npm test`: 135/135 PASS (including new code-generation and regression checks)
- 5,000 independently generated 80-bit codes: no duplicates in sampled test
- Generated QR was decoded by OpenCV: decoded content exactly equals voucher code
- Frontend Vite production build: not available here; requires PC confirmation
- MySQL live Create: not performed in sandbox; requires PC confirmation

Status: awaiting manual acceptance on PC. Do not mark Voucher R1 LOCKED yet.
