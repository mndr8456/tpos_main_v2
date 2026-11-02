-- TPOS Main V2 Inventory Foundation R1. Tenant-only, additive.
-- Ledger is separate from Product's reference cost; NO sales/payment/accounting posting.
-- Physical opening balances require subsequent accounting opening-journal reconciliation.
CREATE TABLE IF NOT EXISTS inventory_branch_balances (
 branch_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 quantity_on_hand DECIMAL(18,6) NOT NULL,
 carrying_value DECIMAL(24,8) NOT NULL,
 average_cost DECIMAL(18,8) NOT NULL,
 version BIGINT UNSIGNED NOT NULL DEFAULT 1,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 PRIMARY KEY(branch_id,product_id),
 CONSTRAINT fk_inventory_balance_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_inventory_balance_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT chk_inventory_qty CHECK(quantity_on_hand>=0),
 CONSTRAINT chk_inventory_value CHECK(carrying_value>=0),
 CONSTRAINT chk_inventory_average CHECK(average_cost>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS inventory_movements (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 movement_type ENUM('OPENING','RECEIPT','ISSUE','ADJUSTMENT_IN','ADJUSTMENT_OUT','POS_SALE','SALES_RETURN') NOT NULL,
 quantity_delta DECIMAL(18,6) NOT NULL,
 value_delta DECIMAL(24,8) NOT NULL,
 quantity_after DECIMAL(18,6) NOT NULL,
 carrying_value_after DECIMAL(24,8) NOT NULL,
 average_cost_after DECIMAL(18,8) NOT NULL,
 reference VARCHAR(120) NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_inventory_request(request_key),
 KEY ix_inventory_product_branch(branch_id,product_id,id),
 CONSTRAINT fk_inventory_movement_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_inventory_movement_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_inventory_movement_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
 CONSTRAINT chk_inventory_after_qty CHECK(quantity_after>=0),
 CONSTRAINT chk_inventory_after_value CHECK(carrying_value_after>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('inventory.view','View branch inventory quantities and valuation'),
 ('inventory.opening','Create a one-time physical opening stock position'),
 ('inventory.audit','View immutable inventory movement ledger');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('inventory.view','inventory.audit')
 WHERE r.code IN ('OWNER','ADMIN','MANAGER','ACCOUNTANT');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='inventory.opening'
 WHERE r.code IN ('OWNER','ADMIN');
