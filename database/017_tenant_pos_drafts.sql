-- TPOS V2 POS Integration R1: durable carts only. Absolutely no sale, payment, stock or shift posting.
-- Full checkout MUST be developed separately after accounting, inventory and provider validation.
CREATE TABLE IF NOT EXISTS pos_drafts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 cashier_user_id BIGINT UNSIGNED NOT NULL,
 shift_id BIGINT UNSIGNED NOT NULL,
 order_scope ENUM('TAKE_AWAY','DINE_IN') NOT NULL DEFAULT 'TAKE_AWAY',
 status ENUM('DRAFT','HELD','DISCARDED') NOT NULL DEFAULT 'DRAFT',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_pos_draft_create_request(request_key),
 KEY ix_pos_draft_cashier(cashier_user_id,status,updated_at),
 KEY ix_pos_draft_shift(shift_id,status),
 CONSTRAINT fk_pos_draft_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_pos_draft_cashier FOREIGN KEY(cashier_user_id) REFERENCES users(id),
 CONSTRAINT fk_pos_draft_shift FOREIGN KEY(shift_id) REFERENCES cash_shifts(id),
 CONSTRAINT chk_pos_draft_version CHECK(version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_draft_lines (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 draft_id BIGINT UNSIGNED NOT NULL,
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
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_pos_draft_product(draft_id,product_id),
 CONSTRAINT fk_pos_line_draft FOREIGN KEY(draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT fk_pos_line_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT chk_pos_line_qty CHECK(quantity>0 AND quantity<=10000),
 CONSTRAINT chk_pos_line_price CHECK(unit_price>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_draft_commands (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 draft_id BIGINT UNSIGNED NOT NULL,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 action VARCHAR(30) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_pos_draft_command(draft_id,request_key),
 CONSTRAINT fk_pos_command_draft FOREIGN KEY(draft_id) REFERENCES pos_drafts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_draft_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 draft_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('CREATE','ADD_LINE','CHANGE_QUANTITY','REMOVE_LINE','HOLD','RESUME','DISCARD') NOT NULL,
 details JSON NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_pos_draft_audit(draft_id,id),
 CONSTRAINT fk_pos_audit_draft FOREIGN KEY(draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT fk_pos_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('pos.view','Access the POS catalog, current shift and own saved carts'),
 ('pos.cart.manage','Create, edit, hold and discard carts in own open cash shift'),
 ('pos.audit','View own POS cart audit records');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'pos.%'
 WHERE r.code IN ('OWNER','ADMIN','MANAGER','SUPERVISOR','CASHIER');
