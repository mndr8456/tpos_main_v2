-- TPOS Main V2 Discount Print R2: additive, tenant scoped and isolated.
-- Rule IDs remain separate from Voucher bearer codes. No financial postings.
CREATE TABLE IF NOT EXISTS discount_print_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 width_cm DECIMAL(5,2) NOT NULL DEFAULT 18.55,
 height_cm DECIMAL(5,2) NOT NULL DEFAULT 8.45,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT chk_discount_print_one CHECK(id=1),
 CONSTRAINT chk_discount_print_width CHECK(width_cm>=5 AND width_cm<=30),
 CONSTRAINT chk_discount_print_height CHECK(height_cm>=3 AND height_cm<=20),
 CONSTRAINT fk_discount_print_user FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS discount_print_settings_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 previous_data JSON NULL,
 next_data JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_discount_print_audit_user FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO discount_print_settings(id,width_cm,height_cm) VALUES(1,18.55,8.45);
