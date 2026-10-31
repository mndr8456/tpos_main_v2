# TPOS Main V2 — Product SST Tenant Rate R1.6

## Scope

Change Product Master Add/Edit/View only. Preserve the approved Product, GST/SST Settings and POS Terminal layouts and operations.

- Product Add/Edit section heading follows the selected SST Type: `SST — Sales Tax`, `SST — Service Tax`, or `SST — No SST`.
- The product's SST Type remains selectable. `SST Price Inclusive` appears for taxable products. Choosing `No SST` clears the inclusive flag and any in-form rate.
- Remove the independently editable `SST Rate (%)` field from Product Add/Edit. Tenant GST/SST Settings determine the active tax rate and on/off status at POS quote time.
- Product View displays `Rate Source: GST / SST Settings (tenant)` instead of an obsolete stored product-specific rate.
- Retain legacy `jkdm_tax_rate` payload/CSV column for backward compatibility; do not rewrite historical product rates during routine edits. Actual POS quote uses the rate and activation state of the authenticated tenant.
- Sales Tax and Service Tax remain distinct, and LHDN / MyInvois fields remain separate.
- No changes to database, `.env`, tax setting API, POS calculations, permissions or other accepted modules.

## Installation

Extract `frontend/src/Products.jsx` to `D:\www\tpos_main_v2\frontend\src\Products.jsx`, replacing the existing complete file.

Optional automated test: place `backend/tests/product-sst-settings-rate-r16.test.js` into the corresponding backend tests folder.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restarting the backend or re-running SQL 017/018 is **not required** by this frontend-only change. Refresh the frontend with Ctrl+F5.

## Live Acceptance on PC

1. Open Products > Add Product and choose `Sales Tax`. Heading: `SST — Sales Tax`; `SST Price Inclusive` checkbox visible; no editable `SST Rate (%)` field.
2. Choose `Service Tax`. Heading changes; the inclusive checkbox remains available, while Sales Tax and Service Tax selection stays mutually exclusive.
3. Choose `No SST`. Heading becomes `SST — No SST`; the inclusive checkbox is hidden and its value reset.
4. Edit an existing Product previously classified as Sales Tax. Save unchanged and verify the Product still retains its tax type and inclusive setting.
5. Open View Product and verify Rate Source refers to GST/SST Settings, not a historical product master rate.
6. With a legitimate registered tenant's GST/SST Settings ON and configured correctly, check a matching product in POS. The rate is taken from the tenant settings. For a price-inclusive product, the tax is included in Total; for an exclusive product, tax is added before BNM rounding. Switch the tenant tax OFF and verify the corresponding tax becomes RM0.00.
7. Verify product CSV import/export remains compatible, and all approved modules are unchanged.

**Production warning:** SST applicability and rates must be configured to reflect the actual registered business and taxable supplies. Do not enable SST for unrelated products based solely on general category or an example percentage.

## Local Verification

- Node backend syntax check: PASS.
- Full backend regression: 249/249 PASS, including 6 specific Product-SST tests.
- Frontend Vite build: not run in this environment due to unavailable frontend dependencies. Run on your PC before accepting.
- No live MySQL transaction performed in the development environment.
