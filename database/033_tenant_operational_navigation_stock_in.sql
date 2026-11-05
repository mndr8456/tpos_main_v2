-- TPOS V2 R1 operational-role defaults, applied ONCE per tenant.
-- Role Permissions UI may freely grant/revoke later; installer will not reset the choices.
-- No changes to V1, sales, journal, inventory balances or historical movements.
CREATE TABLE IF NOT EXISTS tpos_feature_setup_history (
 feature_code VARCHAR(80) NOT NULL PRIMARY KEY,
 applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
START TRANSACTION;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('inventory.receive','Record stock receipts in assigned branch with actual unit cost'),
 ('inventory.valuation.view','View branch inventory value and average cost');
-- Remove legacy default catalog grants from operational roles only once.
-- Existing grants for other roles and modules are untouched.
DELETE rp FROM role_permissions rp JOIN roles r ON r.id=rp.role_id
 WHERE r.code IN ('CASHIER','WAITER','KITCHEN','STAFF')
 AND rp.permission_code IN ('categories.view','products.view');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'restaurant_tables.view' FROM roles r WHERE r.code='WAITER';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'inventory.view' FROM roles r WHERE r.code='STAFF';
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'inventory.receive' FROM roles r WHERE r.code IN ('OWNER','ADMIN','STAFF');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'inventory.valuation.view' FROM roles r WHERE r.code IN ('OWNER','ADMIN','MANAGER','ACCOUNTANT');
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('operational_nav_stock_in_033');
COMMIT;
