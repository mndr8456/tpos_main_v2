# TPOS Main V2 — Log Cash Drawer R1 Acceptance

## Scope

- This module records **manual observations of a physically opened cash drawer** while a Cash Shift is OPEN.
- It **does not open drawer hardware**, does not generate POS sales, and does not update any cash balances.
- Each observation is append-only, has a reason, is linked to tenant branch, shift and user, and receives a separate audit record in the same database transaction.
- `requestKey` (UUID) prevents retrying the same request from creating duplicate events. Reusing the key for different details is rejected.

## Installation (existing tenants)

Extract the `Changed Files Only` ZIP over `D:\www\tpos_main_v2\` (or the actual existing V2 root). Do **not** overwrite any `.env` file. From CMD:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:cash-drawer
npm run db:cash-drawer -- --apply
npm run db:cash-drawer
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Expected migration sequence: `MISSING → APPLIED → CURRENT` for a tenant without 014. The installer uses `read-only` checks without `--apply`.
Restart backend, refresh the browser, and sign out/in to refresh role grants.

## User acceptance tests (manual PC)

1. Sign in as OWNER, open **Cash Shifts**, open a new shift for the signed-in user if none is open. Keep it OPEN.
2. Go to **Log Cash Drawer**. Confirm a distinct page, with no fabricated drawer-hardware status: **Not Connected**.
3. Press **Record Drawer Opening**. Choose your OPEN shift, type a reason at least 8 characters (e.g. `Customer requested change`), then submit once.
4. Verify the new table row has Shift ID, Main Branch, cashier, actor, reason and UTC event timestamp rendered in MYT.
5. Confirm the Cash Shift **Opening Float**, **Cash In**, **Cash Out**, **Expected Cash** and **Variance** remain unchanged. The Log Cash Drawer must not post any money movement.
6. Press **Drawer Activity Log** and verify matching action, actor, shift and reason.
7. Export CSV as an authorized manager and open in Excel. Verify values match the table.
8. Sign in as CASHIER with an OPEN shift. Ensure CASHIER sees only own shift records, can record only in own OPEN shift and cannot see the export/audit options.
9. As MANAGER, confirm the ability to view all tenant drawer records and record in an assigned branch's OPEN cashier shift, but not outside assigned branches.
10. As ACCOUNTANT, confirm view/audit/export **only**. Record button must not appear, and the API must deny a record attempt.
11. Close a shift, then attempt another record for it. Expect `SHIFT_ALREADY_CLOSED` (HTTP 409).
12. Confirm the request is rejected if the reason is shorter than 8 characters, the shift is unknown, or the user lacks permission.

## Roles

| Role | View | Record own OPEN shift | Record other OPEN shift | Audit/Export |
|---|---|---|---|---|
| OWNER / ADMIN | All | Yes | Yes | Yes |
| MANAGER | All | Yes | Assigned branch only | Yes |
| ACCOUNTANT | All | No | No | Yes |
| SUPERVISOR | Own | Yes | No | No |
| CASHIER | Own | Yes | No | No |

No role is granted access to physical hardware opening via the R1 API.

## Integration boundary

A future POS Terminal hardware adapter will need explicit authorization and device acknowledgments before any **hardware-open success** status can be recorded. The R1 event `MANUAL_OPEN` is not such an acknowledgment. Cash Drawer logs and Cash Shift manual movements must remain distinct.

## Tests run before delivery

- Backend `npm run check` — PASS.
- Cash Drawer R1 contract tests — 7/7 PASS.
- Selected previous Shift/Factory tests including Foundation — 32/32 PASS (with a local test-only `.env` file, not distributed).
- Frontend JSX parser and CSS parser — PASS.
- Full backend regression and frontend Vite build — NOT VERIFIED in this environment because the npm dependencies could not be installed; run on the PC.
- MySQL installation, authorization and business acceptance — NOT VERIFIED until PC test.
