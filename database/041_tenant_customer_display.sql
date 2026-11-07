-- Customer Display R1: tenant-local presentation only. No changes to stock, sale, payment or accounting ledgers.
-- Run after migration 040. Never re-run historical migration files on existing tenants.
CREATE TABLE IF NOT EXISTS customer_display_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 welcome_message VARCHAR(180) NOT NULL DEFAULT 'Welcome!',
 success_english VARCHAR(240) NOT NULL DEFAULT 'Thank You, Please Come Again!',
 success_malay VARCHAR(240) NOT NULL DEFAULT 'Terima kasih, sila datang lagi!',
 media_interval_seconds TINYINT UNSIGNED NOT NULL DEFAULT 8,
 cash_change_seconds TINYINT UNSIGNED NOT NULL DEFAULT 5,
 success_seconds TINYINT UNSIGNED NOT NULL DEFAULT 12,
 promotions_enabled TINYINT(1) NOT NULL DEFAULT 1,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT chk_cd_settings_single CHECK(id=1),
 CONSTRAINT chk_cd_settings_interval CHECK(media_interval_seconds BETWEEN 5 AND 60),
 CONSTRAINT chk_cd_settings_cash CHECK(cash_change_seconds BETWEEN 3 AND 15),
 CONSTRAINT chk_cd_settings_success CHECK(success_seconds BETWEEN 5 AND 45),
 CONSTRAINT fk_cd_settings_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS customer_display_media (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(120) NOT NULL,
 media_type ENUM('IMAGE','VIDEO') NOT NULL,
 mime_type ENUM('image/png','image/jpeg','image/webp','video/mp4') NOT NULL,
 file_data LONGBLOB NOT NULL,
 sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
 is_active TINYINT(1) NOT NULL DEFAULT 1,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_cd_media_order(is_active,sort_order,id),
 CONSTRAINT fk_cd_media_actor FOREIGN KEY(created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS customer_display_sessions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 cashier_user_id BIGINT UNSIGNED NOT NULL,
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 draft_id BIGINT UNSIGNED NULL,
 mode ENUM('ORDER','CASH','QR','MANUAL') NOT NULL DEFAULT 'ORDER',
 attempt_id BIGINT UNSIGNED NULL,
 snapshot JSON NULL,
 expires_at DATETIME(6) NOT NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_cd_cashier_branch(branch_id,cashier_user_id),
 UNIQUE KEY uq_cd_session_token(token_hash),
 KEY ix_cd_session_expiry(expires_at),
 CONSTRAINT fk_cd_session_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_cd_session_cashier FOREIGN KEY(cashier_user_id) REFERENCES users(id),
 CONSTRAINT fk_cd_session_draft FOREIGN KEY(draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT fk_cd_session_attempt FOREIGN KEY(attempt_id) REFERENCES pos_payment_attempts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS customer_display_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 event_type ENUM('SETTINGS','MEDIA_UPLOAD','MEDIA_UPDATE','MEDIA_DELETE','PAIR','PUBLISH','PAYMENT_SCREEN') NOT NULL,
 details JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_cd_audit_recorded(recorded_at,id),
 CONSTRAINT fk_cd_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO customer_display_settings(id) VALUES(1);
INSERT IGNORE INTO permissions(code,description) VALUES
 ('customer_display.view','View Customer Display owner configuration'),
 ('customer_display.manage','Edit Customer Display content and media as Owner'),
 ('customer_display.pair','Pair own POS cash desk to a customer-facing display'),
 ('customer_display.publish','Publish only own active POS order and checkout state');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p
 ON (p.code='customer_display.view' AND r.code IN ('OWNER','ADMIN'))
 OR (p.code='customer_display.manage' AND r.code='OWNER')
 OR (p.code IN ('customer_display.pair','customer_display.publish') AND r.code IN ('OWNER','ADMIN','CASHIER'))
 WHERE p.code LIKE 'customer_display.%';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('customer_display_r1_041');
