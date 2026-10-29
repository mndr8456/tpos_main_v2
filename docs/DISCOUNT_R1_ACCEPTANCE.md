# TPOS Main V2 Clean Rebuild — Discount R1 Acceptance

Source baseline: `tpos_main_v2-LATEST_29102026_2257.zip` (29 October 2026).
Behavior reference only: `tpos_main_v2-v1-reference-backup.zip`.

## Scope

Standalone **Discount Master**. V1 semantics retained: Percentage/Fixed Amount, Order/Item, minimum spend, maximum discount cap, start/end dates, active/inactive status, ordering. V2 introduces optional target lists by Category or Product (Item only), a configured usage limit, change audit, permission guards, CSV Preview/Confirm, CSV export and browser Print / Save PDF. Discount code is unique and never recycled after archive to preserve historical identity.

This R1 does **not** post POS sales, journal entries, stock changes, redeem vouchers, reserve usage, or increment usage counters. The pure calculation and management-only preview are prepared for POS integration later; do not treat a UI preview as checkout authorization. POS must validate actual server-side cart lines, discount stacking, usage reservations, tax order, rounding and transaction atomicity in a later phase. Discount and Voucher remain independent modules.

## Installation — existing V2 tenant

1. Extract this ZIP at `D:\www\tpos_main_v2\` preserving directory paths. Replace only the changed files. Back up your current files first.
2. **Do not replace either `.env`.** No `.env`, V1 source or tenant images are in this ZIP.
3. Open CMD in `D:\www\tpos_main_v2\backend` and run `npm run db:discounts` (read-only). An existing Product R3 tenant should show `MISSING` for Discount R1 before installation.
4. Run `npm run db:discounts -- --apply` **once** to add `009_tenant_discounts.sql` and grants to active tenant DBs. Re-running is idempotent, but not required.
5. Run `npm run db:discounts` again; confirm `CURRENT` for every active tenant. No Product SQL R2/R3 rerun is needed.
6. Run `npm run check` and `npm test` in `backend`. Then restart backend.
7. Run `npm run build` in `frontend`. Restart Vite if needed; sign out and sign in to refresh permission claims.

## Expected behavior on PC

- Sidebar shows Discounts for permission `discounts.view`, with original module menus unchanged.
- Create a PERCENTAGE/ORDER discount `WELCOME10`, value 10.00, minimum spend 0.00, status ACTIVE. Verify it is listed and Activity Log shows the creator's name.
- Edit and view the discount; change dates, cap, scope and status. `0.00` display format used for amounts. The UI must not show text buttons for row actions.
- Create an ITEM discount restricted to two Product SKUs, then one restricted to Categories. Only active products/categories are selectable; Order scope cannot contain product/category targets.
- Reject invalid percentage (greater than 100), zero discount value, invalid date range and duplicate code.
- Import CSV template via Preview then Confirm; test quoted commas, duplicate codes, invalid targets and full atomic rejection. Limit: 1,000 rows / 1 MiB.
- Export CSV, open browser Print / Save PDF with business name and real discount records.
- Archive discount; it disappears from active list but remains in Activity Log. Do not reuse the code.
- Test permitted OWNER / ADMIN / MANAGER operations and a user without `discounts.view`/`discounts.create`; confirm 403 for unauthorized API routes.
- Verify User, Category, Supplier, Product and Dashboard continue to operate as before.

## Read-only management calculation preview

`POST /api/v2/discounts/:id/preview-calculation` with authenticated `discounts.view` permission, JSON `{"eligibleSubtotal":100.00,"productId":1}`. The backend derives the product's real category and active status. Results contain `{preview:true,posting:false,eligible,reason,amount}`. This does not reserve or redeem a discount. Malaysia local date is used for schedule checks; each monetary result is rounded to a sen once, with cap and subtotal safeguards.

## Test evidence before shipping

- Syntax check `npm run check`: PASS on available local Node runtime.
- Backend regression test suite: **97/97 PASS** in local isolated source after creating the `.gitignore` file expected by pre-existing Foundation tests (the supplied source ZIP omitted that file). Do not include it in the changed-files package.
- JSX syntax: TypeScript TSX parser PASS (`App.jsx` and `Discounts.jsx`).
- Frontend production build: **not verified** in this environment if npm dependencies cannot be installed; please run `npm run build` on the deployment PC.
- Real MySQL integration, permissions with live accounts, manual UI acceptance and POS integration: **not verified**.

Status: **DELIVERED FOR PC TEST, NOT PASS/LOCKED**. User live evidence determines acceptance.
