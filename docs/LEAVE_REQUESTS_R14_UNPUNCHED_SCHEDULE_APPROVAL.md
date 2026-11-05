# TPOS Main V2 — HR Leave Requests R1.4

## Scope

Release R1.4 fixes approval of newly submitted Full Day leave when Attendance contains a **single Pending Manual/Import work schedule without any clock punches** for that staff/date. The flow requires the current approver to confirm before the scheduled Attendance is linked to the leave request. The existing schedule is updated in the **same MySQL transaction** as Leave Request approval, leave balance posting (paid types only), and both audit logs.

**Authorized approvers:** OWNER, ADMIN and HR, each with `leave_requests.approve`. MANAGER remains view-only; CASHIER, SUPERVISOR and other ordinary staff cannot approve. The app and API enforce the same role policy. The label "HR" in older internal error codes is historical, not a role restriction.

Unclosed Clock In, any recorded punch history, finalized/inactive/linked Attendance, multiple sessions, and scheduled Half Day overlaps remain blocked. No previous punch data is deleted or overwritten. UL remains unpaid and does not deduct Leave Balances. Previous R1.2 spacing, R1.3 Refresh, PDF export and the removal of CSV Import stay intact.

## Installation

1. Back up the current V2 project and tenant database before installing.
2. Extract the ZIP and copy its complete `tpos_main_v2` subfolders into `D:\www\tpos-main-V2`, preserving structure. Replace the listed files; do **not** replace `.env`.
3. No SQL migration is required. Existing migrations `030` and `031` stay unchanged.
4. Restart backend and frontend and sign in again to refresh role permissions.
5. Validate with:

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
node --test tests/hr-leave-requests-r14.test.js
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

## Live acceptance checklist

1. Sign in as OWNER, then ADMIN, then HR, each with `leave_requests.approve`. Confirm **Approve** and **Reject** appear and function for each role. Sign in as MANAGER/ordinary staff and confirm no approval actions appear.
2. Create a new **Full Day UL** Pending request on a date with exactly **one** Pending Manual/Import Attendance schedule, no Clock In/Out and no punch events. Open View: it should show `Pending Attendance schedule · OWNER / ADMIN / HR confirmation`.
3. Click Approve, review the explicit confirmation and accept. Confirm Leave Request becomes Approved and original Attendance is linked with `attendance_source=Leave`, `leave_request_id` and Approved status. Verify scheduled times are preserved and that no duplicate Attendance row exists.
4. Check Attendance and Leave Request audit logs. Confirm there is only one decision and one attendance conversion; repeat approval must not create additional records.
5. For UL (unpaid), Leave Balances must not be reduced. For a paid leave type, Pending Days move to Used Days exactly once.
6. Verify an OPEN Clock In, existing completed punch, finalized attendance or multiple attendance sessions continue to block approval without changes to attendance/balances.
7. Verify a Half Day request overlapping a scheduled work shift remains blocked pending an independently safe handling mechanism.
8. Confirm Refresh clears previous notices silently and the approved Request Details spacing and PDF export remain unchanged.

**Do not mark R1.4 LULUS/LOCKED until live transaction results on the user's PC are verified.** No production hosting changes are included.
