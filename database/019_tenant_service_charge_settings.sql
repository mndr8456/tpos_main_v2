-- TPOS Main V2 Service Charge Settings R1
-- Separate merchant charge, NOT JKDM Sales Tax or Service Tax.
-- Tenant-scoped, non-destructive, OFF by default; checkout is not connected.
CREATE TABLE IF NOT EXISTS service_charge_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 is_enabled TINYINT(1) NOT NULL DEFAULT 0,
 charge_rate DECIMAL(5,2) NOT NULL DEFAULT 0.00,
 apply_dine_in TINYINT(1) NOT NULL DEFAULT 1,
 apply_take_away TINYINT(1) NOT NULL DEFAULT 0,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT chk_service_charge_singleton CHECK(id=1),
 CONSTRAINT chk_service_charge_enabled CHECK(is_enabled IN (0,1)),
 CONSTRAINT chk_service_charge_rate CHECK(charge_rate>=0 AND charge_rate<=100),
 CONSTRAINT chk_service_charge_dine CHECK(apply_dine_in IN (0,1)),
 CONSTRAINT chk_service_charge_take CHECK(apply_take_away IN (0,1)),
 CONSTRAINT fk_service_charge_updated_by FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS service_charge_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 previous_data JSON NULL,
 next_data JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_service_charge_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO service_charge_settings(id,is_enabled,charge_rate,apply_dine_in,apply_take_away)
 VALUES(1,0,0.00,1,0);
INSERT IGNORE INTO permissions(code,description) VALUES
 ('service_charge.view','View tenant service charge policy'),
 ('service_charge.manage','Owner edit merchant service charge policy'),
 ('service_charge.audit','View merchant service charge audit log');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'service_charge.%' WHERE r.code='OWNER';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='service_charge.view' WHERE r.code IN('ADMIN','MANAGER','ACCOUNTANT');
