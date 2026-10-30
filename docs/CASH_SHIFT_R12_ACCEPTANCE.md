# TPOS Main V2 — Cash Shift R1.2 Acceptance (PC)

## Scope and non-goals

Changes: readable Shift Activity Log and confirmed cash-variance close-out. Existing R1 Cash In / Cash Out, permissioned CSV export, and tenant/branch controls are preserved. This is still a **manual-only cash balance**; POS cash sales are not included. No SQL migration or database reset.

## Installation

Copy the full files in this ZIP to `D:\www\tpos_main_v2\` (retain folder paths). This delivery also includes the previously corrected `backend/tests/foundation.test.js` so that the harmless root `SECURITY.md` file remains permitted if present.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart the backend (backend API contract has changed), refresh the frontend, and sign in again if needed. Do **not** rerun migration 013.

## Acceptance steps

1. **Cash In / Out:** Open a new cashier shift with RM 100.00. Cash In RM 25.50 (reason: "Float top up"). Cash Out RM 10.25 (reason: "Purchase of ice bags"). Expected **manual-only** cash = RM 115.25.
2. **Close with shortage:** Enter Actual Cash Counted RM 114.00. A **Shortage −RM 1.25** warning must appear. Confirm Close must not be available until a reason of at least 8 characters is entered **and** the acknowledgement checkbox is ticked. Close and confirm status CLOSED, manual variance −RM 1.25.
3. **Audit:** View Activity Log. OPEN, CASH_IN, CASH_OUT and CLOSE details should appear as readable amounts, reasons and manual expected values, never raw JSON or request keys.
4. **Large surplus:** On a separate test shift with Expected RM 50.00, enter Counted RM 7500.00. A **Large variance** warning must appear and require acknowledgement and reason; do not close this test shift unless you intend to record that test result.
5. **Balanced shift:** A new shift with equal expected/counted cash should show Balanced, and should not require a variance acknowledgement. Regular manager closing reason remains required when an authorized manager closes another cashier's shift.
6. **Stale expected:** While the Close modal is open, record another Cash In/Out in a separate session. The subsequent close must be rejected with `SHIFT_EXPECTED_BALANCE_CHANGED`; reopen details and review the new balance.
7. **Permission:** Sign in as CASHIER and verify only own shift is visible. Verify OWNER/ADMIN/MANAGER/ACCOUNTANT authorized visibility and branch-scoped actions as applicable. Read-only/unauthorized actions should be denied by backend, not just hidden in UI.
8. **Export CSV:** With an authorized role, export and inspect Cash Shifts CSV. Verify the scope and "manual expected" label; it must not claim POS sales are included.

## Rules

- A variance (positive or negative) must be acknowledged on the close API, must match the expected manual balance shown, and must have a reason of at least 8 characters. All checks run inside the existing locked transaction.
- The dashboard shows a "Large variance" visual indicator for differences of at least RM 100.00; this is a visual review threshold, not an authorization policy or an automated accounting adjustment.
- No historical cash movements or audit entries are edited or deleted.
- No fake POS sale records, posting, or accounting journal entries are made.

**Acceptance status:** pending real PC frontend build and live tests.
