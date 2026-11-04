-- HR Leave Types R1: independent tenant policy catalog, append-only audit, no leave balance posting.
-- Existing migrations and approved HR Attendance / Attendance Clock tables are not modified.
CREATE TABLE IF NOT EXISTS hr_leave_types (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 leave_code VARCHAR(16) NOT NULL,
 leave_name VARCHAR(150) NOT NULL,
 description TEXT NULL,
 attendance_status ENUM('Annual Leave','Medical Leave','Unpaid Leave') NOT NULL,
 default_entitlement_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 is_paid TINYINT(1) NOT NULL DEFAULT 0,
 requires_attachment TINYINT(1) NOT NULL DEFAULT 0,
 allow_half_day TINYINT(1) NOT NULL DEFAULT 0,
 allow_carry_forward TINYINT(1) NOT NULL DEFAULT 0,
 max_carry_forward_days DECIMAL(7,2) NOT NULL DEFAULT 0.00,
 max_days_per_request DECIMAL(7,2) NULL,
 minimum_service_months SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 gender_restriction ENUM('All','Male','Female') NOT NULL DEFAULT 'All',
 sort_order INT UNSIGNED NOT NULL DEFAULT 0,
 status ENUM('active','inactive') NOT NULL DEFAULT 'active',
 is_deleted TINYINT(1) NOT NULL DEFAULT 0,
 created_by_user_id BIGINT UNSIGNED NULL,
 updated_by_user_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_hr_leave_code(leave_code),
 KEY ix_hr_leave_order(sort_order,leave_code),
 KEY ix_hr_leave_status(status,attendance_status),
 CONSTRAINT fk_hr_leave_created FOREIGN KEY(created_by_user_id) REFERENCES users(id),
 CONSTRAINT fk_hr_leave_updated FOREIGN KEY(updated_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_hr_leave_default CHECK(default_entitlement_days>=0),
 CONSTRAINT chk_hr_leave_carry CHECK(max_carry_forward_days>=0),
 CONSTRAINT chk_hr_leave_request CHECK(max_days_per_request IS NULL OR max_days_per_request>0),
 CONSTRAINT chk_hr_leave_months CHECK(minimum_service_months BETWEEN 0 AND 600)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS hr_leave_type_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 leave_type_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NULL,
 action_type ENUM('CREATE','UPDATE','DEACTIVATE','REACTIVATE','IMPORT_CREATE') NOT NULL,
 details JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_hr_leave_audit(leave_type_id,id),
 CONSTRAINT fk_hr_leave_audit_type FOREIGN KEY(leave_type_id) REFERENCES hr_leave_types(id),
 CONSTRAINT fk_hr_leave_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('leave_types.view','View tenant HR Leave Types'),
 ('leave_types.manage','Create, update and deactivate HR Leave Types'),
 ('leave_types.import','Preview and confirm Leave Types CSV'),
 ('leave_types.export','Export authorized Leave Types PDF'),
 ('leave_types.audit','View HR Leave Types activity history');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'leave_types.%' WHERE r.code IN ('OWNER','ADMIN','HR');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'leave_types.view' FROM roles r WHERE r.code='MANAGER';
-- Preserve the V1 AL / MC / UL seeds without overwriting existing tenant policies.
INSERT IGNORE INTO hr_leave_types
 (leave_code,leave_name,description,attendance_status,default_entitlement_days,is_paid,requires_attachment,allow_half_day,allow_carry_forward,max_carry_forward_days,max_days_per_request,minimum_service_months,gender_restriction,sort_order,status)
 VALUES
 ('AL','Annual Leave','Paid annual leave entitlement.','Annual Leave',14.00,1,0,1,1,7.00,NULL,0,'All',1,'active'),
 ('MC','Medical Leave','Medical leave with MC attachment.','Medical Leave',14.00,1,1,0,0,0.00,NULL,0,'All',2,'active'),
 ('UL','Unpaid Leave','Unpaid leave without salary entitlement.','Unpaid Leave',0.00,0,0,1,0,0.00,NULL,0,'All',3,'active'),
 -- EL is a separate leave policy. Keep inactive pending HR rules and future balance integration.
 ('EL','Emergency Leave','Policy pending HR approval. Provisional attendance mapping only; no balance or payroll posting.','Annual Leave',0.00,0,0,0,0,0.00,NULL,0,'All',4,'inactive');
