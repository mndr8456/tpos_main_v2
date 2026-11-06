# TPOS Main V2 — Order Terminal WAITER R1.1
## Restaurant Tables legacy regression compatibility (2026-11-06)

### Purpose
Fix the two failing `restaurant-tables-r1.test.js` tests following installation of Order Terminal WAITER R1 / tenant migration `039`. The implementation of `assignPosTable` correctly queries `waiter_orders` to prevent the cashier from assigning a Dine In table that is already occupied by a submitted waiter order. The old test database stub did not recognize this query and threw `UNEXPECTED_SQL`.

### Changed full files
- `backend/tests/restaurant-tables-r1.test.js` — updated SQL mock to return the waiter reservation (if any). Extends the already existing occupied/unavailable table test to ensure a WAITER-occupied table also rejects POS assignment with no writes.
- `docs/orders/ORDER_TERMINAL_WAITER_R11_RESTAURANT_TABLE_REGRESSION_FIX.md` — this guide.

### Not changed
No production JavaScript, React UI, API, database schema, permissions, stock ledger, POS checkout, receipt, or order state is changed. No SQL migration and **no database --apply** are required. Tenant migration 039 was confirmed CURRENT in the supplied PC log. The new waiter table-occupancy protection remains intact. Do **not** remove the `waiter_orders` query from the backend.

### PC installation
1. Preserve a backup of the V2 project.
2. Extract the changed-files-only ZIP into `D:\www` and overwrite the matching path under `D:\www\tpos_main_v2`. Do not replace `.env`.
3. In a terminal run:

```cmd
cd /d D:\www\tpos_main_v2\backend
node --test tests/restaurant-tables-r1.test.js
node --test tests/order-terminal-waiter-r1.test.js
npm test
npm run check
```

Expected: Restaurant Tables 13/13 PASS; Order Terminal 15/15 PASS; full backend regression 676/676 PASS. If tests are added to the PC source later, its total may be greater. There are no frontend file changes, so repeating `npm run build` is optional; the user's previous Vite 1663-module build already passed for R1.

### Verification evidence (audit workspace)
- `npm run check`: PASS.
- Restaurant Tables + Order Terminal + Role Permissions + Navigation: 47/47 PASS.
- Full backend regression: 676/676 PASS (0 failed, 0 skipped).
- The audit ZIP excludes the live PC `.env`; only an example configuration was copied temporarily during the foundation test and immediately removed. No temporary `.env` is shipped.

### Acceptance
Developer regression PASS. Live WAITER Take Away and Dine In, table blocking, pending queue and CASHIER receive remain **PENDING PC acceptance**. Do not mark the Order Terminal module LULUS/LOCKED until the real UI workflow is validated.
