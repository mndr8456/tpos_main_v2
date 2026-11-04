# TPOS Main V2 — HR Module 6: Leave Requests R1

**Status:** Development package for live PC validation. NOT a live PASS/LOCKED acceptance.

## Package and dependency order

- ZIP contains only full files that are new or changed against `tpos_main_v2-LATEST_04112026_1914.zip`.
- In the ZIP, open the `tpos_main_v2/` folder and **merge its `backend/`, `database/`, `docs/` and `frontend/` contents directly into** `D:\www\tpos-main-V2\` (e.g. `D:\www\tpos-main-V2\backend\src\leave-requests.js`). **Do not** create a nested `D:\www\tpos-main-V2\tpos_main_v2\` folder.
- Do **not** replace `.env`, copy V1 tables, or apply database schema to V1 databases.
- Backup the active V2 tenant databases before any migration. Migration `030` has new tables and an additive `hr_attendances.leave_request_id` column; rollback requires a verified backup and DBA review.
- Prerequisites: migrations 025 (Staff Profiles), 026 (Attendances), 027 (Attendance Clock), 028 (Leave Types), 029 (Leave Balances) are CURRENT for the target tenant.

## Manual install (Windows CMD)

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
node --test tests/hr-leave-requests-r1.test.js
npm run db:leave-requests
```

The inspector must report `MISSING` for active tenants not yet installed and no `FAILED` entries. After verifying backups, apply **once**:

```cmd
npm run db:leave-requests -- --apply
npm run db:leave-requests
npm test
```

Expected post-install: all active tenants report `CURRENT`, `failed:0`. If `PARTIAL_SCHEMA_REQUIRES_MANUAL_AUDIT` or any `FAILED` appears, **stop**; do not force/rerun raw SQL. This installer requires explicit `--apply` to write data. The script does not apply migration automatically.

Then run:

```cmd
cd /d D:\www\tpos-main-V2\frontend
npm run build
```

Restart the normal backend/frontend processes and re-login to refresh role permissions. Navigate to **HR → Leave Requests**.

## UI and transaction live acceptance checklist

| Test | Steps | Expected |
|---|---|---|
| Navigation and 5 cards | Sign in as Owner/Admin/HR and open HR → Leave Requests | 5 summary cards and 9-column table; search, filters and refresh preserve ordering; refresh has no success toast |
| Own profile | Sign in as Cashier/Waiter/Supervisor | Same Leave Requests page; only their applications visible; staff identity cannot change; no Approve/Reject |
| Manager | Sign in as Manager | Team list read-only; only own Pending leave editable/cancellable; no Approve/Reject |
| AL pending | With AL available 13.00 and Used 3.00, submit 2.00 | Pending +2.00; Remaining drops from 13.00 to 11.00; existing Used remains 3.00 |
| Approve | Approve the above as Owner/Admin/HR | Pending falls by 2.00; Used rises by 2.00; Remaining stays 11.00; `hr_attendances` Leave-source rows created once |
| Idempotency | Repeat the same Approve request | HTTP 409; no second deduction or second Leave attendance |
| Reject | Submit another pending AL request, then reject with remarks | Pending released; Used unchanged; no Leave attendance created |
| Cancel | Cancel another own Pending request with reason | Pending released; Approved cannot be cancelled directly |
| Edit Pending | Change 2.00 days to 1.00; optionally change Leave Type/Year | Old pending release and new pending reserve done atomically; status remains Pending |
| MC | Attempt to submit required MC without Medical Certificate | Rejected; submit with valid PDF/JPEG/PNG attachment (max 10 MB, 5 files) succeeds |
| UL | Submit unpaid leave with 0.00 entitlement | No negative balance or AL deduction; approved Leave attendance still created |
| Conflicting punch | Put an open clock punch or any completed/manual attendance on leave dates, then Approve | 409; attendance and original punches untouched; request still Pending |
| Later manual attendance | Create/import a manual attendance on a date already approved as Leave | 409 conflict; original Leave remains intact |
| Duplicate overlap | Submit another Pending/Approved request over the same staff dates | Rejected as overlapping |
| Cross-year | Submit 31 Dec to 1 Jan | Rejected; create separate requests per Balance Year |
| CSV | Download template, Choose File, Preview, Confirm | Pending-only, all-or-nothing; required-attachment rows and duplicate/overdrawn balances rejected |
| PDF | Export using search/filter | Actual A4 landscape `Leave Requests.pdf`, filtered authorized rows |
| Audit | Open request Activity Log | SUBMIT/EDIT/APPROVE/REJECT/CANCEL/IMPORT_CREATE logged with actor |
| Historical balance | Use a balance with imported Used/Pending before first new request | Original values become opening snapshot; new postings only delta; no reset |
| Reconcile | Authorized POST `/api/v2/leave-requests/balances/:balanceId/recalculate` | Returns `verified:true` if opening + ledger equals current Used/Pending; on mismatch returns 409 without altering amounts |

