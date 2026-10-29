-- TPOS V2 Discount R1: tenant-isolated master records, not voucher redemption or POS posting.
-- Additive and safe for fresh tenants and tenants already running Product R3.
CREATE TABLE IF NOT EXISTS discounts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 discount_code VARCHAR(50) NOT NULL,
 discount_name VARCHAR(160) NOT NULL,
 description VARCHAR(1000) NULL,
 discount_type ENUM('PERCENTAGE','FIXED_AMOUNT') NOT NULL,
 discount_scope ENUM('ORDER','ITEM') NOT NULL,
 eligibility_type ENUM('ALL','CATEGORY','PRODUCT') NOT NULL DEFAULT 'ALL',
 discount_value DECIMAL(14,2) NOT NULL,
 minimum_spend DECIMAL(14,2) NOT NULL DEFAULT 0.00,
 maximum_discount_amount DECIMAL(14,2) NULL,
 start_date DATE NULL,
 end_date DATE NULL,
 usage_limit INT UNSIGNED NULL,
 usage_count INT UNSIGNED NOT NULL DEFAULT 0,
 sort_order INT NOT NULL DEFAULT 0,
 status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
 is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
 created_by BIGINT UNSIGNED NOT NULL,
 updated_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_discount_code(discount_code),
 INDEX ix_discount_status_dates(status,is_deleted,start_date,end_date),
 INDEX ix_discount_priority(sort_order,id),
 CONSTRAINT fk_discount_created_by FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT fk_discount_updated_by FOREIGN KEY(updated_by) REFERENCES users(id),
 CONSTRAINT chk_discount_value CHECK(discount_value>0 AND (discount_type='FIXED_AMOUNT' OR discount_value<=100)),
 CONSTRAINT chk_discount_min_spend CHECK(minimum_spend>=0),
 CONSTRAINT chk_discount_max CHECK(maximum_discount_amount IS NULL OR maximum_discount_amount>0),
 CONSTRAINT chk_discount_dates CHECK(start_date IS NULL OR end_date IS NULL OR end_date>=start_date),
 CONSTRAINT chk_discount_usage CHECK(usage_limit IS NULL OR usage_limit>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS discount_targets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 discount_id BIGINT UNSIGNED NOT NULL,
 category_id BIGINT UNSIGNED NULL,
 product_id BIGINT UNSIGNED NULL,
 CONSTRAINT fk_discount_target_discount FOREIGN KEY(discount_id) REFERENCES discounts(id),
 CONSTRAINT fk_discount_target_category FOREIGN KEY(category_id) REFERENCES categories(id),
 CONSTRAINT fk_discount_target_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT chk_discount_target_one CHECK((category_id IS NOT NULL AND product_id IS NULL) OR (category_id IS NULL AND product_id IS NOT NULL)),
 UNIQUE KEY uq_discount_target_category(discount_id,category_id),
 UNIQUE KEY uq_discount_target_product(discount_id,product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS discount_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 discount_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('DISCOUNT_CREATE','DISCOUNT_UPDATE','DISCOUNT_ACTIVATE','DISCOUNT_DEACTIVATE','DISCOUNT_ARCHIVE','DISCOUNT_IMPORT') NOT NULL,
 previous_data JSON NULL,
 next_data JSON NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_discount_audit_discount FOREIGN KEY(discount_id) REFERENCES discounts(id),
 CONSTRAINT fk_discount_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
 INDEX ix_discount_audit_log(created_at,id),
 INDEX ix_discount_audit_record(discount_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('discounts.view','View discount master data'),
 ('discounts.create','Create discounts'),
 ('discounts.update','Edit discount rules and status'),
 ('discounts.delete','Archive discounts with audit history'),
 ('discounts.import','Import discounts with read-only preview'),
 ('discounts.export','Export discounts and print PDF'),
 ('discounts.audit','View discount activity logs');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code IN ('OWNER','ADMIN') AND p.code LIKE 'discounts.%';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code='MANAGER' AND p.code IN ('discounts.view','discounts.create','discounts.update','discounts.import','discounts.export','discounts.audit');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code IN ('ACCOUNTANT','SUPERVISOR') AND p.code IN ('discounts.view','discounts.export');
