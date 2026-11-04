-- HR Attendance Clock R1. Tenant-only office networks, bounded remote-duty grants and immutable punches.
-- 026 Attendance schema and historical records are not modified.
CREATE TABLE IF NOT EXISTS hr_clock_office_networks (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 network_cidr VARCHAR(64) NOT NULL,
 label VARCHAR(120) NOT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 created_by_user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_clock_branch_network(branch_id,network_cidr),
 KEY ix_clock_office_active(branch_id,is_active),
 CONSTRAINT fk_clock_office_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_clock_office_creator FOREIGN KEY(created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_clock_remote_grants (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 staff_profile_id BIGINT UNSIGNED NOT NULL,
 starts_at DATETIME(6) NOT NULL,
 ends_at DATETIME(6) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 approved_by_user_id BIGINT UNSIGNED NOT NULL,
 revoked_at DATETIME(6) NULL,
 revoked_by_user_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_clock_remote_staff(staff_profile_id,starts_at,ends_at,revoked_at),
 CONSTRAINT fk_clock_remote_staff FOREIGN KEY(staff_profile_id) REFERENCES staff_profiles(id),
 CONSTRAINT fk_clock_remote_approver FOREIGN KEY(approved_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_clock_remote_revoker FOREIGN KEY(revoked_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_clock_remote_window CHECK(ends_at>starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_clock_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 attendance_id BIGINT UNSIGNED NOT NULL,
 staff_profile_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 event_type ENUM('CLOCK_IN','CLOCK_OUT') NOT NULL,
 clock_time DATETIME(6) NOT NULL,
 observed_ip VARCHAR(45) NOT NULL,
 network_channel ENUM('LOCAL','LAN','TUNNEL') NOT NULL,
 access_mode ENUM('OFFICE','REMOTE') NOT NULL,
 remote_grant_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_clock_punch_once(attendance_id,event_type),
 KEY ix_clock_event_staff(staff_profile_id,clock_time),
 CONSTRAINT fk_clock_event_attendance FOREIGN KEY(attendance_id) REFERENCES hr_attendances(id),
 CONSTRAINT fk_clock_event_staff FOREIGN KEY(staff_profile_id) REFERENCES staff_profiles(id),
 CONSTRAINT fk_clock_event_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
 CONSTRAINT fk_clock_event_remote FOREIGN KEY(remote_grant_id) REFERENCES hr_clock_remote_grants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_clock_policy_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 event_type ENUM('OFFICE_ADD','OFFICE_DISABLE','REMOTE_GRANT','REMOTE_REVOKE') NOT NULL,
 target_id BIGINT UNSIGNED NOT NULL,
 details JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_clock_policy_audit(recorded_at,id),
 CONSTRAINT fk_clock_policy_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('attendance_clock.view','View personal Attendance Clock and history'),
 ('attendance_clock.punch','Record own server-timestamped attendance'),
 ('attendance_clock.manage','Manage branch office IP networks and remote duty grants');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('attendance_clock.view','attendance_clock.punch')
 WHERE r.code IN ('OWNER','ADMIN','HR','MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'attendance_clock.manage' FROM roles r WHERE r.code IN ('OWNER','ADMIN','HR');
