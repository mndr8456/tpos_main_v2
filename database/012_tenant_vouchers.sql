-- TPOS V2 Voucher R1. Independent of Discounts and POS; additive, tenant-scoped.
-- Existing tenant: explicit npm run db:vouchers -- --apply. Never run legacy Voucher V1 migrations.
CREATE TABLE IF NOT EXISTS voucher_print_settings (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 width_cm DECIMAL(5,2) NOT NULL DEFAULT 18.55,
 height_cm DECIMAL(5,2) NOT NULL DEFAULT 8.45,
 updated_by BIGINT UNSIGNED NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_voucher_print_user FOREIGN KEY(updated_by) REFERENCES users(id),
 CONSTRAINT chk_voucher_print_singleton CHECK(id=1),
 CONSTRAINT chk_voucher_print_width CHECK(width_cm BETWEEN 5.00 AND 30.00),
 CONSTRAINT chk_voucher_print_height CHECK(height_cm BETWEEN 3.00 AND 20.00)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO voucher_print_settings(id,width_cm,height_cm) VALUES (1,18.55,8.45);
CREATE TABLE IF NOT EXISTS vouchers (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 voucher_code VARCHAR(80) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 voucher_name VARCHAR(160) NOT NULL,
 description VARCHAR(1000) NULL,
 discount_type ENUM('PERCENTAGE','FIXED_AMOUNT') NOT NULL,
 discount_value DECIMAL(14,2) NOT NULL,
 minimum_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
 maximum_discount DECIMAL(14,2) NULL,
 starts_at DATETIME NOT NULL,
 ends_at DATETIME NOT NULL,
 order_scope ENUM('BOTH','DINE_IN','TAKE_AWAY') NOT NULL DEFAULT 'BOTH',
 eligibility_type ENUM('ALL','CATEGORY','PRODUCT') NOT NULL DEFAULT 'ALL',
 usage_limit INT UNSIGNED NULL,
 per_customer_limit INT UNSIGNED NULL,
 status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'INACTIVE',
 is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
 created_by BIGINT UNSIGNED NOT NULL,
 updated_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_voucher_code(voucher_code),
 INDEX ix_voucher_validity(status,is_deleted,starts_at,ends_at),
 CONSTRAINT fk_voucher_created_user FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT fk_voucher_updated_user FOREIGN KEY(updated_by) REFERENCES users(id),
 CONSTRAINT chk_voucher_value CHECK(discount_value>0 AND (discount_type='FIXED_AMOUNT' OR discount_value<=100)),
 CONSTRAINT chk_voucher_minimum CHECK(minimum_spend>=0),
 CONSTRAINT chk_voucher_cap CHECK(maximum_discount IS NULL OR maximum_discount>0),
 CONSTRAINT chk_voucher_dates CHECK(ends_at>starts_at),
 CONSTRAINT chk_voucher_limits CHECK((usage_limit IS NULL OR usage_limit>0) AND (per_customer_limit IS NULL OR per_customer_limit>0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS voucher_targets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 voucher_id BIGINT UNSIGNED NOT NULL,
 category_id BIGINT UNSIGNED NULL,
 product_id BIGINT UNSIGNED NULL,
 UNIQUE KEY uq_voucher_target_category(voucher_id,category_id),
 UNIQUE KEY uq_voucher_target_product(voucher_id,product_id),
 CONSTRAINT fk_voucher_target_owner FOREIGN KEY(voucher_id) REFERENCES vouchers(id),
 CONSTRAINT fk_voucher_target_category FOREIGN KEY(category_id) REFERENCES categories(id),
 CONSTRAINT fk_voucher_target_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT chk_voucher_target_one CHECK((category_id IS NULL)<>(product_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- This ledger is future POS-internal only. NO public reservation/redemption route without an authoritative checkout adapter.
CREATE TABLE IF NOT EXISTS voucher_reservations (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 voucher_id BIGINT UNSIGNED NOT NULL,
 reservation_key VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 checkout_ref VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
 customer_ref VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 checkout_type ENUM('RETAIL','SINGLE_ORDER','COMBINED_ORDER','SPLIT_ORDER') NOT NULL,
 status ENUM('RESERVED','REDEEMED','RELEASED') NOT NULL DEFAULT 'RESERVED',
 eligible_subtotal DECIMAL(14,2) NOT NULL,
 discount_amount DECIMAL(14,2) NOT NULL,
 sale_ref VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
 release_reason VARCHAR(255) NULL,
 reserved_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 redeemed_at DATETIME(6) NULL,
 released_at DATETIME(6) NULL,
 created_by BIGINT UNSIGNED NOT NULL,
 UNIQUE KEY uq_voucher_reservation_key(reservation_key),
 INDEX ix_voucher_reservations_usage(voucher_id,status),
 INDEX ix_voucher_reservations_customer(voucher_id,customer_ref,status),
 INDEX ix_voucher_reservations_checkout(checkout_ref),
 CONSTRAINT fk_voucher_reservation_owner FOREIGN KEY(voucher_id) REFERENCES vouchers(id),
 CONSTRAINT fk_voucher_reservation_user FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT chk_voucher_reservation_amount CHECK(discount_amount>0 AND eligible_subtotal>=discount_amount),
 CONSTRAINT chk_voucher_reservation_sale CHECK((status='REDEEMED' AND sale_ref IS NOT NULL AND redeemed_at IS NOT NULL) OR (status<>'REDEEMED' AND sale_ref IS NULL)),
 CONSTRAINT chk_voucher_reservation_release CHECK(status<>'RELEASED' OR (release_reason IS NOT NULL AND released_at IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS voucher_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 voucher_id BIGINT UNSIGNED NULL,
 reservation_id BIGINT UNSIGNED NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type VARCHAR(48) NOT NULL,
 previous_data JSON NULL,
 next_data JSON NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX ix_voucher_audit_time(id),
 INDEX ix_voucher_audit_parent(voucher_id,id),
 CONSTRAINT fk_voucher_audit_owner FOREIGN KEY(voucher_id) REFERENCES vouchers(id),
 CONSTRAINT fk_voucher_audit_reservation FOREIGN KEY(reservation_id) REFERENCES voucher_reservations(id),
 CONSTRAINT fk_voucher_audit_user FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('vouchers.view','View voucher master'),
 ('vouchers.manage','Create, edit, deactivate and archive vouchers'),
 ('vouchers.audit','View voucher activity logs'),
 ('vouchers.print','Print voucher with barcode and QR'),
 ('vouchers.print.settings','Owner may configure voucher paper width and height');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('vouchers.view','vouchers.manage','vouchers.audit','vouchers.print') WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='vouchers.print.settings' WHERE r.code='OWNER';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='vouchers.view' WHERE r.code IN ('MANAGER','ACCOUNTANT','SUPERVISOR');
