-- Company Profile R1. Only execute once when address_line3 does not exist.
-- No mutation to historical receipt, sale, customer display or accounting tables.
ALTER TABLE company_profiles ADD COLUMN address_line3 VARCHAR(255) NULL AFTER address_line2;
CREATE TABLE IF NOT EXISTS company_profile_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 previous_data JSON NOT NULL,
 next_data JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_company_profile_audit_time(recorded_at,id),
 CONSTRAINT fk_company_profile_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('company_profile.view','View tenant company profile'),
 ('company_profile.manage','Edit tenant company address contact and TIN'),
 ('company_profile.audit','View company profile change log');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'company_profile.%'
 WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('company_profile_r1_042');
