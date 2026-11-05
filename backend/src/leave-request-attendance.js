// HR Leave Requests R1.5: classify actual worked records separately from rosters.
// This classifier never mutates data.
// R1.5: an absence is NOT a working shift. The work schedule can be present
// even when the employee never Clocked In. Preserve actual punches and links.
const plannedStatuses = new Set(['Present', 'Late', 'Half Day', 'Absent', 'Rest Day', 'Public Holiday']);
const plannedSources = new Set(['Manual', 'Import']);
const workedMinutes = row => ['working_minutes', 'overtime_minutes', 'late_minutes', 'early_leave_minutes']
  .some(field => Number(row[field] || 0) !== 0);

export function isConvertibleSchedule(row) {
  return Boolean(row)
    && row.status === 'active'
    && ['Pending', 'Approved'].includes(row.approval_status)
    && Number.isInteger(Number(row.session_no)) && Number(row.session_no) >= 1
    && plannedSources.has(row.attendance_source)
    && plannedStatuses.has(row.attendance_status)
    && row.clock_in == null && row.clock_out == null
    && row.leave_request_id == null
    && Number(row.punch_events || 0) === 0
    && !workedMinutes(row);
  // Approval/notes on a schedule are not proof the person clocked in.
  // Original schedule, approvals and notes are retained in the audit log.
}

export function assessLeaveAttendance(rows, durationType = 'Full Day') {
  if (!rows.length) return 'CLEAR';
  if (rows.some(row => row.clock_in != null && row.clock_out == null)) return 'OPEN_PUNCH';
  // A punch event is immutable; a manually cleared clock field does not make it safe.
  if (rows.some(row => row.clock_in != null || row.clock_out != null || Number(row.punch_events || 0) > 0)) return 'EXISTING_ATTENDANCE';
  const seen = new Set();
  for (const row of rows) {
    if (!isConvertibleSchedule(row)) return 'EXISTING_ATTENDANCE';
    const key = `${row.attendance_date}:${row.session_no}`;
    if (seen.has(key)) return 'EXISTING_ATTENDANCE';
    seen.add(key);
  }
  // A scheduled half-day still requires an independently representable work session.
  // Do not turn the whole planned shift into a Leave-only session automatically.
  if (durationType === 'Half Day') return 'HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW';
  return 'SCHEDULE_ONLY';
}

export const leaveAttendanceSelect = `SELECT a.id,
 DATE_FORMAT(a.attendance_date,'%Y-%m-%d') AS attendance_date,
 a.session_no,a.scheduled_clock_in,a.scheduled_clock_out,a.clock_in,a.clock_out,
 a.break_minutes,a.working_minutes,a.overtime_minutes,a.late_minutes,a.early_leave_minutes,
 a.attendance_status,a.attendance_source,a.approval_status,a.status,
 a.approved_by_user_id,a.approved_at,a.leave_request_id,a.clock_in_notes,a.clock_out_notes,
 (SELECT COUNT(*) FROM hr_clock_events e WHERE e.attendance_id=a.id) AS punch_events
 FROM hr_attendances a WHERE a.staff_profile_id=? AND a.attendance_date BETWEEN ? AND ?
 ORDER BY a.attendance_date,a.session_no,a.id`;
