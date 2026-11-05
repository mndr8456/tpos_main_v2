// View-only explanations. Approval is always rechecked inside the MySQL write transaction.
export function approvalBlocker(state){
 if(state==='OPEN_PUNCH')return 'Recorded Clock In exists on this date without Clock Out. This is an actual attendance conflict, not a requirement to Clock In/Out for leave. Review the existing work record before approval.';
 if(state==='EXISTING_ATTENDANCE')return 'An actual work record, another Leave, or a protected Attendance record exists for this date. An authorized approver must review it; existing punches must not be deleted or overwritten.';
 if(state==='HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW')return 'Approval blocked: an existing scheduled shift cannot be converted into half-day leave without retaining the working half. An authorized approver must review the attendance schedule separately.';
 return null;
}
export function approvalScheduleNotice(state,count){
 if(state!=='SCHEDULE_ONLY')return null;
 return `${count} unpunched Attendance schedule${count===1?'':'s'} without Clock In/Out can be linked to this leave request after explicit OWNER / ADMIN / HR confirmation. Original schedule details are preserved and the conversion is audited.`;
}
export function approvalErrorMessage(error){
 const code=String(error?.message||error||'');
 if(code==='UNCLOSED_CLOCK_PUNCH')return 'Approval blocked: the requested leave date contains a Clock In without Clock Out. Review Attendances or Attendance Clock first.';
 if(code==='EXISTING_ATTENDANCE_REQUIRES_HR_REVIEW')return 'Approval requires review of actual recorded work or protected Attendance details. An authorized approver must review it; recorded punches cannot be overwritten.';
 if(code==='HALF_DAY_SCHEDULE_REQUIRES_HR_REVIEW')return 'Approval blocked: this half-day request overlaps a planned working session. An authorized approver must review the shift before it can be represented safely.';
 if(code==='SCHEDULE_CONVERSION_CONFIRMATION_REQUIRED')return 'Approval needs explicit OWNER / ADMIN / HR confirmation to convert an existing unpunched Attendance schedule. Recheck Attendance and approve again.';
 if(code==='ATTENDANCE_SCHEDULE_CHANGED_RECHECK')return 'The scheduled Attendance changed during approval. Recheck Attendance before trying again.';
 if(code==='LEAVE_REQUEST_DECISION_ALREADY_FINAL')return 'This leave request has already been approved, rejected or cancelled. Refresh to see the latest status.';
 if(code==='REQUIRED_SUPPORTING_DOCUMENT_MISSING')return 'Approval blocked: a required supporting document or Medical Certificate is missing.';
 if(code==='LEAVE_BALANCE_INACTIVE'||code==='LEAVE_BALANCE_NOT_FOUND_GENERATE_FIRST')return 'Approval blocked: the staff Leave Balance is not active or missing. Review Leave Balances first.';
 return code;
}
