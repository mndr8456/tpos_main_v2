-- R1.5 additive: make Emergency Leave distinct from Annual Leave.
-- Only extends ENUMs; earlier enum order and recorded attendance values are preserved.
ALTER TABLE hr_attendances MODIFY COLUMN attendance_status ENUM(
 'Present','Late','Absent','Half Day','Annual Leave','Medical Leave','Unpaid Leave',
 'Rest Day','Public Holiday','Emergency Leave') NOT NULL DEFAULT 'Present';
ALTER TABLE hr_leave_types MODIFY COLUMN attendance_status ENUM(
 'Annual Leave','Medical Leave','Unpaid Leave','Emergency Leave') NOT NULL;
-- Correct only the original provisional EL mapping, not custom leave policies.
-- EL retains its existing is_paid, entitlement, attachment and active settings.
UPDATE hr_leave_types SET attendance_status='Emergency Leave'
 WHERE leave_code='EL' AND is_paid=0 AND attendance_status='Annual Leave';
