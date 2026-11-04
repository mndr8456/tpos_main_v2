-- HR Leave Requests R1. Run for each V2 tenant AFTER migration 029.
-- Existing imported/opening Used and Pending are never reset or backfilled by this migration.
CREATE TABLE IF NOT EXISTS hr_leave_requests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_no VARCHAR(30) NULL UNIQUE,
 staff_profile_id BIGINT UNSIGNED NOT NULL,
 leave_type_id BIGINT UNSIGNED NOT NULL,
 balance_year SMALLINT UNSIGNED NOT NULL,
 start_date DATE NOT NULL,
 end_date DATE NOT NULL,
 duration_type ENUM('Full Day','Half Day') NOT NULL DEFAULT 'Full Day',
 half_day_period ENUM('First Half','Second Half') NULL,
 total_days DECIMAL(7,2) NOT NULL,
 reason TEXT NOT NULL,
 emergency_contact_no VARCHAR(30) NULL,
 handover_notes TEXT NULL,
 request_status ENUM('Pending','Approved','Rejected','Cancelled') NOT NULL DEFAULT 'Pending',
 requested_by_user_id BIGINT UNSIGNED NOT NULL,
 submitted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 reviewed_by_user_id BIGINT UNSIGNED NULL,
 reviewed_at DATETIME(6) NULL,
 review_remarks TEXT NULL,
 cancelled_by_user_id BIGINT UNSIGNED NULL,
 cancelled_at DATETIME(6) NULL,
 cancel_reason TEXT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 KEY ix_hr_leave_requests_staff_dates(staff_profile_id,start_date,end_date,request_status),
 KEY ix_hr_leave_requests_status(request_status,id),
 KEY ix_hr_leave_requests_year(balance_year,id),
 CONSTRAINT fk_hr_lr_staff FOREIGN KEY(staff_profile_id) REFERENCES staff_profiles(id),
 CONSTRAINT fk_hr_lr_type FOREIGN KEY(leave_type_id) REFERENCES hr_leave_types(id),
 CONSTRAINT fk_hr_lr_requested FOREIGN KEY(requested_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_hr_lr_reviewed FOREIGN KEY(reviewed_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_hr_lr_cancelled FOREIGN KEY(cancelled_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_hr_lr_dates CHECK(end_date>=start_date AND balance_year BETWEEN 2000 AND 2100),
 CONSTRAINT chk_hr_lr_days CHECK(total_days>0 AND total_days<=366)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_leave_request_attachments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 leave_request_id BIGINT UNSIGNED NOT NULL,
 file_name VARCHAR(200) NOT NULL,
 mime_type ENUM('application/pdf','image/jpeg','image/png') NOT NULL,
 file_bytes INT UNSIGNED NOT NULL,
 file_data MEDIUMBLOB NOT NULL,
 attachment_type ENUM('Medical Certificate','Supporting Document') NOT NULL,
 is_removed TINYINT(1) NOT NULL DEFAULT 0,
 uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_lr_attachments(leave_request_id,is_removed,id),
 CONSTRAINT fk_hr_lra_request FOREIGN KEY(leave_request_id) REFERENCES hr_leave_requests(id),
 CONSTRAINT fk_hr_lra_actor FOREIGN KEY(uploaded_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_hr_lra_bytes CHECK(file_bytes BETWEEN 1 AND 10485760)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_leave_request_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 leave_request_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('SUBMIT','EDIT','APPROVE','REJECT','CANCEL','IMPORT_CREATE') NOT NULL,
 details JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_lr_audit(leave_request_id,id),
 CONSTRAINT fk_hr_lr_audit_request FOREIGN KEY(leave_request_id) REFERENCES hr_leave_requests(id),
 CONSTRAINT fk_hr_lr_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Snapshot only when the FIRST Leave Request posts to a specific balance.
-- Existing imported Used/Pending become immutable opening amounts for reconciliation.
CREATE TABLE IF NOT EXISTS hr_leave_balance_openings (
 balance_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 opening_used_days DECIMAL(7,2) NOT NULL,
 opening_pending_days DECIMAL(7,2) NOT NULL,
 captured_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_hr_lr_opening_balance FOREIGN KEY(balance_id) REFERENCES hr_leave_balances(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_leave_request_postings (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 leave_request_id BIGINT UNSIGNED NOT NULL,
 balance_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('SUBMIT','EDIT','APPROVE','REJECT','CANCEL','IMPORT_CREATE') NOT NULL,
 delta_used_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 delta_pending_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 used_after DECIMAL(7,2) NOT NULL,
 pending_after DECIMAL(7,2) NOT NULL,
 posted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_lr_posting_balance(balance_id,id),
 KEY ix_hr_lr_posting_request(leave_request_id,id),
 CONSTRAINT fk_hr_lr_posting_request FOREIGN KEY(leave_request_id) REFERENCES hr_leave_requests(id),
 CONSTRAINT fk_hr_lr_posting_balance FOREIGN KEY(balance_id) REFERENCES hr_leave_balances(id),
 CONSTRAINT fk_hr_lr_posting_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Allows read-only linkage of generated Leave Attendances without altering migration 026.
ALTER TABLE hr_attendances ADD COLUMN leave_request_id BIGINT UNSIGNED NULL;
ALTER TABLE hr_attendances ADD KEY ix_hr_attendance_leave_request(leave_request_id);
ALTER TABLE hr_attendances ADD CONSTRAINT fk_hr_attendance_leave_request FOREIGN KEY(leave_request_id) REFERENCES hr_leave_requests(id);
INSERT IGNORE INTO permissions(code,description) VALUES
 ('leave_requests.view','View team HR leave requests'),
 ('leave_requests.self','Submit, edit and cancel own pending leave requests'),
 ('leave_requests.manage','Submit and edit staff pending leave requests'),
 ('leave_requests.approve','Approve or reject pending leave requests'),
 ('leave_requests.import','Preview and confirm pending leave request CSV'),
 ('leave_requests.export','Export authorized leave request PDF'),
 ('leave_requests.audit','View leave request transaction history'),
 ('leave_requests.recalculate','Verify Leave Balances against original opening and postings');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'leave_requests.%'
 WHERE r.code IN ('OWNER','ADMIN','HR');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'leave_requests.view' FROM roles r WHERE r.code='MANAGER';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'leave_requests.self' FROM roles r WHERE r.code IN ('MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF');
