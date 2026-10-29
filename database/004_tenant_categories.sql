-- TPOS V2 Clean Rebuild: CATEGORY module only (per tenant).
-- Safe to run again: existing categories, stations, and logs remain intact.
CREATE TABLE IF NOT EXISTS preparation_stations (
  id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(160) NOT NULL,
  description VARCHAR(500) NULL,
  default_preparation_station_id SMALLINT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  active_name VARCHAR(160) GENERATED ALWAYS AS (CASE WHEN is_deleted = 0 THEN LOWER(TRIM(category_name)) ELSE NULL END) STORED,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_category_default_station FOREIGN KEY (default_preparation_station_id) REFERENCES preparation_stations(id),
  UNIQUE KEY uq_category_active_name(active_name),
  INDEX ix_categories_status(status,is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS category_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NULL,
  station_id SMALLINT UNSIGNED NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action_type ENUM('CATEGORY_CREATE','CATEGORY_UPDATE','CATEGORY_DEACTIVATE','CATEGORY_ACTIVATE','CATEGORY_DELETE','CATEGORY_IMPORT','STATION_CREATE','STATION_UPDATE','STATION_DEACTIVATE','STATION_ACTIVATE') NOT NULL,
  previous_data JSON NULL,
  next_data JSON NULL,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT fk_category_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  INDEX ix_category_audit_time(created_at),
  INDEX ix_category_audit_category(category_id),
  INDEX ix_category_audit_station(station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO preparation_stations(code,name) VALUES
 ('KITCHEN','Kitchen'),('DRINK','Drink'),('DESSERT','Dessert'),('COUNTER','Counter'),('NONE','None');
INSERT IGNORE INTO permissions(code,description) VALUES
 ('categories.view','View categories and preparation stations'),
 ('categories.create','Create categories'),
 ('categories.update','Edit and change category status'),
 ('categories.delete','Archive categories'),
 ('categories.import','Import categories from CSV'),
 ('categories.export','Export category data and reports'),
 ('categories.audit','View category and station activity'),
 ('categories.stations.manage','Manage preparation stations');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code IN ('OWNER','ADMIN') AND p.code LIKE 'categories.%';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code='MANAGER' AND p.code IN ('categories.view','categories.create','categories.update','categories.import','categories.export','categories.audit');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p WHERE r.code IN ('SUPERVISOR','CASHIER','WAITER','KITCHEN','ACCOUNTANT','STAFF','HR') AND p.code='categories.view';
