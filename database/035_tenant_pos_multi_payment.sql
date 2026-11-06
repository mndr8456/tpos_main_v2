-- POS Multi-Payment R2.1: a protected payment-attempt ledger and distinct non-cash journals.
-- APPLY ONLY AFTER 016, 023, 024 AND 034 ARE CURRENT. Back up the tenant DB.
-- Card/PIN/OTP/MyKad raw data is never stored here. SARA requires its official acquirer.
CREATE TABLE IF NOT EXISTS pos_payment_attempts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 draft_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 shift_id BIGINT UNSIGNED NOT NULL,
 cashier_user_id BIGINT UNSIGNED NOT NULL,
 draft_version INT UNSIGNED NOT NULL,
 method_code ENUM('DUITNOW_QR','EWALLET','BANK_TRANSFER','DEBIT_CARD','CREDIT_CARD','SARA_MYKASIH') NOT NULL,
 verification_mode ENUM('MANUAL_BANK','MANUAL_TERMINAL','PROVIDER') NOT NULL,
 expected_total DECIMAL(18,2) NOT NULL,
 status ENUM('PENDING','PAID','CANCELLED','FAILED') NOT NULL DEFAULT 'PENDING',
 payment_reference VARCHAR(160) NULL,
 reference_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 verified_by BIGINT UNSIGNED NULL,
 verified_at DATETIME(6) NULL,
 evidence_mime ENUM('image/png','image/jpeg','image/webp') NULL,
 evidence_data MEDIUMBLOB NULL,
 sale_id BIGINT UNSIGNED NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_pos_payment_attempt_request(request_key),
 UNIQUE KEY uq_pos_payment_attempt_reference(branch_id,method_code,reference_hash),
 UNIQUE KEY uq_pos_payment_attempt_sale(sale_id),
 KEY ix_pos_payment_draft(draft_id,id),
 CONSTRAINT fk_pos_attempt_draft FOREIGN KEY(draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT fk_pos_attempt_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_pos_attempt_shift FOREIGN KEY(shift_id) REFERENCES cash_shifts(id),
 CONSTRAINT fk_pos_attempt_cashier FOREIGN KEY(cashier_user_id) REFERENCES users(id),
 CONSTRAINT fk_pos_attempt_verified FOREIGN KEY(verified_by) REFERENCES users(id),
 CONSTRAINT fk_pos_attempt_sale FOREIGN KEY(sale_id) REFERENCES pos_sales(id),
 CONSTRAINT chk_pos_attempt_amount CHECK(expected_total>0),
 CONSTRAINT chk_pos_attempt_paid CHECK((status='PAID' AND verified_by IS NOT NULL AND verified_at IS NOT NULL AND sale_id IS NOT NULL AND reference_hash IS NOT NULL) OR status<>'PAID')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_payment_attempt_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 attempt_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 event_type ENUM('START','MANUAL_VERIFY','CANCEL') NOT NULL,
 details JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_pos_payment_attempt_audit(attempt_id,id),
 CONSTRAINT fk_pos_attempt_audit_attempt FOREIGN KEY(attempt_id) REFERENCES pos_payment_attempts(id),
 CONSTRAINT fk_pos_attempt_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS pos_payment_display_tokens (
 token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
 attempt_id BIGINT UNSIGNED NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_pos_display_attempt(attempt_id),
 CONSTRAINT fk_pos_display_attempt FOREIGN KEY(attempt_id) REFERENCES pos_payment_attempts(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- Original cash constraint must be replaced so noncash has ZERO tender and change.
SET @pos_has_check := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='pos_sales' AND CONSTRAINT_NAME='chk_pos_sale_amounts');
SET @pos_sql := IF(@pos_has_check>0,'ALTER TABLE pos_sales DROP CHECK chk_pos_sale_amounts','SELECT 1');
PREPARE pos_stmt FROM @pos_sql; EXECUTE pos_stmt; DEALLOCATE PREPARE pos_stmt;
ALTER TABLE pos_sales MODIFY COLUMN payment_method ENUM('CASH','DEBIT_CARD','CREDIT_CARD','BANK_TRANSFER','DUITNOW_QR','EWALLET','SARA_MYKASIH') NOT NULL;
ALTER TABLE pos_sales ADD CONSTRAINT chk_pos_sale_amounts CHECK(
 total>=0 AND cost_of_goods>=0 AND (
 (payment_method='CASH' AND cash_received>=total AND cash_change=cash_received-total)
 OR (payment_method<>'CASH' AND cash_received=0 AND cash_change=0)
 ));
ALTER TABLE accounting_journals MODIFY COLUMN source_type ENUM('POS_CASH_SALE','POS_NONCASH_SALE') NOT NULL;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('pos.checkout.manual','Confirm a non-cash sale only after checking merchant receipt, amount and reference');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT role_id,'pos.checkout.manual' FROM role_permissions WHERE permission_code='pos.checkout.cash';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('pos_multi_payment_r21_035');
