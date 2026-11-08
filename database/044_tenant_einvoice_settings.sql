-- EINV R1.1: tenant-scoped MyInvois settings only. No POS/receipt/customer data mutations.
CREATE TABLE IF NOT EXISTS einvoice_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 enabled TINYINT(1) NOT NULL DEFAULT 0,
 environment ENUM('SANDBOX','PRODUCTION') NOT NULL DEFAULT 'SANDBOX',
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT chk_einvoice_settings_id CHECK (id=1),
 CONSTRAINT fk_einvoice_settings_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO einvoice_settings(id,enabled,environment) VALUES(1,0,'SANDBOX');
CREATE TABLE IF NOT EXISTS einvoice_credentials (
 environment ENUM('SANDBOX','PRODUCTION') NOT NULL PRIMARY KEY,
 client_id_cipher TEXT NOT NULL,
 client_secret_cipher TEXT NOT NULL,
 verified_at DATETIME(6) NULL,
 updated_by BIGINT UNSIGNED NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_einvoice_credentials_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS einvoice_settings_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('SETTINGS_UPDATE','CREDENTIALS_UPDATE','CONNECTION_SUCCESS','CONNECTION_FAILED') NOT NULL,
 environment ENUM('SANDBOX','PRODUCTION') NOT NULL,
 details VARCHAR(500) NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_einvoice_settings_audit_time (recorded_at,id),
 CONSTRAINT fk_einvoice_settings_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('einvoice_settings.view','View MyInvois settings'),
 ('einvoice_settings.manage','Manage MyInvois settings and encrypted credentials'),
 ('einvoice_settings.audit','View MyInvois settings activity');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'einvoice_settings.%' WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('einvoice_settings_r11_044');
