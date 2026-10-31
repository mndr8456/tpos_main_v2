# TPOS Main V2 — POS R1.6: SST Reconciled Total (Changed Files Only)

## Purpose
POS R1.5 already calculates SST from the tenant GST / SST Settings. If a Product Master has `SST Price Inclusive = ON`, the tax is already contained in the item's selling price. It must **not** be charged a second time. Previously the seven-line bill showed the gross subtotal together with included tax, which did not reconcile arithmetically on screen.

### New display logic
- Top **Subtotal**: gross selling prices in cart (unchanged).
- Seven-line breakdown **Subtotal (before SST)**: gross subtotal less SST already included in selling prices. The original label `Subtotal` is retained when there is no included SST.
- **Sales Tax / Service Tax**: actual amount computed from tenant settings for eligible products. Included taxes are shown as disclosures and added back only to the net-of-tax summary subtotal, **not** double charged.
- **Total** remains backend-authoritative after discount, voucher, exclusive SST and BNM 5-sen rounding.
- Product checkbox now explains explicitly that checked means included and unchecked means the POS adds the SST when applicable. Existing checkbox values are NOT changed.

### Example based on reported screenshot
| Mode for product priced RM21.00 (remainder RM24.00 No SST) | Inclusive ON | Inclusive OFF |
| --- | ---: | ---: |
| Cart subtotal | RM45.00 | RM45.00 |
| Seven-line subtotal (before SST) | RM43.44 | RM45.00 |
| Sales Tax at tenant rate 8.00% | RM1.56 | RM1.68 |
| BNM rounding | RM0.00 | +RM0.02 |
| **Total** | **RM45.00** | **RM46.70** |

**To add Sales Tax on top:** Products → Edit → select the actual taxable product → SST Type = Sales Tax → **uncheck** `SST Price Inclusive` → Save → reopen/View and confirm `SST Price Inclusive: No` → return to POS and Refresh. If it remains Yes, no extra tax should be charged. The source-of-truth persisted value is `products.jkdm_tax_inclusive` in that tenant database. Do not update the database directly if the UI saves correctly.

### Install on Windows (no CMD installer)
1. Keep a backup of existing changed files.
2. Extract ZIP paths into the existing `D:\www\tpos_main_v2` project and replace only matching files. Leave `.env` and database untouched.
3. In `backend` run `npm run check`, `npm test` and restart backend.
4. In `frontend` run `npm run build`, then refresh the POS page with Ctrl+F5.
5. Check both existing-inclusive and newly-edited-exclusive scenarios; test Sales Tax OFF as well.

### Safety
- No new SQL or migration. No global change to inclusive flags. No re-running migration 018.
- Does not post a sale, modify inventory, redeem a voucher or mark a payment successful.
- Existing POS multitenant, BNM rounding, Hold → New Order, tax eligibility and owner-side GST / SST Settings remain unchanged.

### Validation performed in this environment
- `npm run check`: PASS
- `npm test`: 255/255 PASS with the 6 new cases
- `Products.jsx` and `PosTerminal.jsx` JSX parser: PASS
- Frontend Vite build: **not run** (dependencies not installed here), run on user PC.
