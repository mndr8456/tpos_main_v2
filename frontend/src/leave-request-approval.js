// View-only explanation: the backend always rechecks attendance under a MySQL transaction.
export function approvalBlocker(state){
 if(state==='OPEN_PUNCH')return 'Approval blocked: a Clock In on the requested leave date has no Clock Out. HR must resolve the attendance record before this leave can be approved.';
 if(state==='EXISTING_ATTENDANCE')return 'Approval blocked: an Attendance record already exists on the requested leave date. HR must review the overlap. Existing punches must not be deleted or overwritten; use a non-conflicting leave date or a separately audited correction process.';
 return null;
}
export function approvalErrorMessage(error){
 const code=String(error?.message||error||'');
 if(code==='UNCLOSED_CLOCK_PUNCH')return 'Approval blocked: the requested leave date contains a Clock In without Clock Out. Review Attendances or Attendance Clock first.';
 if(code==='EXISTING_ATTENDANCE_REQUIRES_HR_REVIEW')return 'Approval blocked: an Attendance record already exists on the leave date. HR must review the overlapping record; actual punches cannot be overwritten.';
 if(code==='LEAVE_REQUEST_DECISION_ALREADY_FINAL')return 'This leave request has already been approved, rejected or cancelled. Refresh to see the latest status.';
 if(code==='REQUIRED_SUPPORTING_DOCUMENT_MISSING')return 'Approval blocked: a required supporting document or Medical Certificate is missing.';
 if(code==='LEAVE_BALANCE_INACTIVE'||code==='LEAVE_BALANCE_NOT_FOUND_GENERATE_FIRST')return 'Approval blocked: the staff Leave Balance is not active or missing. Review Leave Balances first.';
 return code;
}
