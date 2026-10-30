# TPOS Main V2 — Voucher R1.4: Import, Voucher PDF, Unique-Code Print

## Installation

Baseline: Voucher R1.3 (Business Name, Validity Position, Print Copies).
Extract this ZIP into `D:\www\tpos_main_v2\` and replace the full files at their paths.

Changed files:

- `frontend/src/Vouchers.jsx` — full source; replaces broken import reference, CSV import dialog, CSV export button and duplicate-code copies action.
- `frontend/src/style.css` — full source; adds modal styles.
- `frontend/src/voucher-pdf.js` — new pure-JS PDF export helper, no external service or npm dependency.
- `backend/tests/vouchers-r14-import-pdf-select.test.js` — regression tests (no production backend change).

No SQL, `.env`, database change, or new npm package is required. Do not re-run migration 012.

## Behaviour

1. **Import:** click Upload → choose a CSV → Preview Import → review validation errors → Confirm Import (only when all rows are valid). The CSV format matches the backend template endpoint. Limits: 1,000 rows, 1 MiB. Import CSV still requires explicit unique voucher codes; automatic generation applies to the single-voucher Create form.
2. **Export PDF:** click `Export Vouchers PDF`, select unique voucher records, and click `Download Voucher PDF`. The browser downloads a real `.pdf` file, with one physical-size voucher page per selected code, including Business Name, barcode, centered validity, and QR.
3. **Print:** click Print on any voucher, then select additional distinct voucher records if needed. The old `Copies` control has been removed. Every selected unique voucher is printed once in that batch; one voucher per page. Do not increase printer Copies manually if unique physical codes are required.
4. **Print Settings:** OWNER-selected width × height in cm is preserved. Default: 18.55 cm × 8.45 cm.
5. **Security:** voucher reservation, redemption, release, usage counters, and API permissions are unchanged. A selection is deduplicated by voucher code, not just row ID.

## Important limitation

This prevents **duplicate voucher codes within a single generated PDF/print batch**, not reprints of the same voucher in a later job. A permanent issued/printed-code ledger would require a distinct database feature and live acceptance. If ten independently redeemable vouchers are needed, first create/import ten distinct voucher records, each with its own code; do not print ten copies of one code.

## PC verification

Run:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Then verify:

- `Import Vouchers CSV` opens a real modal, not a blank page.
- Template CSV downloads, Preview shows line validation, Confirm imports valid records, and invalid duplicates are rejected.
- PDF Export of two **distinct** vouchers downloads a two-page PDF at the saved owner paper size.
- Barcode and QR both encode the voucher code printed on that voucher.
- Print selection of two distinct codes shows two pages; the same code never appears twice in a job.
- View, Edit, code generation, print settings and permissions remain unchanged.

## Current test evidence

- Backend full regression: **140/140 PASS**, local test source with this patch.
- JavaScript/JSX parsing: PASS. CSS parsing: PASS.
- Real PDF integration test (local Canvas renderer): two unique vouchers generated two 18.55 × 8.45 cm pages; PDF reader reports two pages and QR scan reads the original voucher code. Duplicate input was filtered before PDF generation.
- Frontend Vite build in this environment: **not confirmed** (npm dependency installation failed). Run on the actual PC as above before acceptance.
- Voucher R1.4 not LOCKED until PC import/print/PDF acceptance.
