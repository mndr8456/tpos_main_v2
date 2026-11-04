# TPOS Main V2 — HR Leave Requests R1.3

Date: 04 November 2026. Base ZIP: `tpos_main_v2 - LATEST_04112026_2022.zip`. The approved R1.2 `Request Details` 14px spacing is included within the complete changed frontend files.

## Scope (Changed Files Only)

- `backend/src/leave-requests.js` — date-scoped attendance conflict checks in View and the authoritative approval transaction. No schema or financial posting changes.
- `frontend/src/LeaveRequests.jsx` — Refresh clears the old notice; Approve reads fresh details before confirmation; View explains any blocking conflict; Recheck Attendance refreshes the View.
- `frontend/src/LeaveRequests.css` — small inline approval guidance panel; retains R1.2 spacing.
- `frontend/src/leave-request-approval.js` — explicit English error descriptions for blocked approvals.
- `backend/tests/hr-leave-requests-r13.test.js` — seven focused regression tests.

No `.env` changes. No database migration. No data reset. Existing migration 030 and 031 remain unchanged. CSV Import stays removed; PDF Export stays available. Actual attendance punches, Leave Balance historical opening and audit records are never deleted or altered by this patch.

## Root cause and exact decision

1. `Refresh Leave Requests` previously called `load` directly, so it left the global success/error notification unchanged. It now calls the existing `refreshPage(load, notify)` helper already used in other TPOS pages.
2. `requestReview` previously rejected leave if **any** active unfinished Clock In existed for a staff member, even on a date outside the requested leave. R1.3 removes that extra global restriction. It still locks and refuses **all** attendance overlaps on the requested leave date, including unfinished punches and completed work. This implements the approved V1-style date-scoped rule; it does not authorize overwriting punch records.
3. `View Leave Request` now distinguishes `OPEN_PUNCH` and `EXISTING_ATTENDANCE`. A blocked Approve action from the table opens View with an explicit guidance message; Approve remains disabled until the conflict is genuinely resolved. Backend approval still validates under an atomic MySQL transaction, independently of the browser preflight.

## Installation

1. Back up the existing V2 project before copying the replacement full files.
2. Extract the ZIP under `D:\\www\\tpos-main-V2` (combine the `backend`, `frontend` and `docs` directories with the existing project; do not nest a second `tpos_main_v2` directory).
3. Restart the backend process because a backend source file changed. Restart Vite frontend and refresh the page.
4. Run on Windows:

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
node --test tests/hr-leave-requests-r13.test.js
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

No SQL `--apply`, no repeat of migrations 030/031.

## Live acceptance checks

1. On Leave Requests, create a temporary validation success/error notification, then click Refresh: previous notification must disappear and no new success toast appears. An actual new fetch failure should still show its error.
2. For a **Pending** request whose staff has **no Attendance record on the requested dates**, Approve must show confirmation then change the request to Approved; posted Used/Pending and generated Leave attendance must reconcile. A repeated attempt must not create duplicate posting/attendance.
3. For a **Pending** request with Clock In and no Clock Out **on its leave date**, Approve must show the View warning; request stays Pending and does not post balances or Leave attendance.
4. For a **Pending** request whose leave date already has a completed/other Attendance record, View must show `Existing attendance requires HR review`; no actual punches can be overwritten. Existing completed attendance is not automatically converted to leave.
5. For a pending leave on **another date with no attendance conflict**, an incomplete old punch from a different date must not block approval. (That historical punch still requires its own Attendance review.)
6. `Recheck Attendance` silently updates the View after attendance corrections; PDF Export remains available; Import CSV remains absent. R1.2 14px form spacing stays intact.

**Specific video evidence:** Request `LR-000001`, Staff `SAT-0007`, `UL` half day, `04/11/2026` showed `UNCLOSED_CLOCK_PUNCH` / `Existing attendance requires HR review`. This request must NOT be forced to Approved while it overlaps actual work. HR must review the true attendance conflict and select an appropriate non-conflicting leave period or use a separately controlled audited correction workflow.

## Read-only tenant SQL to inspect LR-000001 overlap

First select the appropriate V2 tenant database in your SQL client. Do not run on the central database or V1.

```sql
SELECT r.request_no, sp.staff_no,
       DATE_FORMAT(a.attendance_date,'%d/%m/%Y') AS attendance_date,
       a.id AS attendance_id, a.session_no, a.attendance_source,
       a.attendance_status, a.approval_status, a.clock_in, a.clock_out, a.status
FROM hr_leave_requests r
JOIN staff_profiles sp ON sp.id = r.staff_profile_id
JOIN hr_attendances a ON a.staff_profile_id = r.staff_profile_id
  AND a.attendance_date BETWEEN r.start_date AND r.end_date
WHERE r.request_no = 'LR-000001'
ORDER BY a.attendance_date, a.session_no;
```

Use this only for diagnosis. Do not delete or clear attendance punches to make an approval pass.
