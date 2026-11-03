// Attendance approval actions are also protected by the server and tenant permissions.
const needsPunchedSession = new Set(['Present', 'Late', 'Half Day']);

export function attendanceDecisionAllowed(record, decision) {
  if (!record || record.status !== 'active' || record.attendance_source === 'Leave') return false;
  // A decision is final until an audited HR correction explicitly resets it to Pending.
  if (record.approval_status && record.approval_status !== 'Pending') return false;
  if (decision === 'Rejected') return true;
  if (decision !== 'Approved') return false;
  return !needsPunchedSession.has(record.attendance_status) || Boolean(record.clock_in && record.clock_out);
}

export function attendanceApprovalHint(record) {
  if (record?.approval_status === 'Approved') return 'Attendance already approved. An audited HR correction is required before another decision.';
  if (record?.approval_status === 'Rejected') return 'Attendance already rejected. An audited HR correction is required before another decision.';
  if (attendanceDecisionAllowed(record, 'Approved')) return 'Approve Attendance';
  if (record && needsPunchedSession.has(record.attendance_status) && (!record.clock_in || !record.clock_out)) {
    return 'Approval requires both Clock In and Clock Out. Owner, Admin or HR may Reject this record or enter an audited correction.';
  }
  return 'Approval is unavailable for this attendance record.';
}
