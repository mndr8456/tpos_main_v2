-- TPOS V2 Restaurant Tables R1. Additive, tenant-only, V1 field parity.
-- This migration is run ONCE by setup-restaurant-tables.js after inspection.
-- Table occupancy is DERIVED from active POS drafts, never guessed from a payment.
CREATE TABLE IF NOT EXISTS restaurant_tables (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 branch_id BIGINT UNSIGNED NOT NULL,
 table_number VARCHAR(50) NOT NULL,
 table_name VARCHAR(100) NULL,
 table_area VARCHAR(100) NULL,
 seating_capacity INT UNSIGNED NOT NULL DEFAULT 4,
 table_status ENUM('AVAILABLE','RESERVED','CLEANING') NOT NULL DEFAULT 'AVAILABLE',
 status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
 sort_order INT NOT NULL DEFAULT 0,
 is_deleted TINYINT(1) NOT NULL DEFAULT 0,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_restaurant_table_branch_number(branch_id,table_number),
 KEY ix_restaurant_table_branch_area(branch_id,table_area,sort_order),
 CONSTRAINT fk_restaurant_table_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT chk_restaurant_table_capacity CHECK(seating_capacity BETWEEN 1 AND 100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS restaurant_table_audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 table_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 action_type ENUM('CREATE','UPDATE','STATUS','ARCHIVE','IMPORT','ASSIGN','RELEASE') NOT NULL,
 details JSON NOT NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_restaurant_table_audit(table_id,id),
 CONSTRAINT fk_restaurant_table_audit_table FOREIGN KEY(table_id) REFERENCES restaurant_tables(id),
 CONSTRAINT fk_restaurant_table_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- A single live DINE_IN draft per table enforced by MySQL, even under concurrency.
-- Discarding a draft releases occupancy automatically; HELD remains assigned.
ALTER TABLE pos_drafts
 ADD COLUMN table_id BIGINT UNSIGNED NULL,
 ADD COLUMN active_table_id BIGINT UNSIGNED GENERATED ALWAYS AS
  (CASE WHEN order_scope='DINE_IN' AND status IN ('DRAFT','HELD') THEN table_id ELSE NULL END) STORED,
 ADD UNIQUE KEY uq_pos_draft_live_table(active_table_id),
 ADD KEY ix_pos_draft_table(table_id),
 ADD CONSTRAINT fk_pos_draft_table FOREIGN KEY(table_id) REFERENCES restaurant_tables(id),
 ADD CONSTRAINT chk_pos_dine_in_table CHECK(order_scope<>'DINE_IN' OR table_id IS NOT NULL);
ALTER TABLE pos_draft_audit_logs MODIFY COLUMN action_type ENUM('CREATE','ADD_LINE','CHANGE_QUANTITY','REMOVE_LINE','HOLD','RESUME','DISCARD','ASSIGN_TABLE') NOT NULL;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('restaurant_tables.view','View restaurant tables in authorized branches'),
 ('restaurant_tables.create','Create restaurant table master records'),
 ('restaurant_tables.update','Edit, reserve or clean restaurant tables'),
 ('restaurant_tables.delete','Soft archive unused restaurant tables'),
 ('restaurant_tables.import','Preview and import restaurant table CSV'),
 ('restaurant_tables.export','Export restaurant table CSV'),
 ('restaurant_tables.audit','Read restaurant table activity history');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'restaurant_tables.%'
 WHERE r.code IN ('OWNER','ADMIN','MANAGER');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('restaurant_tables.view','restaurant_tables.export','restaurant_tables.audit')
 WHERE r.code='ACCOUNTANT';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='restaurant_tables.view'
 WHERE r.code IN ('SUPERVISOR','CASHIER','HR');
