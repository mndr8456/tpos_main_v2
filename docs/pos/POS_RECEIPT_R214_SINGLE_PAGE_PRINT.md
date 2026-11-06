# TPOS Main V2 — POS Receipt R2.1.4 (Single Document Print)

## Cause confirmed from 20261105-1448-34.4272508.mp4
Chrome Print Preview displayed **2 pages containing the same receipt** for a DuitNow QR payment. The POS receipt button called `window.print()` while the modal was inside a `position: fixed` `.overlay`; global print rules only hid the POS layout using `visibility:hidden`. The fixed modal could be repeated across generated print pages. This is a print rendering issue, NOT a second posted sale.

## Fix
- Print Receipt creates a short-lived, same-origin, isolated print iframe containing exactly one cloned rendered receipt. The full POS application, fixed modal, and navigation never enter the print document.
- Uses the existing approved `PosCashReceipt` markup and CSS; receipt number, cash/noncash method, amount, reference, line items and totals stay unchanged.
- Dynamically sizes print paper at 80mm width to the content height (with a safety margin). Most short receipts print as one page in Chrome / Save as PDF. Very long receipts or specific thermal-printer driver limitations can still paginate; select the printer's receipt-roll paper profile if needed.
- The iframe is removed on afterprint (with a cleanup fallback). No DB/backend/API changes or migration.

## Installation
1. Back up the two existing frontend JSX files.
2. Copy the changed files under `tpos_main_v2` into the same active project root, e.g. `D:\www\tpos_main_v2`.
3. Do not rerun migration 035 (already CURRENT on tenant 1).
4. From backend run `node --test tests/pos-receipt-single-page-r214.test.js` and `npm test`.
5. From frontend run `npm run build`, restart the Vite frontend, and hard refresh the browser.

## PC acceptance steps
- With a previously completed DuitNow QR payment, choose **Print Receipt** and examine Chrome Print Preview. A typical 2-item receipt should show exactly **1 page**, with one receipt number, one Grand Total, the payment method and its transaction reference.
- Repeat using a Cash receipt. No second page should be generated from a duplicated fixed modal.
- Verify the original sale, stock movement, accounting journal, and Cash Shift totals have not changed. Printing is read-only; it never posts payment again.
- On a thermal printer, set the correct 80mm receipt paper profile and disable browser headers/footers if the driver overrides CSS page size.

## Local results
- New focused static tests: 3/3 PASS.
- Related POS regression: 30/30 PASS.
- Headless Chromium independent print document test: exactly one rendered receipt and PDF page count **1** (80mm x 241mm sample).
- Complete backend regression in this sandbox was not completed to a clean summary; PC `npm test` and `npm run build` are still required.

## Scope
This patch does not enable new provider integrations or change the accepted payment / journal security rules. It fixes only receipt printing. Status remains **Pending PC Acceptance** until user confirms.
