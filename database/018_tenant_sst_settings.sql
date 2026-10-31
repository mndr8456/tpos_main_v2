-- TPOS V2 SST Settings R1. Tenant-wide authority, separate from LHDN e-Invoice.
-- Safe on existing tenants; settings start OFF, even if registration numbers exist.
CREATE TABLE IF NOT EXISTS sst_tax_settings (
  tax_type ENUM('SALES_TAX','SERVICE_TAX') NOT NULL PRIMARY KEY,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(5,3) NOT NULL DEFAULT 0.000,
  updated_by BIGINT UNSIGNED NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT chk_sst_is_enabled CHECK(is_enabled IN (0,1)),
  CONSTRAINT chk_sst_tax_rate CHECK(tax_rate>=0 AND tax_rate<=100),
  CONSTRAINT fk_sst_updated_by FOREIGN KEY(updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS sst_settings_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tax_type ENUM('SALES_TAX','SERVICE_TAX') NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  previous_data JSON NULL,
  next_data JSON NOT NULL,
  recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  KEY ix_sst_audit_type_time(tax_type,id),
  CONSTRAINT fk_sst_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO sst_tax_settings(tax_type,is_enabled,tax_rate)
 VALUES('SALES_TAX',0,0.000),('SERVICE_TAX',0,0.000);
INSERT IGNORE INTO permissions(code,description) VALUES
 ('sst_settings.view','View tenant SST configuration and registration numbers'),
 ('sst_settings.manage','Owner manage SST registration, rates and activation'),
 ('sst_settings.audit','View tenant SST configuration activity log');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'sst_settings.%' WHERE r.code='OWNER';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='sst_settings.view' WHERE r.code IN ('ADMIN','MANAGER','ACCOUNTANT');
