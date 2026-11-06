# TPOS Main V2 — Product / Stock Inventory Owner Sync R1

## Source and scope

Baseline: `tpos_main_v2 - Latest_05112026_1853.zip`, layered with accepted operational navigation, Role Permission R1, Payment Methods R1.1, POS Multi-Payment R2.1–R2.1.3 and POS Receipt R2.1.4–R2.1.7 patches. This ZIP contains full replacement files that changed, **not a full application**.

Reproduced as OWNER from screenshots: Product Master shows a fixed `—` in its Stock table column and no actual stock quantity in Edit, even though Stock / Inventory has `PRD-000144` in Main Branch with QOH `98.00`. Stock In's Actual Unit Cost starts at `0.00` even when Product Master has a reference cost. The pictured `5.00` reference cost accompanies selling price `7.50` (NG LADNA), whereas the Stock In screenshot selects a different product (AGLIO OLIO AYAM); do not assume their reference costs match.

## Corrected behavior

- Product Master Stock column is **live branch-specific QOH** from the existing tenant inventory `/inventory/balances` and `/inventory/meta` APIs. The stock branch can be selected. The list and View/Edit modal use the same live, read-only result. Add Product also displays a read-only `Not initialized` stock field, with instructions to record Opening Stock after the new product is saved.
- `0.00` = initialized with zero quantity; `Not initialized` = no branch opening balance; `Not tracked` = untracked product/service/bundle; `—` = unavailable or missing stock permission. There are no fake or duplicated Product stock fields.
- A new Product cannot directly set historical stock from Product Master. Use Stock / Inventory > Record Opening Stock, then Stock In. These operations retain audit, branch isolation and transactional moving weighted average.
- Stock In and Opening Stock suggest Product Master Reference Purchase Cost for the selected product when the signed-in role has both `inventory.view` and `products.cost.view`. This is a **suggested input value**, **not** the actual weighted average, and remains editable before posting. The actual supplier unit cost must be verified from invoice/receiving evidence.
- New read-only endpoint `/api/v2/inventory/reference-costs` is authenticated and requires both permissions. `/inventory/meta` continues to omit sensitive cost data. The endpoint uses the authenticated tenant database only. No client-supplied tenant ID is accepted.
- No changes to Inventory valuation, journal posting, stock movements, Product price/CSV contracts, POS checkout, receipt, migration 035–037, Role Permission, or V1.

## Installation (Windows PC)

1. Back up the existing application source and V2 tenant database. Stop backend/frontend.
2. Merge the **contents of** the ZIP's `tpos_main_v2` directory into the active `D:\www\tpos_main_v2` directory, using **Replace/Overwrite**. Do not copy the outer directory into itself.
3. Verify syntax and run tests:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/product-inventory-owner-sync-r1.test.js
node --test tests/inventory-opening-display-r12.test.js tests/inventory-opening-ui-r11.test.js tests/operational-navigation-r1.test.js
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

4. Restart backend/frontend; hard-refresh the browser. **No migration or `.env` change is required.**

## OWNER live PC acceptance (no unwanted stock posting)

1. Open Products, search SKU `PRD-000144`, select `Main Branch`. Compare Product Stock with Stock / Inventory QOH. If the original stock remains unchanged, both should show `98.00`.
2. Open Edit Product and View Product. Verify `Live Stock — Main Branch` is visible and read-only, while `Minimum Stock Qty (Alert Threshold)` is independent.
3. Switch the Stock Branch filter (if another branch exists). Verify quantities follow the selected branch and an uninitialized product is **not falsely shown as 0.00**.
4. Open Stock / Inventory > Add Stock Quantity for `PRD-000144`. As OWNER with cost permissions, `Actual Unit Cost (RM)` should suggest **the current Reference Purchase Cost of PRD-000144**, which must be checked in that product's own Edit form (do not assume the unrelated 5.00 screenshot applies). Edit the suggested value to verify it is not locked. **Press Cancel** unless recording a real supplier stock receipt.
5. Re-open the dialog to verify the reference suggestion is restored. Check that Stock / Inventory `Cost (RM)` still shows the branch **moving weighted average**, which may differ from Product Master Reference Purchase Cost (the screenshot showed a current moving average of `3.50` for PRD-000144).
6. Check that a role without `products.cost.view` cannot call `/api/v2/inventory/reference-costs`. It must not receive cost data. A role without `inventory.view` must not gain Product stock quantities from the Product page.
7. If doing an authorized real Stock In test, record a genuine receipt reference, confirm actual unit cost, save once and verify stock increments once on **both** pages. The movement and WAC must remain correct, with no duplicated journal or stock entry.

## Development checks

- Local Node syntax: backend `app.js`, `inventory.js`, helper `product-inventory-sync.js` PASS.
- TypeScript JSX transpilation/parsing: `Products.jsx`, `Inventory.jsx` PASS.
- Targeted static/pure-logic regressions: **28/28 PASS**, including existing opening-stock, inventory security, operational navigation tests.
- **Full backend suite, production Vite build and live MySQL/UI were not executed here** because this build environment lacks project npm dependencies. Run on the user's Windows PC before any LULUS decision.