## Read-only SQL evidence (after approved test transaction)

Run only against the appropriate `tpos_v2_tenant_N` database, not any V1 database.

```sql
SELECT id,staff_profile_id,leave_type_id,balance_year,
       entitlement_days,carried_forward_days,used_days,pending_days,remaining_days
FROM hr_leave_balances ORDER BY id DESC LIMIT 20;

SELECT id,request_no,staff_profile_id,leave_type_id,balance_year,
       start_date,end_date,total_days,request_status
FROM hr_leave_requests ORDER BY id DESC LIMIT 20;

SELECT balance_id,opening_used_days,opening_pending_days,captured_at
FROM hr_leave_balance_openings ORDER BY balance_id DESC LIMIT 20;

SELECT leave_request_id,balance_id,action_type,
       delta_used_days,delta_pending_days,used_after,pending_after
FROM hr_leave_request_postings ORDER BY id DESC LIMIT 30;

SELECT id,staff_profile_id,attendance_date,attendance_status,
       attendance_source,approval_status,leave_request_id
FROM hr_attendances WHERE leave_request_id IS NOT NULL
ORDER BY id DESC LIMIT 30;
```

## Explicit constraints / deferred features

- **No direct editing or reversal of Approved leave.** A separate controlled reversal flow requires new design and live acceptance. Rejected/Cancelled are also final.
- **Leave Balances UI Recalculate remains locked** pending actual PC reconciliation approval. The new verification API never rewrites historical opening balances; it only verifies and stamps `last_recalculated_at` when consistent.
- **CSV does not import Approved status** and does not bypass MC documents. Imported historical Pending balances without a prior posting snapshot require separate HR reconciliation before CSV import.
- **Gender-restricted Leave Types** are blocked until verified staff gender data is available. This avoids silently ignoring configured Leave Type policies.
- Non-paid Leave Types (for example UL) do not consume a paid entitlement ledger. Their Approved attendance remains linked to the request.
- Full days count inclusive **calendar days**; half day is exactly 0.50. Do not silently exclude Off Days/Public Holidays. Cross-year requests must be split.
- Production hosting remains on HOLD until user acceptance.

## Local development validation supplied with this package

- Backend syntax: `npm run check` completed.
- Dedicated leave request contract/arithmetic tests: `9 / 9 PASS` using built-in Node test runner.
- HR targeted regression: `88 / 88 PASS` using built-in Node test runner.
- Full backend source regression: `513 / 513 PASS` after using a temporary local copy of `.env.example` as `.env` for test-only validation (not delivered).
- New tenant provisioning: `backend/src/tenants.js` now runs migration 030 immediately after 029 for future registrations; active tenants use the independent installer.
- Changed JSX passed TypeScript JSX parsing/transpilation.
- Frontend Vite production build, database migration and live tenant transaction checks **not executed** in package environment; dependencies/MySQL are not accessible there. They must be run on the user's PC and are not claimed PASS.
