-- TPOS V2 Product R2. Apply to NEW Product tenants only; this is the full 007 module schema.
-- Inventory quantities, manufacturing and moving weighted average valuation are NOT performed here.
CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NULL,
  barcode VARCHAR(100) NULL,
  product_name VARCHAR(220) NOT NULL,
  product_description VARCHAR(2000) NULL,
  product_image_url VARCHAR(500) NULL,
  product_type ENUM('GOODS','SERVICE') NOT NULL DEFAULT 'GOODS',
  product_structure ENUM('SINGLE','SET','BUNDLE') NOT NULL DEFAULT 'SINGLE',
  base_unit_code ENUM('PCS','EA','KG','G') NOT NULL DEFAULT 'PCS',
  category_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NULL,
  cost_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  min_stock_qty DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  track_stock BOOLEAN NOT NULL DEFAULT TRUE,
  is_weighable BOOLEAN NOT NULL DEFAULT FALSE,
  weighing_unit ENUM('KG','G') NOT NULL DEFAULT 'KG',
  requires_preparation BOOLEAN NOT NULL DEFAULT FALSE,
  preparation_station_id SMALLINT UNSIGNED NULL,
  lhdn_classification_code VARCHAR(16) NOT NULL DEFAULT '022',
  lhdn_unit_code VARCHAR(16) NOT NULL DEFAULT 'EA',
  lhdn_tax_type_code VARCHAR(16) NOT NULL DEFAULT '06',
  lhdn_tax_rate DECIMAL(6,3) NOT NULL DEFAULT 0.00,
  lhdn_tax_exemption_reason VARCHAR(500) NULL,
  lhdn_product_tariff_code VARCHAR(40) NULL,
  lhdn_country_of_origin_code VARCHAR(3) NULL,
  is_tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_product_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_product_station FOREIGN KEY (preparation_station_id) REFERENCES preparation_stations(id),
  UNIQUE KEY uq_product_sku(sku),
  UNIQUE KEY uq_product_barcode(barcode),
  INDEX ix_product_name(product_name),
  INDEX ix_product_category_status(category_id,status,is_deleted),
  CONSTRAINT chk_product_cost CHECK(cost_price>=0),
  CONSTRAINT chk_product_price CHECK(selling_price>=0),
  CONSTRAINT chk_product_minimum CHECK(min_stock_qty>=0),
  CONSTRAINT chk_product_tax CHECK(lhdn_tax_rate>=0 AND lhdn_tax_rate<=100),
  CONSTRAINT chk_product_structure CHECK(product_structure='SINGLE' OR (product_type='GOODS' AND track_stock=0 AND is_weighable=0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS product_packaging_units (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  unit_code ENUM('PACK','BOX','CARTON') NOT NULL,
  units_per_base DECIMAL(18,6) NOT NULL,
  barcode VARCHAR(100) NULL,
  selling_price DECIMAL(18,4) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_product_package FOREIGN KEY(product_id) REFERENCES products(id),
  UNIQUE KEY uq_product_pack_unit(product_id,unit_code),
  UNIQUE KEY uq_product_pack_barcode(barcode),
  CONSTRAINT chk_pack_factor CHECK(units_per_base>1),
  CONSTRAINT chk_pack_price CHECK(selling_price>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS product_components (
  parent_product_id BIGINT UNSIGNED NOT NULL,
  component_product_id BIGINT UNSIGNED NOT NULL,
  quantity_per_parent DECIMAL(18,6) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY(parent_product_id,component_product_id),
  CONSTRAINT fk_product_component_parent FOREIGN KEY(parent_product_id) REFERENCES products(id),
  CONSTRAINT fk_product_component_child FOREIGN KEY(component_product_id) REFERENCES products(id),
  CONSTRAINT chk_component_quantity CHECK(quantity_per_parent>0),
  CONSTRAINT chk_component_self CHECK(parent_product_id<>component_product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- This registry enforces a single barcode namespace across base products and saleable package units.
CREATE TABLE IF NOT EXISTS product_barcodes (
  barcode VARCHAR(100) NOT NULL PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  package_unit_id BIGINT UNSIGNED NULL,
  source_type ENUM('BASE','PACKAGING') NOT NULL,
  CONSTRAINT fk_product_barcode_product FOREIGN KEY(product_id) REFERENCES products(id),
  CONSTRAINT fk_product_barcode_unit FOREIGN KEY(package_unit_id) REFERENCES product_packaging_units(id),
  INDEX ix_product_barcode_product(product_id),
  UNIQUE KEY uq_product_barcode_unit(package_unit_id),
  CONSTRAINT chk_barcode_source CHECK((source_type='BASE' AND package_unit_id IS NULL) OR (source_type='PACKAGING' AND package_unit_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS product_branch_prices (
  product_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  selling_price DECIMAL(18,4) NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY(product_id,branch_id),
  CONSTRAINT fk_product_branch_price_product FOREIGN KEY(product_id) REFERENCES products(id),
  CONSTRAINT fk_product_branch_price_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
  CONSTRAINT fk_product_branch_price_actor FOREIGN KEY(updated_by) REFERENCES users(id),
  CONSTRAINT chk_branch_price CHECK(selling_price>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS product_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action_type ENUM('PRODUCT_CREATE','PRODUCT_UPDATE','PRODUCT_DEACTIVATE','PRODUCT_ACTIVATE','PRODUCT_ARCHIVE','PRODUCT_IMPORT','PRODUCT_BRANCH_PRICE') NOT NULL,
  previous_data JSON NULL,
  next_data JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_product_audit_product FOREIGN KEY(product_id) REFERENCES products(id),
  CONSTRAINT fk_product_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
  INDEX ix_product_audit_time(created_at),
  INDEX ix_product_audit_product(product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('products.view','View product master records'),
 ('products.cost.view','View product reference purchase costs'),
 ('products.create','Create products'),
 ('products.update','Edit products and change status'),
 ('products.delete','Archive products with history preserved'),
 ('products.prices.manage','Manage selling prices per branch'),
 ('products.import','Import product master records from CSV'),
 ('products.export','Export product CSV and PDF'),
 ('products.audit','View product activity logs');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code IN ('OWNER','ADMIN') AND p.code LIKE 'products.%';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code='MANAGER' AND p.code IN ('products.view','products.cost.view','products.create','products.update','products.prices.manage','products.import','products.export','products.audit');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code='ACCOUNTANT' AND p.code IN ('products.view','products.cost.view','products.export');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code IN ('SUPERVISOR','CASHIER','WAITER','KITCHEN','STAFF','HR') AND p.code='products.view';
