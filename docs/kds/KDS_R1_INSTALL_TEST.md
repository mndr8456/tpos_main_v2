# TPOS Main V2 — KDS R1 (Migration 040) — Installation & Live Acceptance

**Scope approved:** Kitchen / Drink / Dessert / Counter and any other active Preparation Stations; Pending → Preparing → Ready → Completed, status per item, Take Away + Dine In, auto refresh 10 seconds, kitchen ticket print/reprint, sound, fullscreen, 8/15/30-minute ageing warnings, immutable audit, and WAITER/CASHIER integration with zero duplicate tickets.

**BASELINE:** Source `tpos_main_v2 LATEST_06112026_2220.zip` plus accepted Order Terminal WAITER R1 + R1.1; do not replace accepted files with old source. Install this **Changed Files Only ZIP** over `D:\www\tpos_main_v2` using full-file overwrite. Do not overwrite `.env` or erase any existing tenant database. V1 databases must not be touched. Production hosting remains on HOLD.

## A. Preconditions

1. Tenant active; migration `039` Order Terminal must show `CURRENT`. Owner/ADMIN can log in.
2. In **Categories** → Preparation Stations, confirm active `KITCHEN`, `DRINK`, `DESSERT`, `COUNTER` (and any custom station required).
3. In **Products**, test items must have **Requires Preparation = YES** and a matching active Preparation Station. Products with Requires Preparation = NO must not create kitchen items.
4. For stock-tracked test products, seed real Opening Stock first. Never invent stock in KDS.
5. Create one KITCHEN user with assigned branch. CASHIER requires an open Cash Shift to receive WAITER orders or use POS; WAITER does **not** require a Cash Shift to submit.

## B. Non-destructive installation (Windows CMD)

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node scripts/verify-kds-r1.js
npm run db:order-terminal
npm run db:kds
```

First run should be `MISSING_OR_PARTIAL` with `repairable:true`, `invalid:[]`, `blockers:[]`. If migration is already `CURRENT`, **do not run --apply**. If status is `MANUAL_REVIEW`, `FAILED` or any blocker/invalid value exists, **stop** and share diagnostics. Only if safe:

```cmd
npm run db:kds -- --apply
npm run db:kds
```

Final output must show every active tenant `CURRENT`, `failed:0`, marker `kds_r1_040`. The installer is read-only by default, and only migration `040` is applied. No historical migration reset, no user data deletion.

Then verify:

```cmd
node --test tests/kds-r1.test.js
node --test tests/order-terminal-waiter-r1.test.js
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart backend/frontend and hard refresh browser. Frontend build warning about JS chunk size alone is not fatal. **Actual PC logs and live results are required; development tests are not live acceptance.**

## C. Live functional acceptance (OWNER / WAITER / CASHIER / KITCHEN)

1. **KITCHEN** logs in; lands on **KDS** if `kds.view` permission exists. Station and branch dropdowns show authorized choices only.
2. **WAITER Take Away**: send order containing one food (KITCHEN), one drink (DRINK), and one item with Requires Preparation=NO. KDS must show one original ticket split by station, excluding the non-preparation item; no payment or inventory movement.
3. **WAITER Dine In**: select an available table and send order with notes; KDS shows correct table, station, items, quantities and notes. Table remains occupied until the normal accepted flow releases it.
4. **CASHIER Receive**: open Cash Shift and receive that WAITER order into HELD POS draft. Existing kitchen ticket id must remain **unchanged**; **no second KDS ticket**. Cashier sees kitchen progress while viewing the POS draft.
5. **Direct POS order**: CASHIER creates its own F&B draft, adds items, clicks **Hold**, opens **Held / Saved Orders**, selects the saved draft, then clicks **Send to Kitchen**. KDS receives **one** ticket. Pressing Send a second time must return existing ticket, not create a duplicate.
6. **KDS item status**: choose one ticket with multiple items. Move an item PENDING → PREPARING → READY → COMPLETED; verify station summary accurately reflects mixed states. Whole-station button works only when all items have the same status. Reversals and stale version updates must fail.
7. **Read-only status**: WAITER View Order and CASHIER POS show kitchen status per station; status updates are visible on refresh/within 10 seconds. They do not change billing or Cash Shift.
8. **Cancel before start**: WAITER cancels an unclaimed order with reason ≥8 characters. KDS lines change to CANCELLED, ticket leaves the active board and Dine In table is released.
9. **Cancel after preparation starts**: WAITER cancellation must be blocked with `WAITER_KITCHEN_ALREADY_STARTED`; only OWNER/ADMIN with `kds.cancel` can cancel in KDS with reason, producing an audit record. If still unclaimed, WAITER order is also cancelled; if CASHIER already claimed, resolve POS draft separately.
10. **POS after dispatch**: Resuming a HELD order and checkout are allowed, but item/table changes must be denied with `POS_KDS_DISPATCHED_ORDER_LOCKED` to prevent kitchen/POS mismatch. If preparation has started, normal Discard must require OWNER/ADMIN KDS cancellation first (`POS_KDS_CANCEL_REQUIRED`). An unstarted kitchen ticket can be auto-cancelled on Discard in the same transaction.
11. **Print/Reprint**: from KDS, print a station-specific ticket containing source number, Dine In table or Take Away, station, full product names/quantities and item/order notes. Verify scanner-independent kitchen receipt output with a thermal printer or PDF print preview.
12. **Filters, sound, fullscreen, ageing, audit**: test All/individual stations, Pending/Preparing/Ready, History, sound toggle, fullscreen; check 8/15/30 min ageing warnings and append-only status/cancellation audit.
13. **Isolation/permissions**: try unauthorized KITCHEN branch, WAITER/CASHIER KDS status updates and another user's POS source details; all must be refused. OWNER and ADMIN can monitor as permitted; KITCHEN cannot cancel started orders. Role Permission KDS module is live rather than Planned.
14. **Existing approved modules**: verify no regression in Product, Inventory, Stock Cost, Print Codes, Restaurant Tables, Shift Cash, WAITER R1.1, Payment Methods, POS Checkout and Receipt.

## D. R1 boundaries

- There is no sale, stock issue, voucher reservation, invoice, cash movement, payment or accounting journal created by KDS. Financial posting remains in POS only.
- KDS tickets are immutable snapshots; changing product master data after dispatch must not retroactively change a kitchen ticket.
- Kitchen status `READY` means ready for pickup/serving; **not** payment settled. `COMPLETED` means kitchen handoff is complete; it does not close POS draft or mark sale paid.
- After dispatch, POS line/table mutation is blocked. New kitchen add-on/partial reissue workflows are outside KDS R1 and require a separate approved scope.
- Real-life KDS operation, MySQL transaction/concurrency verification and printer output must be confirmed by user before **LULUS / LOCKED**.
