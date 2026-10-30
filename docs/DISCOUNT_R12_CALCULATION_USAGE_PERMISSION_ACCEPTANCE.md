# Discount R1.2 — Calculation Preview, Usage Limit & Role Permissions

## Scope

Changed files only. Discount R1 and R1.1 remain installed. No SQL changes, no repeat of `009_tenant_discounts.sql`, no `.env`, and no changes to User, Category, Supplier, Product, Dashboard or Voucher.

The new `Calculator` icon appears in each Discount row. It calls the existing tenant-isolated read-only `POST /api/v2/discounts/:id/preview-calculation` endpoint, with an optional `simulatedUsageCount` to test the Usage Limit boundary without real POS transactions.

**Safety:** `preview:true`, `posting:false`, the actual `usage_count` remains unchanged, and no sales, voucher, stock or accounting records are created. Any simulation value is *what-if only* and must not be treated as a real redemption.

## Install

Extract this ZIP into `D:\www\tpos_main_v2\` and replace only the listed files. Do not apply SQL.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart the backend, refresh the browser, and open Discounts.

## PC acceptance matrix (use dedicated disposable test discounts)

1. **Calculation percentage:** Create `CALC_R12_10` (ORDER, ALL, 10%, Active). Press Calculator. Input subtotal `100.00`, press Calculate. Expect **Eligible / RM 10.00**. With `19.95`, expect **RM 2.00**. Audit log and `usage_count` must remain unchanged by preview.
2. **Cap & fixed:** Create an active percentage discount with 20%, Maximum Discount `3.50`, subtotal `100.00` → **RM 3.50**. Create Fixed Amount RM 200 on subtotal `100.00` → **RM 100.00**. No negative totals.
3. **Minimum Spend:** Create 10% with minimum RM 100.00. Subtotal `99.99` → **Not Eligible / MINIMUM_SPEND_NOT_MET** (friendly UI text); `100.00` → **Eligible / RM 10.00**.
4. **Product/Category targeting:** Use active ITEM discounts with one selected Product or Category. Select a product *inside* the target → Eligible. Select an active product *outside* the target → Not Eligible / target not eligible. Do not alter the target category in the browser to bypass the server lookup.
5. **Usage Limit simulation:** On a test discount with Usage Limit `2`, open Calculator, check `Simulate Usage Count`. Try `1` → eligible, `2` → Not Eligible / limit reached; untick simulation → preview uses actual usage count (`0` until POS integration). Re-open View Discount and confirm actual `Usage Count` did not change.
6. **Dates & status:** For a disposable test discount, use a future Start Date → Not Started; use an expired End Date → Expired; set Inactive → Inactive. Preview's date is Asia/Kuala_Lumpur, returned by backend. Restore or archive test discounts afterwards.
7. **Permissions (separate test accounts, only if available):** OWNER/ADMIN: full management; MANAGER: view/create/edit/import/export/audit, **no archive**; ACCOUNTANT/SUPERVISOR: view + export + calculator only; CASHIER without `discounts.view`: no Discount navigation and API must respond **403**. Always check both icons and backend response—hiding buttons alone is not permission enforcement.
8. **Regression:** Recheck current Discount Create, Edit, View, Import Preview/Confirm, Export CSV, PDF and Activity Log. Existing User, Category, Supplier, Product and Dashboard modules must not be changed.

## Expected evidence

Capture `npm run check`, `npm test`, `npm run build`, plus screenshots or a complete screen recording of items 1–7. Do not mark Discount R1 LULUS/LOCKED until real PC acceptance is verified.

## Notes

- No live payment, POS redemption, order recalculation, promotion stacking or voucher stacking is implemented in this phase.
- Targeted ITEM preview uses the entered eligible item subtotal and validates the chosen product/category against the saved targets; it is not a transaction-level basket pricing engine.
- The read-only discount preview does not authorize any future POS discount redemption automatically. POS will need its own transaction-time checks and atomic usage updates.
