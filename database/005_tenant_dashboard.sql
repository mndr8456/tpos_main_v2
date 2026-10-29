-- TPOS V2 Clean Rebuild: Dashboard permission for EACH tenant.
-- Read-only reporting; no legacy Sales, Inventory, or Product schema is created here.
INSERT IGNORE INTO permissions(code,description) VALUES
 ('dashboard.view','View tenant dashboard and business summary');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,'dashboard.view' FROM roles r
 WHERE r.code IN ('OWNER','ADMIN','HR','MANAGER');
