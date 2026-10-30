# TPOS Main V2 — Shift Cash R1 acceptance (migration 013)

## Installation

Extract **Changed Files Only** into `D:\www\tpos_main_v2\`, replacing the listed files. Back up changed files before extraction. Do not overwrite `.env` or reapply migrations 001–012.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:cash-shifts
npm run db:cash-shifts -- --apply
npm run db:cash-shifts
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

The expected first installation sequence is **MISSING → APPLIED → CURRENT** for each active tenant. Restart backend, refresh frontend, then logout/login to refresh permission metadata. A fresh tenant also provisions migration 013 automatically.

## Operator scenarios (real PC)

1. Sign in as CASHIER with one assigned branch. Open a cash shift using opening float **RM 100.00**. Shift ownership must always match the signed-in user and assigned branch. Open a second shift: expected **CASHIER_ALREADY_HAS_OPEN_SHIFT**.
2. Record **CASH_IN RM 25.50**, reason `Additional opening float`. Record **CASH_OUT RM 10.25**, reason `Cash petty expenses`. Expected balance (manual movements only) is **RM 115.25**. Check activity log contains OPEN, CASH_IN, CASH_OUT.
3. Close shift using **RM 114.00** counted. Manual variance should be **-RM 1.25**. Close same shift again: expected **SHIFT_ALREADY_CLOSED**. Attempts to record a new manual movement on a closed shift must be rejected.
4. Verify CASHIER can view **only their own** shifts, including history, and never another cashier’s shift by editing a URL/API ID. SUPERVISOR has own-shift scope. OWNER/ADMIN/MANAGER/ACCOUNTANT can view all. ACCOUNTANT must be read-only.
5. Verify manager close of another cashier’s shift requires at least 8 characters in notes and is limited to assigned branches. OWNER/ADMIN may manage across tenant branches.
6. Export visible shifts to CSV as authorized; unauthorized export must be denied. Export is read-only; there is **no historical financial import** for Shift Cash, to protect the audit ledger.
7. Review layout on standard desktop and narrow browser. Confirm Cash Shifts menu and modals do not overflow the topbar.

## Accounting and POS boundary

**Important:** `manual_expected_cash = opening_cash + manual_cash_in - manual_cash_out`. This is **not** a reconciled closing balance that includes POS cash sales. The variance shown is **provisional**. Shift R1 stores only opening/closing and explicitly entered manual movements. No POS sales, payment postings, stock movements, journal entries, or Cash Drawer Log events are manufactured.

Do not treat Shift R1 as a completed POS close-out, do not mark integration LOCKED until the POS Terminal and Cash Drawer Log are linked and acceptance-tested. The separate Cash Drawer Log is the next approved module.

## Permissions

| Role | Own shift | View all | Open own | Move own | Close own | Close other (branch guard) | Audit / export |
|---|---|---|---|---|---|---|---|
| OWNER / ADMIN | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| MANAGER | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| ACCOUNTANT | Yes | Yes | No | No | No | No | Yes |
| SUPERVISOR | Yes | No | Yes | Yes | Yes | No | Own activity only |
| CASHIER | Yes | No | Yes | Yes | Yes | No | Own activity only |

Other roles receive no Shift Cash grant by default. All operations are checked on the backend; UI visibility alone is not the authorization boundary.

## Migration and immutability

- `013_tenant_cash_shifts.sql` creates `cash_shifts`, `cash_shift_movements`, `cash_shift_audit_logs` and explicit permissions. No destructive SQL.
- Only one open shift per cashier is enforced using a unique generated-column index.
- Manual movements are append-only, have a unique `request_key`, and are committed with audit in one transaction. Neither update nor deletion of shift financial history is available through the API.
- Cashier ownership uses **authenticated tenant user ID**. No externally supplied tenant ID or cashier ID is accepted on opening a shift.
- Money is validated and calculated using integer sen; UTC instants are displayed as MYT in the frontend.

## Status

Ready for manual PC acceptance. A local test pass or static schema check does **not** demonstrate a live MySQL transaction, printer, multi-role login, or POS integration.
