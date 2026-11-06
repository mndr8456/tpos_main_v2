# TPOS Main V2 — Order Terminal WAITER R1 (Take Away + Dine In)

**Base:** `tpos_main_v2 LATEST_06112026_2220.zip`; **reference:** V1 `WaiterOrderPage.jsx` and Restaurant Tables, but V1 DB is NOT used or modified.

## Feature boundaries

- WAITER (or roles explicitly granted) may submit **Take Away** (no table) and **Dine In** (select AVAILABLE table) orders from a dedicated Order Terminal page **without a Cash Shift**.
- Order contents (SKU, barcode, unit price snapshot, quantity and item/order notes) are recorded in the **tenant's waiter order tables** with an immutable audit. The saved order is **SUBMITTED**, not paid.
- **CASHIER** (or permitted management role) must have an **OPEN Cash Shift** in the same branch. POS Terminal → **Pending Waiter Orders** → **Review** → **Receive** creates a regular cashier-owned **HELD POS draft**. Use Resume, verify live quote and stock, then existing POS Checkout.
- One live waiter order or active POS draft may occupy a Dine In table at a time. A submitted waiter order reserves table occupancy until it is claimed or cancelled. Restaurant Tables and POS both show it as OCCUPIED.
- WAITER can cancel their own **unclaimed** submitted order, recording a reason of at least 8 characters. A claimed order cannot be cancelled from the waiter terminal.
- All server writes are scoped to the authenticated tenant, permitted branch, role permissions, and an explicit user command. No client-supplied cost, tax, checkout amount or stock posting is trusted.
- No waiter API posts financial journals, payment, receipt, product stock, Cash Shift movement, or KDS ticket. **KDS is still PLANNED**. No direct kitchen dispatch, order modification after submission, or adding a second order to a currently occupied/claimed table is claimed as implemented in R1.
- Product Set/Bundle/Pack uses the existing POS restriction until its composition adapter is built. Live stock is authoritative and checked at POS checkout again.

## Installed roles

- WAITER: `order_terminal.view`, `order_terminal.create`, `order_terminal.cancel` by default.
- OWNER / ADMIN: same access for validation and supervision.
- CASHIER, OWNER, ADMIN, MANAGER, SUPERVISOR: `order_terminal.receive` by default, but the claim endpoint additionally requires `pos.view`, `pos.cart.manage`, allowed branch and an open Cash Shift. These can be modified in the approved Role Permissions matrix, except locked OWNER rules.
- `Restaurant Tables` continues view-only for WAITER and CASHIER.

## Safe installation (Windows PC)

1. Back up the **V2** database. Never alter or delete V1. Stop backend before replacing files.
2. Extract **Changed Files Only** ZIP into `D:\www` (the ZIP has top-level `tpos_main_v2\`); replace matching files, keep all other files and both `.env` files unchanged.
3. From `D:\www\tpos_main_v2\backend`:

```cmd
npm run check
node scripts/verify-order-terminal-r1.js
npm run db:order-terminal
```

4. The first check should report `MISSING_OR_PARTIAL`, `repairable:true`, `blockers:[]` on current tenants. Only if all checks are safe:

```cmd
npm run db:order-terminal -- --apply
npm run db:order-terminal
```

5. Verify `CURRENT`, `failed:0` and **do not reapply**. If `MANUAL_REVIEW` or `FAILED`, do not attempt repair manually; share all diagnostics. New tenants get `039` during automatic provisioning, no installer required for them.
6. Run tests:

```cmd
node --test tests/order-terminal-waiter-r1.test.js
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

7. Restart both backend and frontend, hard-refresh browser and sign out/sign in as WAITER or CASHIER to refresh role grants.

## Acceptance test — two test users in the SAME tenant

**Take Away:** Login WAITER → Order Terminal → Take Away → select branch → add 2 normal SINGLE products → adjust quantities and line notes → Send Order to Cashier. Confirm status SUBMITTED; no sale/stock/payment/cash movement posted. Login CASHIER and open Cash Shift → POS Terminal → Pending Waiter Orders → Review → Receive. Confirm one HELD draft with same product IDs, quantity, price, notes in audit, and Take Away order scope. Resume draft; verify POS quote and checkout (optional test). Confirm no second waiter order is created when the same request is retried.

**Dine In:** Set up an AVAILABLE restaurant table (Restaurant Tables), login WAITER → Dine In → choose available table → add items/notes → Submit. Confirm the table becomes OCCUPIED in Restaurant Tables and POS. Another WAITER/POS cannot take the same table. CASHIER (open Cash Shift) → Pending Waiter Orders → Review → Receive → HELD draft inherits exactly the same table. Waiter record becomes CLAIMED, not duplicated. Hold retains occupancy; valid Checkout or Discard releases it following existing POS rules.

**Cancellation:** Submit another Dine In order on a different AVAILABLE test table, view order, cancel with a meaningful 8+ char reason. Table returns to AVAILABLE. Repeated cancel or attempting to cancel already CLAIMED order must be refused and no second audit or accounting record is created.

**Permissions / Tenant Isolation:** WAITER cannot reach POS cashier cash checkout APIs without separate grants, cannot view another waiter's orders, and cannot submit to other branches. CASHIER cannot claim orders of other branches, without an open Cash Shift, or without `order_terminal.receive`. Different tenant sees none of the orders. Only roles with `order_terminal.view` see Order Terminal navigation.

## Verification status

`node --check`, 15 focused tests, and legacy navigation/role tests were run during development. **Live MySQL migration, full backend regression, Vite build and real PC UI are PENDING** and must not be represented as LULUS before user confirmation.
