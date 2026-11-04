-- HR Leave Balances R1: tenant-specific annual entitlement ledger; no posting to Attendance/Payroll.
-- Leave Request reconciliation is intentionally NOT enabled in this migration.
CREATE TABLE IF NOT EXISTS hr_leave_balances (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 staff_profile_id BIGINT UNSIGNED NOT NULL,
 leave_type_id BIGINT UNSIGNED NOT NULL,
 balance_year SMALLINT UNSIGNED NOT NULL,
 entitlement_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 carried_forward_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 adjustment_days DECIMAL(8,2) NOT NULL DEFAULT 0.00,
 used_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 pending_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 expired_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 remaining_days DECIMAL(9,2) GENERATED ALWAYS AS (
  GREATEST(0,entitlement_days + carried_forward_days + adjustment_days - used_days - pending_days - expired_days)
 ) STORED,
 adjustment_notes TEXT NULL,
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 last_recalculated_at DATETIME(6) NULL,
 created_by_user_id BIGINT UNSIGNED NULL,
 updated_by_user_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_hr_balance_year(staff_profile_id,leave_type_id,balance_year),
 KEY ix_hr_balance_year(balance_year,staff_profile_id),
 KEY ix_hr_balance_status(status),
 CONSTRAINT fk_hr_balance_staff FOREIGN KEY(staff_profile_id) REFERENCES staff_profiles(id),
 CONSTRAINT fk_hr_balance_type FOREIGN KEY(leave_type_id) REFERENCES hr_leave_types(id),
 CONSTRAINT fk_hr_balance_creator FOREIGN KEY(created_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_hr_balance_updater FOREIGN KEY(updated_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_hr_balance_year CHECK(balance_year BETWEEN 2000 AND 2100),
 CONSTRAINT chk_hr_balance_entitlement CHECK(entitlement_days>=0 AND carried_forward_days>=0 AND used_days>=0 AND pending_days>=0 AND expired_days>=0),
 CONSTRAINT chk_hr_balance_nonnegative CHECK(entitlement_days + carried_forward_days + adjustment_days - used_days - pending_days - expired_days >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_leave_balance_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 balance_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NULL,
 action_type ENUM('CREATE','UPDATE','GENERATE','IMPORT_CREATE','DEACTIVATE','REACTIVATE') NOT NULL,
 reason VARCHAR(1000) NOT NULL,
 previous_data JSON NULL,
 next_data JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_balance_audit(balance_id,id),
 CONSTRAINT fk_hr_balance_audit_balance FOREIGN KEY(balance_id) REFERENCES hr_leave_balances(id),
 CONSTRAINT fk_hr_balance_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('leave_balances.view','View HR leave balances'),
 ('leave_balances.manage','Create, update and change status of leave balances'),
 ('leave_balances.generate','Generate missing annual leave balances'),
 ('leave_balances.import','Preview and confirm HR leave balance CSV'),
 ('leave_balances.export','Export authorized HR leave balance report'),
 ('leave_balances.audit','View HR leave balance audit history');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'leave_balances.%' WHERE r.code IN ('OWNER','ADMIN','HR');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'leave_balances.view' FROM roles r WHERE r.code='MANAGER';
