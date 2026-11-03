-- HR Attendances R1. Dedicated tenant tables; prior migrations remain unchanged.
-- Clock punches from staff are NOT created by this migration. Module 3 will supply them.
CREATE TABLE IF NOT EXISTS hr_attendances (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 staff_profile_id BIGINT UNSIGNED NOT NULL,
 attendance_date DATE NOT NULL,
 session_no SMALLINT UNSIGNED NOT NULL DEFAULT 1,
 scheduled_clock_in DATETIME NULL,
 scheduled_clock_out DATETIME NULL,
 clock_in DATETIME NULL,
 clock_out DATETIME NULL,
 break_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 working_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 overtime_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 late_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 early_leave_minutes INT UNSIGNED NOT NULL DEFAULT 0,
 attendance_status ENUM('Present','Late','Absent','Half Day','Annual Leave','Medical Leave','Unpaid Leave','Rest Day','Public Holiday') NOT NULL DEFAULT 'Present',
 attendance_source ENUM('Manual','Web','Mobile','POS','Biometric','Import','Leave') NOT NULL DEFAULT 'Manual',
 approval_status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
 approved_by_user_id BIGINT UNSIGNED NULL,
 approved_at DATETIME(6) NULL,
 clock_in_notes TEXT NULL,
 clock_out_notes TEXT NULL,
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 created_by_user_id BIGINT UNSIGNED NOT NULL,
 updated_by_user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_hr_attendance_session(staff_profile_id,attendance_date,session_no),
 KEY ix_hr_attendance_date(attendance_date,id),
 KEY ix_hr_attendance_approval(approval_status,attendance_date),
 KEY ix_hr_attendance_status(attendance_status,attendance_date),
 CONSTRAINT fk_hr_attendance_staff FOREIGN KEY(staff_profile_id) REFERENCES staff_profiles(id),
 CONSTRAINT fk_hr_attendance_created FOREIGN KEY(created_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_hr_attendance_updated FOREIGN KEY(updated_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_hr_attendance_approved FOREIGN KEY(approved_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_hr_attendance_session CHECK(session_no BETWEEN 1 AND 99),
 CONSTRAINT chk_hr_attendance_break CHECK(break_minutes BETWEEN 0 AND 1440),
 CONSTRAINT chk_hr_attendance_time CHECK(clock_out IS NULL OR (clock_in IS NOT NULL AND clock_out >= clock_in))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_attendance_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 attendance_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('CREATE','UPDATE','APPROVE','REJECT','DEACTIVATE','REACTIVATE','IMPORT_CREATE') NOT NULL,
 details JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_attendance_audit(attendance_id,id),
 CONSTRAINT fk_hr_attendance_audit_row FOREIGN KEY(attendance_id) REFERENCES hr_attendances(id),
 CONSTRAINT fk_hr_attendance_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('attendances.view','View HR attendance records'),
 ('attendances.manage','Create and update manual HR attendance records'),
 ('attendances.approve','Approve or reject HR attendance records'),
 ('attendances.import','Preview and confirm attendance CSV imports'),
 ('attendances.export','Export authorized HR attendance records to PDF'),
 ('attendances.audit','View HR attendance activity history');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'attendances.%' WHERE r.code IN ('OWNER','ADMIN','HR');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'attendances.view' FROM roles r WHERE r.code='MANAGER';
