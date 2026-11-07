-- KDS R1 (040): tenant-local kitchen tickets. Additive only; no sale, stock, payment or accounting writes.
-- Exactly one KDS ticket per original WAITER order OR direct POS draft.
-- After a WAITER order is claimed, link its existing ticket to the POS draft: never issue a second ticket.
CREATE TABLE IF NOT EXISTS kds_tickets (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 waiter_order_id BIGINT UNSIGNED NULL,
 pos_draft_id BIGINT UNSIGNED NULL,
 source_type ENUM('WAITER','POS') NOT NULL,
 order_scope ENUM('TAKE_AWAY','DINE_IN') NOT NULL,
 table_number VARCHAR(60) NULL,
 order_notes VARCHAR(500) NOT NULL DEFAULT '',
 created_by_user_id BIGINT UNSIGNED NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_kds_waiter_order(waiter_order_id),
 UNIQUE KEY uq_kds_pos_draft(pos_draft_id),
 KEY ix_kds_ticket_branch_time(branch_id,created_at,id),
 CONSTRAINT fk_kds_ticket_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_kds_ticket_waiter FOREIGN KEY(waiter_order_id) REFERENCES waiter_orders(id),
 CONSTRAINT fk_kds_ticket_pos FOREIGN KEY(pos_draft_id) REFERENCES pos_drafts(id),
 CONSTRAINT fk_kds_ticket_actor FOREIGN KEY(created_by_user_id) REFERENCES users(id),
 CONSTRAINT chk_kds_ticket_origin CHECK ((source_type='WAITER' AND waiter_order_id IS NOT NULL) OR (source_type='POS' AND waiter_order_id IS NULL AND pos_draft_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS kds_ticket_lines (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 ticket_id BIGINT UNSIGNED NOT NULL,
 origin_line_id BIGINT UNSIGNED NOT NULL,
 product_id BIGINT UNSIGNED NOT NULL,
 product_name VARCHAR(220) NOT NULL,
 sku VARCHAR(64) NULL,
 quantity DECIMAL(18,3) NOT NULL,
 unit_code VARCHAR(12) NOT NULL,
 line_notes VARCHAR(500) NOT NULL DEFAULT '',
 station_id SMALLINT UNSIGNED NOT NULL,
 station_code VARCHAR(40) NOT NULL,
 station_name VARCHAR(100) NOT NULL,
 status ENUM('PENDING','PREPARING','READY','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 started_at DATETIME(6) NULL,
 ready_at DATETIME(6) NULL,
 completed_at DATETIME(6) NULL,
 cancelled_at DATETIME(6) NULL,
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_kds_origin_line(ticket_id,origin_line_id),
 KEY ix_kds_station_status(station_id,status,ticket_id),
 CONSTRAINT fk_kds_line_ticket FOREIGN KEY(ticket_id) REFERENCES kds_tickets(id),
 CONSTRAINT fk_kds_line_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_kds_line_station FOREIGN KEY(station_id) REFERENCES preparation_stations(id),
 CONSTRAINT chk_kds_line_qty CHECK(quantity>0 AND quantity<=10000),
 CONSTRAINT chk_kds_line_version CHECK(version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS kds_ticket_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 ticket_id BIGINT UNSIGNED NOT NULL,
 line_id BIGINT UNSIGNED NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('DISPATCH','LINK_POS','STATUS','CANCEL') NOT NULL,
 previous_status VARCHAR(20) NULL,
 new_status VARCHAR(20) NULL,
 details JSON NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_kds_audit_ticket(ticket_id,id),
 CONSTRAINT fk_kds_audit_ticket FOREIGN KEY(ticket_id) REFERENCES kds_tickets(id),
 CONSTRAINT fk_kds_audit_line FOREIGN KEY(line_id) REFERENCES kds_ticket_lines(id),
 CONSTRAINT fk_kds_audit_user FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('kds.view','View kitchen ticket board in assigned branch'),
 ('kds.update_status','Advance own branch kitchen item preparation status'),
 ('kds.dispatch','Dispatch an existing POS order to kitchen once'),
 ('kds.print','Print kitchen tickets for assigned branches'),
 ('kds.cancel','Cancel kitchen preparation with mandatory reason'),
 ('kds.audit','View immutable kitchen status changes');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'kds.%' WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('kds.view','kds.update_status','kds.print') WHERE r.code='KITCHEN';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'kds.dispatch' FROM roles r WHERE r.code IN ('CASHIER','MANAGER','SUPERVISOR');
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('kds_r1_040');
