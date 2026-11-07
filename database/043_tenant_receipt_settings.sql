-- R1 Receipt Settings: isolated tenant settings and immutable per-sale footer.
-- Does not update any historic POS sale, tax, payment, Customer Display, or journal.
CREATE TABLE IF NOT EXISTS receipt_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 footer_message VARCHAR(500) NOT NULL DEFAULT 'Thank you.',
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT chk_receipt_settings_id CHECK (id=1),
 CONSTRAINT fk_receipt_settings_actor FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO receipt_settings(id,footer_message) VALUES(1,'Thank you.');
CREATE TABLE IF NOT EXISTS receipt_settings_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 previous_footer VARCHAR(500) NOT NULL,
 next_footer VARCHAR(500) NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_receipt_settings_audit_time(recorded_at,id),
 CONSTRAINT fk_receipt_settings_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_sale_receipt_footers (
 sale_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 footer_message VARCHAR(500) NOT NULL,
 CONSTRAINT fk_pos_sale_receipt_footer FOREIGN KEY(sale_id) REFERENCES pos_sales(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('receipt_settings.view','View tenant receipt settings'),
 ('receipt_settings.manage','Edit tenant receipt footer'),
 ('receipt_settings.audit','View receipt settings activity log');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'receipt_settings.%'
 WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('receipt_settings_r1_043');
