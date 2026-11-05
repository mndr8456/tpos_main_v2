# TPOS Main V2 — HR Module 6 Leave Requests R1.6
## Mandatory Approval / Rejection Details & Activity Log

Source baseline: `tpos_main_v2 - LATEST_04112026_2022.zip` with previously delivered Leave Requests patches R1–R1.5. R1.5 is a prerequisite. All files in this package are full replacement source files at their original relative paths (Changed Files Only).

## Scope

- Replace native browser `confirm()` for Approve and native `prompt()` for Reject with one in-app, responsive modal.
- For BOTH decisions (including AL, EL, UL, MC), require **Approval Details** / **Rejection Details** between 4 and 5,000 characters after trimming spaces. Confirm stays disabled until valid.
- Revalidate on the backend (`remarks` is required in the review API); direct API submissions without adequate details are rejected.
- Store details in existing `hr_leave_requests.review_remarks` and the immutable `hr_leave_request_audit_logs.details.remarks`, inside the same review transaction as Attendance and balance posting.
- Show readable audit history details for approval/rejection/cancellation/submission/edit. Older approvals that were legitimately saved without remarks are shown as older records **without inventing any remarks**.
- Keep the R1.5 safe Attendance conversion preflight, locked transactional revalidation, roles OWNER/ADMIN/HR, Reject and final-status protection, no CSV Import, PDF Export and R1.2 form spacing.
- No schema alteration, no migration, no `.env` or production hosting changes.

## Install on Windows

1. Back up your current V2 source folder and tenant databases before overwriting changed files.
2. Merge `tpos_main_v2/` from this ZIP into `D:\www\tpos-main-V2\` (do not replace the entire project directory). Leave your existing `.env` files unchanged.
3. Restart backend and frontend after installing changed files.
4. Run the following checks:

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
node --test tests/hr-leave-requests-r16-review-details.test.js
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

The package does not introduce a new MySQL installer. Migration 032 must already be CURRENT from R1.5; there is no reason to re-run it merely for this update.

## Live PC acceptance checklist

1. Log in as OWNER, ADMIN or HR and open a **Pending** Leave Request (AL, EL, UL or MC). Click **Approve**. The modal title is `Approve Leave Request`, with concise text and a mandatory `Approval Details` textarea. The button is disabled for empty, spaces-only or fewer than four trimmed characters.
2. Enter meaningful approval details, e.g., `Leave request reviewed and approved`. The button becomes active. If the date has an eligible unpunched Attendance schedule, the modal briefly notes how many schedules will be marked as Leave.
3. Confirm once. The request becomes **Approved**. In **View Leave Request**, `Review Remarks` shows exactly the text entered. In **Leave Request Activity Log**, the `APPROVE` row's `Details` shows the same text, and any schedule conversion is identified. Do not re-approve or post the balance twice.
4. Make a different **Pending** request. Click **Reject**. The modal title is `Reject Leave Request`, with mandatory `Rejection Details` and the same disabled-button rule. Confirm; its `REJECT` Activity Log entry must show the entered text.
5. Review a request approved before R1.6 without remarks. The log explicitly says that no earlier approval details were recorded. Historical remarks must not be invented or backfilled automatically.
6. Check logged actor, date and action. Verify Submit/Edit/Cancel logs contain readable details instead of a blank dash where the stored data supports them.
7. Attempt the review API with empty/short/whitespace-only `remarks`: the backend must reject the request before status, Attendance or Leave Balance changes.
8. Verify Manager does not get Approve/Reject. Already Approved/Rejected/Cancelled rows cannot be decided again. Actual punches remain protected; unpaid UL and unpaid EL do not debit AL.
9. Verify Leave Requests CSV Import stays removed, Export PDF remains available, Refresh is silent and R1.2 Request Details layout remains unchanged.

## Development verification

- Backend `npm run check`: PASS.
- Focused frontend/backend static tests R1.3 + R1.4 + R1.6: 25/25 PASS.
- Full backend regression: 555/555 PASS using a temporary copy of `.env.example` solely for a foundation-file check; temporary `.env` removed afterwards.
- JSX parse/transpilation: PASS using TypeScript parser.
- Actual MySQL review transaction and Vite production build **not executed in this sandbox**; live PC acceptance remains required.
