-- TPOS V2 Payment Methods R1. Tenant-isolated configuration only. No POS posting or provider payment requests.
CREATE TABLE IF NOT EXISTS payment_method_settings (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 method_code ENUM('CASH','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','DUITNOW_QR','EWALLET','SARA_MYKASIH') NOT NULL,
 is_active TINYINT(1) NOT NULL DEFAULT 0,
 provider_name VARCHAR(160) NULL,
 provider_api_url VARCHAR(500) NULL,
 provider_merchant_ref VARCHAR(160) NULL,
 provider_terminal_ref VARCHAR(160) NULL,
 api_key_encrypted TEXT NULL,
 api_key_configured TINYINT(1) NOT NULL DEFAULT 0,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_pm_branch_method(branch_id,method_code),
 CONSTRAINT fk_pm_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_pm_editor FOREIGN KEY(updated_by) REFERENCES users(id),
 CONSTRAINT chk_pm_active CHECK(is_active IN (0,1)),
 CONSTRAINT chk_pm_key_flag CHECK(api_key_configured IN (0,1)),
 CONSTRAINT chk_pm_sara_disabled CHECK(method_code<>'SARA_MYKASIH' OR is_active=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Store image bytes in tenant DB; never expose cross-tenant paths or open a public URL.
CREATE TABLE IF NOT EXISTS payment_method_images (
 setting_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 mime_type ENUM('image/png','image/jpeg','image/webp') NOT NULL,
 image_data MEDIUMBLOB NOT NULL,
 updated_by BIGINT UNSIGNED NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_pm_image_setting FOREIGN KEY(setting_id) REFERENCES payment_method_settings(id),
 CONSTRAINT fk_pm_image_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payment_method_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 setting_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('CONFIG_UPDATE','STATUS_CHANGE','IMAGE_UPLOAD','IMAGE_REMOVE','API_KEY_CHANGE') NOT NULL,
 previous_data JSON NULL,
 next_data JSON NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_pm_audit_setting_time(setting_id,id),
 CONSTRAINT fk_pm_audit_setting FOREIGN KEY(setting_id) REFERENCES payment_method_settings(id),
 CONSTRAINT fk_pm_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO payment_method_settings(branch_id,method_code,is_active)
 SELECT b.id,m.method_code,IF(m.method_code='CASH',1,0) FROM branches b
 CROSS JOIN (
 SELECT 'CASH' AS method_code UNION ALL SELECT 'DEBIT_CARD' UNION ALL SELECT 'CREDIT_CARD'
 UNION ALL SELECT 'BANK_TRANSFER' UNION ALL SELECT 'DUITNOW_QR' UNION ALL SELECT 'EWALLET'
 UNION ALL SELECT 'SARA_MYKASIH'
 ) m;

INSERT IGNORE INTO permissions(code,description) VALUES
 ('payment_methods.view','View payment method availability and non-secret settings'),
 ('payment_methods.manage','Owner/Admin configure payment methods and provider credentials'),
 ('payment_methods.audit','Owner/Admin view payment methods activity log');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'payment_methods.%'
 WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='payment_methods.view'
 WHERE r.code IN ('MANAGER','ACCOUNTANT','SUPERVISOR');
