-- TPOS V2 Clean Rebuild: SUPPLIERS module, isolated per tenant.
-- Non-destructive, idempotent installation for new and existing tenants.
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(40) NULL,
  supplier_name VARCHAR(220) NOT NULL,
  contact_name VARCHAR(120) NULL,
  phone_no VARCHAR(40) NULL,
  email VARCHAR(254) NULL,
  address TEXT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  active_name VARCHAR(220) GENERATED ALWAYS AS (CASE WHEN is_deleted = 0 THEN LOWER(TRIM(supplier_name)) ELSE NULL END) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_supplier_code (supplier_code),
  UNIQUE KEY uq_supplier_active_name (active_name),
  INDEX ix_supplier_status (status,is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS supplier_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  supplier_id BIGINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action_type ENUM('SUPPLIER_CREATE','SUPPLIER_UPDATE','SUPPLIER_ACTIVATE','SUPPLIER_DEACTIVATE','SUPPLIER_ARCHIVE','SUPPLIER_IMPORT') NOT NULL,
  previous_data JSON NULL,
  next_data JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_supplier_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  INDEX ix_supplier_audit_time (created_at),
  INDEX ix_supplier_audit_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('suppliers.view','View supplier master records'),
 ('suppliers.create','Create suppliers'),
 ('suppliers.update','Edit supplier details and status'),
 ('suppliers.delete','Archive suppliers without removing history'),
 ('suppliers.import','Import suppliers from CSV'),
 ('suppliers.export','Export supplier CSV and PDF'),
 ('suppliers.audit','View supplier activity history');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p
 WHERE r.code IN ('OWNER','ADMIN') AND p.code LIKE 'suppliers.%';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p
 WHERE r.code='MANAGER' AND p.code IN ('suppliers.view','suppliers.create','suppliers.update','suppliers.import','suppliers.export','suppliers.audit');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p
 WHERE r.code IN ('ACCOUNTANT','SUPERVISOR') AND p.code IN ('suppliers.view','suppliers.export');
