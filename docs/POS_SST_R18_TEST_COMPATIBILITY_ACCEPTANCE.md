# TPOS Main V2 — POS SST R1.8 Legacy Test Compatibility

## Purpose
The Product SST R1.7 acceptance removed the "SST Price Inclusive" input and made
POS tenant SST quotations exclusive for eligible products. An older R1.6 test
(`backend/tests/pos-sst-subtotal-r16.test.js`) still expected inclusive behavior
and the removed checkbox. It caused 2 stale assertion failures, even though the
current POS R1.7 tests passed.

## Changed file
- `backend/tests/pos-sst-subtotal-r16.test.js` — full replacement test file.

No production source, frontend files, database schema, migration, `.env`, or
historical business records are modified.

## Current expected behavior
- Tenant GST/SST Settings supply the ON/OFF state and rate.
- Product SST Type selects which registered tax is eligible.
- Legacy `jkdm_tax_inclusive` data is retained for audit/CSV compatibility but
  does not override the approved exclusive POS quote behavior.
- Product Add/Edit has no SST Price Inclusive checkbox.
- RM10.50 x 2 at 8%: base RM21.00, Sales Tax RM1.68, before-rounding RM22.68;
  final BNM-rounded payable amount RM22.70 (5 sen mechanism).
- Mixed RM45.00 example with only RM21.00 taxable at 8%: tax RM1.68;
  before rounding RM46.68; rounding +RM0.02; Total RM46.70.
- Sales Tax and Service Tax are separate, and tenant disabled/unregistered tax
  is not charged.

## Installation
1. Extract ZIP at `D:\www\tpos_main_v2\` and replace ONLY the included test file.
2. Open a command prompt and run:

   cd /d D:\www\tpos_main_v2\backend
   npm run check
   npm test

No SQL, database installer, frontend build or backend restart is required for
this test-only change. Do not overwrite local `.env`.

## Local verification of the combined source used to build this ZIP
- Reproduced original two assertion failures against the R1.7 source.
- Updated R1.6 test: 6/6 PASS.
- Backend syntax check: PASS.
- Complete backend regression: 266/266 PASS.
- No UI acceptance or live MySQL transaction was performed by this package.

## Note
This package corrects stale automated tests only. It does not change the
business tax computation already delivered in Product SST R1.7.
