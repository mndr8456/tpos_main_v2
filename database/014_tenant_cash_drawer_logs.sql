-- TPOS Main V2 - Log Cash Drawer R1. Tenant-only additive schema.
-- MANUAL_OPEN is an observation recorded by a user. It does NOT trigger drawer hardware.
-- This module NEVER changes cash_shifts, cash_shift_movements, sales, or accounting balances.
CREATE TABLE IF NOT EXISTS cash_drawer_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 shift_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 event_type ENUM('MANUAL_OPEN') NOT NULL,
 reason VARCHAR(300) NOT NULL,
 request_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_cash_drawer_request_key(request_key),
 KEY ix_cash_drawer_shift_time(shift_id,id),
 KEY ix_cash_drawer_branch_time(branch_id,id),
 KEY ix_cash_drawer_actor_time(actor_user_id,id),
 CONSTRAINT fk_cash_drawer_event_shift FOREIGN KEY(shift_id) REFERENCES cash_shifts(id),
 CONSTRAINT fk_cash_drawer_event_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_cash_drawer_event_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
 CONSTRAINT chk_cash_drawer_reason CHECK (CHAR_LENGTH(TRIM(reason))>=8)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Append-only audit record committed in the same transaction as the observed event.
CREATE TABLE IF NOT EXISTS cash_drawer_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('RECORD_MANUAL_OPEN') NOT NULL,
 details JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_cash_drawer_audit_event(event_id,id),
 CONSTRAINT fk_cash_drawer_audit_event FOREIGN KEY(event_id) REFERENCES cash_drawer_events(id),
 CONSTRAINT fk_cash_drawer_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO permissions(code,description) VALUES
 ('cash_drawer.view','View recorded drawer events for permitted cashier shifts'),
 ('cash_drawer.view.all','View all drawer events for the tenant'),
 ('cash_drawer.record.own','Record a manually observed drawer opening in own open shift'),
 ('cash_drawer.record.any','Record a manually observed drawer opening in an assigned branch open shift'),
 ('cash_drawer.audit','View drawer event audit with the same cashier scope'),
 ('cash_drawer.export','Export visible drawer events as CSV');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'cash_drawer.%'
 WHERE r.code IN ('OWNER','ADMIN','MANAGER');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN
 ('cash_drawer.view','cash_drawer.view.all','cash_drawer.audit','cash_drawer.export') WHERE r.code='ACCOUNTANT';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN
 ('cash_drawer.view','cash_drawer.record.own') WHERE r.code IN ('CASHIER','SUPERVISOR');
