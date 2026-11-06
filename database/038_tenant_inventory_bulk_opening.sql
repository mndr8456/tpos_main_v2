-- TPOS V2 Inventory Bulk Opening R2. Tenant-only, additive, audit-preserving.
-- Single-item OPENING and RECEIPT procedures remain untouched.
-- Each batch is atomic: batch, every balance, movement, and audited unit cost.
CREATE TABLE IF NOT EXISTS inventory_bulk_opening_batches (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 reference VARCHAR(120) NOT NULL,
 row_count SMALLINT UNSIGNED NOT NULL,
 total_quantity DECIMAL(18,2) NOT NULL,
 total_value DECIMAL(18,2) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_inventory_bulk_batch_key(request_key),
 CONSTRAINT fk_inventory_bulk_batch_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_inventory_bulk_batch_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
 CONSTRAINT chk_inventory_bulk_count CHECK(row_count BETWEEN 1 AND 1000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS inventory_bulk_opening_lines (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 batch_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 movement_id BIGINT UNSIGNED NOT NULL,
 opening_quantity DECIMAL(18,2) NOT NULL,
 actual_unit_cost DECIMAL(18,2) NOT NULL,
 opening_value DECIMAL(18,2) NOT NULL,
 UNIQUE KEY uq_inventory_bulk_line_product(batch_id,product_id),
 UNIQUE KEY uq_inventory_bulk_line_movement(movement_id),
 CONSTRAINT fk_inventory_bulk_line_batch FOREIGN KEY(batch_id) REFERENCES inventory_bulk_opening_batches(id),
 CONSTRAINT fk_inventory_bulk_line_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_inventory_bulk_line_movement FOREIGN KEY(movement_id) REFERENCES inventory_movements(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('inventory_bulk_opening_r2_038');
