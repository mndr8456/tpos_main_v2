# TPOS Main V2 — HR Leave Requests R1.1: Remove CSV Import

**Status:** Code correction delivered; live PC approval pending.

## Scope

- Removes the Leave Requests CSV Import button/modal and all CSV template, preview and confirm functions.
- Removes the Leave Requests CSV API handlers and routes, not just the interface.
- Removes `leave_requests.import` from new API responses and revokes its grant plus permission from existing tenant databases.
- **Preserves migration 030 unchanged.** Existing tenant databases already applied 030; the additive, standalone migration 031 only removes the obsolete permission.
- Preserves existing request rows, historical audit records (including legacy enum values), attachments, balances, attendance, all other HR modules and PDF export.
- New tenant provisioning executes 031 immediately after 030.

## Installation

Merge full files under `tpos_main_v2/` into `D:\www\tpos-main-V2\` without creating a nested `tpos_main_v2` folder. Do not overwrite `.env` or reapply migration 030.

Back up your V2 tenant databases before any SQL migration. Close the existing Leave Requests page and stop normal backend/frontend processes while replacing files.

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
node --test tests/hr-leave-requests-r1.test.js
npm run db:leave-requests:no-import
```

The initial read-only command should show `MISSING` if the old import permission remains, and must report `failed:0`. Review the result and run:

```cmd
npm run db:leave-requests:no-import -- --apply
npm run db:leave-requests:no-import
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

After applying, verify `CURRENT` for every ACTIVE tenant, `failed:0`, and no obsolete permission/grants. Restart backend/frontend, re-login, and reload the Leave Requests page.

## Read-only MySQL check (V2 tenant only)

```sql
SELECT code FROM permissions WHERE code='leave_requests.import';
SELECT role_id,permission_code FROM role_permissions WHERE permission_code='leave_requests.import';
SELECT COUNT(*) AS leave_requests FROM hr_leave_requests;
SELECT COUNT(*) AS postings FROM hr_leave_request_postings;
```

The two permission queries should return **0 rows** after migration 031. The migration contains no writes to leave requests, balance postings or attendance.

## Live acceptance

1. Open HR → Leave Requests: no Import button or Import CSV modal; Refresh, PDF and New Request remain.
2. Calling old `GET /api/v2/leave-requests/import/template`, `POST /api/v2/leave-requests/import/preview`, or `POST /api/v2/leave-requests/import/confirm` must not import or create a request. Confirm no rows were inserted.
3. Submit a staff request using the form (self-scoped); check Pending balance posting.
4. Approve/Reject with Owner/Admin/HR and verify existing attendance/balance/audit rules still work.
5. Export `Leave Requests.pdf` using Search/Filter; ensure no import capability is reintroduced.
6. Repeat the migration inspector without `--apply`; status must remain `CURRENT`.

**Important:** `030_tenant_hr_leave_requests.sql` retains legacy `IMPORT_CREATE` enum definitions solely for historical audit compatibility; API and UI import paths no longer exist. **This change does not delete any historical records.**

Do not mark PASS/LOCKED until live PC evidence is supplied. Production hosting remains on HOLD.
