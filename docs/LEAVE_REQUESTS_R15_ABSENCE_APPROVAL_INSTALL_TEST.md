# TPOS Main V2 — HR Leave Requests R1.5: EL / UL / MC Absence Approval

**Baseline:** `tpos_main_v2 - LATEST_04112026_2022.zip`, plus applied Leave Requests patches R1.1–R1.4. **Reference:** `tpos_main_v2-v1-reference-backup.zip`. The delivery package contains only complete changed/new files relative to R1.4; preserve `.env` and existing tenant data.

## Functional finding

V1 distinguishes a scheduled Attendance row from a real Clock In / Clock Out. In V1, approved leave can update a scheduled Attendance record, and an absence does **not** require staff to clock in and out. V1 also blocks an actually open Clock In and has a special review path for completed work. R1.4 made the new V2 rule too restrictive by treating schedule notes, administrative approvals or multiple unpunched sessions as worked-attendance conflicts. These are not reliable evidence the staff worked.

## R1.5 rules

1. **EL, UL and MC (Full Day)** may be requested on a day with a work roster. The employee is absent and need not Clock In / Clock Out to be eligible for leave approval. AL remains a paid leave type to be requested in advance according to the configured company policy; R1.5 does not invent an unapproved new AL notice-period rule.
2. **OWNER, ADMIN and HR** with `leave_requests.approve` can Approve/Reject a **Pending** Leave Request. The Approve button stays enabled whenever the request is Pending and the action is not busy; a preflight checks for actual attendance conflicts but must not silently disable the button. An Approved, Rejected or Cancelled request cannot be decided again.
3. A schedule-only Attendance with no recorded punch, no `hr_clock_events` and no worked-minute calculations may be converted to the leave type after explicit approver confirmation, even if the roster was administratively approved or has schedule notes. Multiple separate unpunched sessions on the same day are handled within one leave approval. The **original status, approval data, work schedule and notes are saved in an Attendance audit log**.
4. Actual clock data, clock event history, calculated work minutes, Attendance linked to another leave, inactive or rejected records and non-roster sources are **not silently overwritten**. These exceptions must be investigated as attendance corrections, never solved by making absent staff perform fictitious Clock In/Out.
5. MC still requires Medical Certificate if `Attachment Required`; UL does not deduct paid leave; EL no longer masquerades as Annual Leave. For EL previously seeded as unpaid + `Annual Leave`, migration 032 switches the **Attendance mapping only** to `Emergency Leave`. No Leave Balances, AL entitlement, existing approved records or Payroll are rewritten. Emergency Leave cannot be manually created or imported through the Attendances module; it is generated only from approved Leave Requests.
6. If no schedule exists, the approval transaction creates a new Leave Attendance. If a suitable schedule exists, it links/converts it and records audit. Posting and request approval remain atomic/idempotent. A pending Half Day that overlaps a full planned shift still requires separate work-half representation; the existing protection is retained rather than silently treating the whole day as leave.

## Deployment

Back up your V2 tenant database before any DDL. Merge the ZIP's `tpos_main_v2` directory into `D:\www\tpos-main-V2`; **do not replace `.env`**. Ensure the R1.4 patch has already been installed. The migration 032 is new and does not modify migrations 026–031.

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
npm run db:leave-requests:attendance-policy
npm run db:leave-requests:attendance-policy -- --apply
npm run db:leave-requests:attendance-policy
npm run db:leave-requests
npm run db:leave-requests:no-import
node --test tests/hr-leave-requests-r15-absence-approval.test.js
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

Read-only preflight reports `MISSING` if any of the two status enums is not extended or a provisional unpaid EL mapping remains. `--apply` is the **only** mutating mode. The second check must report `CURRENT` and `failed:0` for all active tenants. Stop and investigate any `FAILED` report; never manually rewrite attendance records or Leave Balances as a workaround.

## Live PC acceptance (not automatically passed by Node tests)

1. Confirm in Leave Types that **EL — Emergency Leave** is `Active` only if intentionally enabled by OWNER/ADMIN/HR, `Attendance Status = Emergency Leave`, and the existing `Unpaid` policy was preserved. AL retains `Annual Leave` and MC retains `Medical Leave`.
2. On a date with an Attendance `Present`, `Pending`, scheduled 08:00–17:00 but **no Clock In/Out**, submit UL Full Day. Open as OWNER, ADMIN or HR. Approve must be enabled. Confirm conversion and verify Leave Request = Approved, Attendance = `Unpaid Leave`, Source = `Leave`, Approval = Approved; **no Clock In or Out**.
3. Repeat with EL Full Day (same preconditions on a different date); Attendance must show **Emergency Leave**, not Annual Leave; AL balances must not change. Repeat with MC, attaching a Medical Certificate if required; paid MC balance should post once.
4. Repeat with an administratively Approved Attendance schedule with no punch and an existing schedule note; the approver must be able to approve after confirmation. Verify the original fields in the Attendance audit history.
5. Test a day with no Attendance: approval creates one Leave Attendance only. Repeating a POST cannot create duplicate records or balance deductions.
6. Negative control: a real Clock In without Clock Out, completed punches, historical `hr_clock_events` (even if a field was cleared) or a linked Leave must **not** be overwritten; approval displays a conflict explanation without asking absent staff to fake punches.
7. Verify an Approved, Rejected and Cancelled Leave Request cannot be decided again. Reject Pending requires Remarks. Manager and ordinary users must not obtain approval rights.
8. Verify Refresh clears prior notices, CSV Import is absent, Export PDF remains, and R1.2 Request Details layout is unchanged.

**Acceptance status:** Until these live PC checks including migration, Attendance and Leave Balance transactions are proven, R1.5 is **PENDING**, not LULUS.
