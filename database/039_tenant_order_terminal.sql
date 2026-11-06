-- TPOS V2 Order Terminal R1. Only WAITER-submitted Take Away and Dine In orders.
-- A waiter order is NOT a POS sale, kitchen ticket, stock movement, payment or journal.
-- The cashier must explicitly claim it into an existing open Cash Shift.
CREATE TABLE IF NOT EXISTS waiter_orders (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 waiter_user_id BIGINT UNSIGNED NOT NULL,
 order_scope ENUM('TAKE_AWAY','DINE_IN') NOT NULL,
 table_id BIGINT UNSIGNED NULL,
 status ENUM('SUBMITTED','CLAIMED','CANCELLED') NOT NULL DEFAULT 'SUBMITTED',
 active_table_id BIGINT UNSIGNED GENERATED ALWAYS AS
  (CASE WHEN order_scope='DINE_IN' AND status='SUBMITTED' THEN table_id ELSE NULL END) STORED,
 pos_draft_id BIGINT UNSIGNED NULL,
 order_notes VARCHAR(500) NOT NULL DEFAULT '',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_waiter_request(request_key),
 UNIQUE KEY uq_waiter_active_table(active_table_id),
 UNIQUE KEY uq_waiter_pos_draft(pos_draft_id),
 KEY ix_waiter_branch_queue(branch_id,status,created_at),
 KEY ix_waiter_owner(waiter_user_id,created_at),
 CONSTRAINT fk_waiter_order_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_waiter_order_actor FOREIGN KEY(waiter_user_id) REFERENCES users(id),
 CONSTRAINT fk_waiter_order_table FOREIGN KEY(table_id) REFERENCES restaurant_tables(id),
 CONSTRAINT fk_waiter_order_pos FOREIGN KEY(pos_draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT chk_waiter_table_scope CHECK ((order_scope='TAKE_AWAY' AND table_id IS NULL) OR (order_scope='DINE_IN' AND table_id IS NOT NULL)),
 CONSTRAINT chk_waiter_version CHECK (version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS waiter_order_lines (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 order_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 product_name VARCHAR(220) NOT NULL,
 sku VARCHAR(64) NULL,
 barcode VARCHAR(100) NULL,
 category_id BIGINT UNSIGNED NOT NULL,
 unit_code VARCHAR(12) NOT NULL,
 quantity DECIMAL(18,3) NOT NULL,
 unit_price DECIMAL(18,4) NOT NULL,
 track_stock TINYINT(1) NOT NULL,
 product_type VARCHAR(16) NOT NULL,
 line_notes VARCHAR(500) NOT NULL DEFAULT '',
 UNIQUE KEY uq_waiter_order_product(order_id,product_id),
 CONSTRAINT fk_waiter_line_order FOREIGN KEY(order_id) REFERENCES waiter_orders(id),
 CONSTRAINT fk_waiter_line_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT chk_waiter_line_qty CHECK(quantity>0 AND quantity<=1000),
 CONSTRAINT chk_waiter_line_price CHECK(unit_price>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS waiter_order_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 order_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('SUBMIT','CANCEL','CLAIM') NOT NULL,
 details JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_waiter_order_audit(order_id,id),
 CONSTRAINT fk_waiter_audit_order FOREIGN KEY(order_id) REFERENCES waiter_orders(id),
 CONSTRAINT fk_waiter_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('order_terminal.view','View waiter Order Terminal and own submitted orders'),
 ('order_terminal.create','Submit Take Away and Dine In orders without Cash Shift'),
 ('order_terminal.cancel','Cancel own unclaimed order with reason'),
 ('order_terminal.receive','Claim waiter order into cashier POS with own open Cash Shift');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('order_terminal.view','order_terminal.create','order_terminal.cancel')
 WHERE r.code IN ('WAITER','OWNER','ADMIN');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'order_terminal.receive' FROM roles r
 WHERE r.code IN ('CASHIER','OWNER','ADMIN','MANAGER','SUPERVISOR');
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('order_terminal_r1_039');
