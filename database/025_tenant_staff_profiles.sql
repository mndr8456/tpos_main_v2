-- TPOS Main V2 - HR Staff Profiles R1. Only tenant data, no changes to previous migrations.
CREATE TABLE IF NOT EXISTS staff_profiles (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 staff_no VARCHAR(50) NOT NULL,
 ic_no VARCHAR(12) NULL,
 address_line_1 VARCHAR(255) NULL, address_line_2 VARCHAR(255) NULL, address_line_3 VARCHAR(255) NULL,
 postcode VARCHAR(20) NULL, city VARCHAR(100) NULL, state_name VARCHAR(100) NULL, country_code CHAR(3) NOT NULL DEFAULT 'MYS',
 emergency_contact_name VARCHAR(255) NULL, emergency_contact_relationship VARCHAR(100) NULL, emergency_contact_phone VARCHAR(30) NULL,
 epf_no VARCHAR(50) NULL, socso_no VARCHAR(50) NULL, eis_no VARCHAR(50) NULL, income_tax_no VARCHAR(50) NULL,
 bank_name VARCHAR(150) NULL, bank_account_name VARCHAR(255) NULL, bank_account_no VARCHAR(100) NULL,
 job_title VARCHAR(150) NULL, department VARCHAR(150) NULL,
 employment_type ENUM('Full Time','Part Time','Intern') NOT NULL DEFAULT 'Full Time',
 join_date DATE NULL, confirmation_date DATE NULL, resignation_date DATE NULL,
 salary_type ENUM('Monthly','Daily','Hourly') NOT NULL DEFAULT 'Monthly',
 basic_salary DECIMAL(12,2) NOT NULL DEFAULT 0.00,
 overtime_rate_per_hour DECIMAL(12,2) NOT NULL DEFAULT 0.00,
 standard_working_hours_per_day DECIMAL(5,2) NOT NULL DEFAULT 8.00,
 standard_working_days_per_month DECIMAL(5,2) NOT NULL DEFAULT 26.00,
 employment_status ENUM('Active','Probation','Suspended','Resigned','Terminated') NOT NULL DEFAULT 'Active',
 notes TEXT NULL,
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 image_mime VARCHAR(30) NULL, image_data MEDIUMBLOB NULL,
 created_by_user_id BIGINT UNSIGNED NULL, updated_by_user_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_staff_profile_user(user_id), UNIQUE KEY uq_staff_profile_number(staff_no),
 KEY ix_staff_dept(department), KEY ix_staff_employment(employment_type,employment_status),
 KEY ix_staff_status(status),
 CONSTRAINT fk_staff_user FOREIGN KEY(user_id) REFERENCES users(id),
 CONSTRAINT fk_staff_created FOREIGN KEY(created_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_staff_updated FOREIGN KEY(updated_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_staff_ic CHECK (ic_no IS NULL OR ic_no REGEXP '^[0-9]{12}$'),
 CONSTRAINT chk_staff_salary CHECK (basic_salary>=0 AND overtime_rate_per_hour>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS staff_profile_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 staff_profile_id BIGINT UNSIGNED NOT NULL, actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type VARCHAR(40) NOT NULL, details JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_staff_audit_profile(staff_profile_id,id),
 CONSTRAINT fk_staff_audit_profile FOREIGN KEY(staff_profile_id) REFERENCES staff_profiles(id),
 CONSTRAINT fk_staff_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('staff_profiles.view','View Staff Profiles with role-limited sensitive fields'),
 ('staff_profiles.manage','Create and update Staff Profiles'),
 ('staff_profiles.print','Print Staff Form and Blank Staff Form'),
 ('staff_profiles.import','Preview and import Staff Profiles'),
 ('staff_profiles.audit','View Staff Profile change logs'),
 ('staff_profiles.self','View and update own permitted profile fields');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'staff_profiles.%' WHERE r.code IN ('OWNER','ADMIN','HR');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'staff_profiles.view' FROM roles r WHERE r.code='MANAGER';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'staff_profiles.self' FROM roles r WHERE r.code IN ('MANAGER','ACCOUNTANT','SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF');
