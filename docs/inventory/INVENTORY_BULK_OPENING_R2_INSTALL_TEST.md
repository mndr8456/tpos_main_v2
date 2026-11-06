# TPOS Main V2 — Bulk Opening Stock R2 (OWNER/ADMIN)

## Scope

This patch adds **Quick Entry**, **Import CSV**, server **Preview** and **Confirm** in Stock / Inventory. It preserves the accepted Product stock sync R1.1, single Opening Stock and Stock In, inventory 2-decimal values, branch moving weighted average, permissions, and all historical inventory movements.

- One transaction per batch: **either every selected opening is posted or none is posted**.
- Only `OWNER` or `ADMIN` with `inventory.opening` can Preview/Confirm. Existing Role Permission R1 is not reset.
- Products must be ACTIVE, GOODS, SINGLE, track stock and **not already initialized for the selected branch**.
- `0.00` quantity is an **explicit** zero opening; its Actual Unit Cost must be `0.00`.
- Blank CSV quantity means **skip the row**, not zero opening.
- Actual Unit Cost defaults to Product Reference Purchase Cost only as a **suggestion**; OWNER must verify it. Historical Moving Weighted Average stays independent of Product reference cost.
- One batch contains **1–1000 SKU rows**, a single branch, 2-decimal quantities/costs. The CSV maximum is 2 MiB.
- Separate audit table preserves every submitted actual unit cost, branch, actor, time, quantity, opening value and movement ID; no GL journal is posted.
- A Preview token is valid for 15 minutes, bound to the batch payload and user. Changing any quantity, cost, branch or reference requires a new Preview.
- A transaction already committed with the same batch key is idempotently returned, not posted twice.

## Install / backup

1. Stop the backend and backup all affected **V2** tenant databases. Do **not** touch V1 or previously accepted migrations 022/023/035/036/037.
2. Extract `tpos_main_v2/` contents from the ZIP into the active PC source root, e.g. `D:\www\tpos_main_v2`, with **Replace/Overwrite**.
3. From the backend directory, inspect the files and run read-only migration check:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node scripts\verify-inventory-bulk-r2.js
npm run db:inventory:bulk-opening
```

Expected per active tenant: `MISSING_OR_PARTIAL` with `repairable:true`, `blockers:[]`; or `CURRENT`. `MANUAL_REVIEW` or `FAILED`: **stop** and share the diagnostic; do not force SQL changes.

4. ONLY if required and safe, with backup complete:

```cmd
npm run db:inventory:bulk-opening -- --apply
npm run db:inventory:bulk-opening
```

Expected final for each active tenant: `CURRENT`, `failed:0`. The new migration is `database/038_tenant_inventory_bulk_opening.sql`. It creates two new tenant-local audit tables and a setup-history marker; it does not alter any Product/Inventory history or post journals. New tenants automatically provision migration 038 after 037.

## Automated PC checks

```cmd
node --test tests/inventory-bulk-opening-r2.test.js
node --test tests/product-inventory-owner-sync-r1.test.js
npm test
cd ..\frontend
npm run build
```

## Live OWNER test — using a new test tenant

1. Log in as OWNER, create 3 tracked SINGLE GOODS products and configure reference costs; choose the correct branch. Do **not** use products already initialized.
2. Stock / Inventory → **Bulk Opening Stock** → Quick Entry. Enter `5.00` / `2.50` for one product, `0.00` / `0.00` for a second. The third product remains blank/unselected.
3. **Preview** must show 2 valid rows, 0 errors, total quantity `5.00`, opening value `12.50`. Check the confirmation acknowledgement and **Confirm**.
4. Verify two initialized branch balances, one zero QOH, and two immutable `OPENING` movements. Product list and View/Edit show exactly these branch quantities. Repeat Confirm using the same request if network retry is needed; there must be **no extra opening**.
5. Test the CSV Template → fill a new uninitialized product with quantity/cost → Choose CSV → Preview → Confirm. Verify that CSV rows with blank quantity are not opened.
6. Negative tests: duplicate SKU, wrong branch code, invalid `1.234` quantity, missing Actual Cost, existing initialized balance, and changed input after Preview. **No partial posting** in any case.
7. Switch to another branch; Opening Stock must be independent for that branch. Verify OWNER/ADMIN permissions, and that SUPERVISOR/CASHIER do not gain the Bulk Opening action even if legacy grants are present.
8. Verify existing single Opening Stock, Stock In, stock movements, moving weighted average, and existing POS receipt functionality remain unchanged. Confirm **no accounting journal** from physical opening.

## Rollback considerations

Do **not** manually delete audit tables if any bulk entries have been posted. The audit tables have foreign keys to existing movements and are part of the permanent accounting/inventory evidence. If installation fails, stop and inspect status; never drop historical inventory data as a shortcut. Read-only checks are safe to rerun; `--apply` is only for repairable states.

**Acceptance:** Static tests do not prove MySQL migration, browser rendering, or actual live transaction behaviour. This R2 remains **PENDING PC ACCEPTANCE** until the user confirms it after testing.
