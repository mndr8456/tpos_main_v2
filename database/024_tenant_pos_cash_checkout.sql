-- POS Cash Checkout R1: tenant-local atomic cash sale, inventory and balanced financial journal.
-- Do not apply before the Inventory 023 migration reports CURRENT.
-- External cards, bank transfer, QR, e-wallet, SARA, discounts/vouchers and refunds are NOT authorized here.
CREATE TABLE IF NOT EXISTS pos_sales (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 draft_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 shift_id BIGINT UNSIGNED NOT NULL,
 cashier_user_id BIGINT UNSIGNED NOT NULL,
 table_id BIGINT UNSIGNED NULL,
 order_scope ENUM('TAKE_AWAY','DINE_IN') NOT NULL,
 payment_method ENUM('CASH') NOT NULL,
 subtotal DECIMAL(18,2) NOT NULL,
 sales_tax DECIMAL(18,2) NOT NULL,
 service_tax DECIMAL(18,2) NOT NULL,
 service_charge DECIMAL(18,2) NOT NULL,
 rounding_adjustment DECIMAL(18,2) NOT NULL,
 total DECIMAL(18,2) NOT NULL,
 cost_of_goods DECIMAL(18,2) NOT NULL,
 cash_received DECIMAL(18,2) NOT NULL,
 cash_change DECIMAL(18,2) NOT NULL,
 status ENUM('PAID') NOT NULL DEFAULT 'PAID',
 posted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_pos_sale_request(request_key),
 UNIQUE KEY uq_pos_sale_draft(draft_id),
 KEY ix_pos_sales_shift(shift_id,id),
 CONSTRAINT fk_pos_sale_draft FOREIGN KEY(draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT fk_pos_sale_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_pos_sale_shift FOREIGN KEY(shift_id) REFERENCES cash_shifts(id),
 CONSTRAINT fk_pos_sale_cashier FOREIGN KEY(cashier_user_id) REFERENCES users(id),
 CONSTRAINT chk_pos_sale_amounts CHECK(total>=0 AND cash_received>=total AND cash_change=cash_received-total AND cost_of_goods>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_sale_lines (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 product_name VARCHAR(220) NOT NULL,
 sku VARCHAR(64) NULL,
 quantity DECIMAL(18,3) NOT NULL,
 unit_price DECIMAL(18,4) NOT NULL,
 line_total DECIMAL(18,2) NOT NULL,
 track_stock TINYINT(1) NOT NULL,
 inventory_cost DECIMAL(18,2) NOT NULL,
 CONSTRAINT fk_pos_sale_line_sale FOREIGN KEY(sale_id) REFERENCES pos_sales(id),
 CONSTRAINT fk_pos_sale_line_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT chk_pos_sale_line_amount CHECK(quantity>0 AND line_total>=0 AND inventory_cost>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Compact tenant-local double-entry journal. Accounting reporting module can read these immutable entries.
CREATE TABLE IF NOT EXISTS accounting_journals (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 source_type ENUM('POS_CASH_SALE') NOT NULL,
 source_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 posted_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_accounting_source(source_type,source_id),
 CONSTRAINT fk_accounting_journal_branch FOREIGN KEY(branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS accounting_journal_lines (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 journal_id BIGINT UNSIGNED NOT NULL,
 account_code VARCHAR(32) NOT NULL,
 debit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
 credit DECIMAL(18,2) NOT NULL DEFAULT 0.00,
 description VARCHAR(180) NOT NULL,
 CONSTRAINT fk_accounting_journal_line FOREIGN KEY(journal_id) REFERENCES accounting_journals(id),
 CONSTRAINT chk_accounting_side CHECK(debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Releasing a Dine In table requires COMPLETED to be excluded from active_table_id.
ALTER TABLE pos_drafts MODIFY COLUMN status ENUM('DRAFT','HELD','DISCARDED','COMPLETED') NOT NULL DEFAULT 'DRAFT';
ALTER TABLE pos_draft_audit_logs MODIFY COLUMN action_type ENUM('CREATE','ADD_LINE','CHANGE_QUANTITY','REMOVE_LINE','HOLD','RESUME','DISCARD','ASSIGN_TABLE','COMPLETE') NOT NULL;
INSERT IGNORE INTO permissions(code,description) VALUES ('pos.checkout.cash','Finalize a verified cash sale with inventory and journal posting');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'pos.checkout.cash' FROM roles r WHERE r.code IN ('OWNER','ADMIN','MANAGER','SUPERVISOR','CASHIER');
