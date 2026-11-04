-- HR Leave Requests R1.1: revoke obsolete CSV import capability ONLY.
-- Run after migration 030. Keep all leave requests, audit rows, and balance postings untouched.
START TRANSACTION;
DELETE FROM role_permissions WHERE permission_code = 'leave_requests.import';
DELETE FROM permissions WHERE code = 'leave_requests.import';
COMMIT;
