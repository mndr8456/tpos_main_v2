-- TPOS V2 Shift Cash R1. Additive tenant-only schema. No POS sale or GL posting here.
-- Timestamps stored as UTC. A cashier can have only one OPEN shift per tenant.
CREATE TABLE IF NOT EXISTS cash_shifts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 cashier_user_id BIGINT UNSIGNED NOT NULL,
 opened_by BIGINT UNSIGNED NOT NULL,
 opened_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 opening_cash DECIMAL(14,2) NOT NULL,
 status ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
 closed_by BIGINT UNSIGNED NULL,
 closed_at DATETIME(6) NULL,
 counted_cash DECIMAL(14,2) NULL,
 manual_expected_cash DECIMAL(14,2) NULL,
 cash_variance DECIMAL(14,2) NULL,
 closing_notes VARCHAR(1000) NULL,
 -- NULLs allow closed history while UNIQUE enforces one active shift per cashier.
 active_cashier_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN status='OPEN' THEN cashier_user_id ELSE NULL END) STORED,
 UNIQUE KEY uq_cash_shift_active_cashier(active_cashier_id),
 KEY ix_cash_shift_branch_open(branch_id,status,opened_at),
 KEY ix_cash_shift_cashier(cashier_user_id,opened_at),
 CONSTRAINT fk_cash_shift_branch FOREIGN KEY (branch_id) REFERENCES branches(id),
 CONSTRAINT fk_cash_shift_cashier FOREIGN KEY (cashier_user_id) REFERENCES users(id),
 CONSTRAINT fk_cash_shift_opened_by FOREIGN KEY (opened_by) REFERENCES users(id),
 CONSTRAINT fk_cash_shift_closed_by FOREIGN KEY (closed_by) REFERENCES users(id),
 CONSTRAINT chk_shift_opening CHECK(opening_cash>=0),
 CONSTRAINT chk_shift_closed_data CHECK (
   (status='OPEN' AND closed_by IS NULL AND closed_at IS NULL AND counted_cash IS NULL AND manual_expected_cash IS NULL AND cash_variance IS NULL)
   OR (status='CLOSED' AND closed_by IS NOT NULL AND closed_at IS NOT NULL AND counted_cash>=0 AND manual_expected_cash IS NOT NULL AND cash_variance IS NOT NULL)
 )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Manual movements only. POS sales will be integrated separately after terminal implementation.
CREATE TABLE IF NOT EXISTS cash_shift_movements (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 shift_id BIGINT UNSIGNED NOT NULL,
 direction ENUM('CASH_IN','CASH_OUT') NOT NULL,
 amount DECIMAL(14,2) NOT NULL,
 reason VARCHAR(500) NOT NULL,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_cash_shift_movement_request(request_key),
 KEY ix_cash_shift_movement_history(shift_id,id),
 CONSTRAINT fk_cash_shift_movement_shift FOREIGN KEY (shift_id) REFERENCES cash_shifts(id),
 CONSTRAINT fk_cash_shift_movement_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
 CONSTRAINT chk_cash_shift_movement_amount CHECK(amount>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS cash_shift_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 shift_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('OPEN','CASH_IN','CASH_OUT','CLOSE') NOT NULL,
 details JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_cash_shift_audit_log(shift_id,id),
 CONSTRAINT fk_cash_shift_audit_shift FOREIGN KEY (shift_id) REFERENCES cash_shifts(id),
 CONSTRAINT fk_cash_shift_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO permissions(code,description) VALUES
 ('cash_shifts.view','View own cash shift'),
 ('cash_shifts.view.all','View all tenant cash shifts'),
 ('cash_shifts.open','Open own cash shift'),
 ('cash_shifts.close.own','Close own cash shift'),
 ('cash_shifts.close.any','Close a cashier shift with reason and branch access'),
 ('cash_shifts.move.own','Record manual movement in own open shift'),
 ('cash_shifts.move.any','Record manual movement in assigned branch open shift'),
 ('cash_shifts.audit','View cash shift audit (visibility scoped)'),
 ('cash_shifts.export','Export visible cash shifts');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'cash_shifts.%'
 WHERE r.code IN ('OWNER','ADMIN','MANAGER');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('cash_shifts.view','cash_shifts.view.all','cash_shifts.audit','cash_shifts.export')
 WHERE r.code='ACCOUNTANT';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('cash_shifts.view','cash_shifts.open','cash_shifts.close.own','cash_shifts.move.own')
 WHERE r.code IN ('CASHIER','SUPERVISOR');
