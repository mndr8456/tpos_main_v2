# TPOS Main V2 — Operational Dashboard & Sidebar R1

Source baseline: `tpos_main_v2 - LATEST_04112026_2022.zip` plus approved HR Leave Requests R1.1–R1.6. Delivery: changed **complete** files only. Do not edit V1, previously approved migrations 001–032, or local `.env`.

## Purpose and approved menu defaults

- **CASHIER**: Cash Shifts, own Profile, POS Terminal (landing page), Restaurant Tables, own Staff Profile, Attendance Clock, own Leave Requests, Log Cash Drawer.
- **WAITER**: Order Terminal (Planned — disabled), own Profile, Restaurant Tables, own Staff Profile, Attendance Clock, own Leave Requests.
- **KITCHEN**: KDS (Planned — disabled), own Profile, own Staff Profile, Attendance Clock, own Leave Requests.
- **STAFF**: Stock (with permission-controlled Stock In), own Profile, own Staff Profile, Attendance Clock, own Leave Requests.

All groups start collapsed every time the hamburger opens. One group expands at a time; selecting a page collapses it. Desktop sidebar pushes content; mobile sidebar overlays content and closes when a page is selected. `Master Data` has been renamed `Data` for all roles. The authenticated role's **permissions** still determine actual page availability; the frontend does not authorize API access by itself.

## One-time migration 033

`033_tenant_operational_navigation_stock_in.sql` makes the **initial role-grant adjustment** once, creating a durable marker in `tpos_feature_setup_history` to prevent any subsequent installer run from undoing changes made through a future Role Permissions page. It removes only `categories.view` / `products.view` grants seeded for CASHIER, WAITER, KITCHEN and STAFF. It adds WAITer table view; STAFF stock view and stock receive; OWNER/ADMIN receive; and OWNER/ADMIN/MANAGER/ACCOUNTANT valuation view. All other roles and permissions remain untouched. Tenant provisioning receives this migration after 032.

Read-only by default; apply requires explicit flag. Obtain a database backup before applying.

```bat
cd /d D:\www\tpos-main-V2\backend
npm run check
npm run db:operational-navigation
npm run db:operational-navigation -- --apply
npm run db:operational-navigation
node --test tests/operational-navigation-r1.test.js
npm test
cd /d D:\www\tpos-main-V2\frontend
npm run build
```

Expected migration verification: `status: CURRENT`, `failed: 0` per active V2 tenant. After restart backend and frontend, **sign out and sign in again for each role** to refresh the auth permission snapshot. No `.env`, central identity, staff, leave, sales or existing inventory balance migration is changed.

## Stock In — security model

- Requires `inventory.receive`; every mutation is authorized again by the API and restricted to assigned branches. STAFF do **not** get `inventory.opening`, `inventory.audit`, `inventory.valuation.view` or arbitrary stock adjustments.
- Requires an initialized product/branch (Opening Stock must have been recorded by OWNER/ADMIN), quantity greater than 0.00, an actual unit cost, and a reference of at least four characters.
- MySQL transaction locks branch/product and current stock balance, applies **Moving Weighted Average** using decimal BigInt math, increments version and writes a `RECEIPT` to the immutable `inventory_movements` ledger. A UUID request key and request hash prevent duplicate sequential posting.
- A physical stock receipt is **not** a supplier invoice or accounting journal. Cost reconciliation/invoice posting remains a future accounting step. No false paid journal is produced.
- STAFF can view quantities but not historic average costs or inventory carrying values. Valuation access is a distinct `inventory.valuation.view` permission.

## Live PC acceptance checklist

1. Login CASHIER: POS Terminal appears first, never Categories. Open hamburger: groups are closed. Choose Data to see Restaurant Tables only; HR shows Staff Profile, Attendance Clock and Leave Requests; Transactions shows Cash Shifts, POS Terminal and Log Cash Drawer; Profile is own only. A direct attempt to use removed Categories/Products API grants must be denied.
2. Login WAITER: Order Terminal is visibly **Planned** and not clickable; Restaurant Tables can be viewed but not edited; Profile, Staff Profile (self), Attendance Clock, Leave Requests (self) remain. No POS Terminal or Products.
3. Login KITCHEN: KDS appears **Planned**, not clickable. Profile and three HR own pages remain. No data catalog or POS Terminal.
4. Login STAFF: Stock opens, `Add Stock Quantity` works only for initialized stock in assigned branch; actual quantity increases once; retry does not duplicate. Confirm a wrong branch, zero quantity, unsupported product and mismatched retry are rejected. Verify no historic average cost or total carrying value is returned in STAFF balance API response.
5. Login OWNER/ADMIN/MANAGER: pre-existing Dashboard landing, table, HR, voucher, inventory and Settings routes remain accessible according to existing grants. Manager/Accountant stock valuation remains visible; Opening Stock stays OWNER/ADMIN-only.
6. Test Profile of each operational role: change own email with current password; sign in again, then change own password; cannot change another user's details.
7. Toggle hamburger twice (all groups closed each time), open HR then Data (only Data remains open), click a leaf (group closes); desktop pushes content, mobile overlay works.
8. Re-run `npm run db:operational-navigation`: must report `CURRENT` without changing permissions. Future Role Permissions edits must not be overridden by this installer.

## Development verification

- Backend `npm run check`: PASS
- Backend test suite on source: 565/565 PASS (0 failed), including new 10 operational-role/navigation/Stock In checks.
- Frontend JSX syntactic parse: PASS (App, MyProfile, Inventory).
- MySQL migration/application and frontend Vite production build: **not executed locally**; PC proof required.

**Acceptance:** Pending live verification. Do not mark LULUS before real PC testing of roles and Stock In.
