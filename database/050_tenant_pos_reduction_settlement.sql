-- POS Reduction Settlement R1: never backfill, never infer redemption from a quote.
-- Requires 049 CURRENT. Execute for new tenants only via provisioning or existing using installer.
CREATE TABLE pos_sale_reductions (
 sale_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 discount_id BIGINT UNSIGNED NULL,
 voucher_id BIGINT UNSIGNED NULL,
 voucher_reservation_id BIGINT UNSIGNED NULL,
 discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
 voucher_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
 created_by BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_psr_sale FOREIGN KEY(sale_id) REFERENCES pos_sales(id),
 CONSTRAINT fk_psr_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_psr_discount FOREIGN KEY(discount_id) REFERENCES discounts(id),
 CONSTRAINT fk_psr_voucher FOREIGN KEY(voucher_id) REFERENCES vouchers(id),
 CONSTRAINT fk_psr_reservation FOREIGN KEY(voucher_reservation_id) REFERENCES voucher_reservations(id),
 CONSTRAINT fk_psr_user FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT chk_psr_amount CHECK(discount_amount >= 0 AND voucher_amount >= 0 AND NOT (discount_amount > 0 AND voucher_amount > 0)),
 CONSTRAINT chk_psr_types CHECK((discount_id IS NOT NULL AND discount_amount > 0 AND voucher_id IS NULL AND voucher_reservation_id IS NULL AND voucher_amount = 0) OR (voucher_id IS NOT NULL AND voucher_reservation_id IS NOT NULL AND voucher_amount > 0 AND discount_id IS NULL AND discount_amount = 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE pos_payment_attempt_reductions (
 attempt_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 discount_id BIGINT UNSIGNED NULL,
 voucher_id BIGINT UNSIGNED NULL,
 voucher_reservation_id BIGINT UNSIGNED NULL,
 discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
 voucher_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
 status ENUM('RESERVED','REDEEMED','RELEASED') NOT NULL DEFAULT 'RESERVED',
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_ppar_attempt FOREIGN KEY(attempt_id) REFERENCES pos_payment_attempts(id),
 CONSTRAINT fk_ppar_discount FOREIGN KEY(discount_id) REFERENCES discounts(id),
 CONSTRAINT fk_ppar_voucher FOREIGN KEY(voucher_id) REFERENCES vouchers(id),
 CONSTRAINT fk_ppar_res FOREIGN KEY(voucher_reservation_id) REFERENCES voucher_reservations(id),
 CONSTRAINT chk_ppar_amount CHECK(discount_amount >= 0 AND voucher_amount >= 0 AND NOT(discount_amount > 0 AND voucher_amount > 0)),
 CONSTRAINT chk_ppar_type CHECK((discount_id IS NOT NULL AND voucher_id IS NULL AND voucher_reservation_id IS NULL AND discount_amount>0 AND voucher_amount=0) OR (voucher_id IS NOT NULL AND voucher_reservation_id IS NOT NULL AND discount_id IS NULL AND voucher_amount>0 AND discount_amount=0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TRIGGER ppar_no_delete BEFORE DELETE ON pos_payment_attempt_reductions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='POS_PAYMENT_REDUCTION_IMMUTABLE';
CREATE TRIGGER psr_no_update BEFORE UPDATE ON pos_sale_reductions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='POS_SALE_REDUCTION_IMMUTABLE';
CREATE TRIGGER psr_no_delete BEFORE DELETE ON pos_sale_reductions FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='POS_SALE_REDUCTION_IMMUTABLE';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('pos_reduction_settlement_050');
