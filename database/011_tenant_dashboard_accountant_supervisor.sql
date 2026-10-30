-- TPOS Main V2 Dashboard access R1.1: additive grant for ACCOUNTANT and SUPERVISOR only.
-- The existing dashboard.view permission is retained. This migration does not touch Discount or CASHIER.
INSERT IGNORE INTO permissions (code, description)
VALUES ('dashboard.view', 'View tenant dashboard and business summary');

INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code
FROM roles AS r
JOIN permissions AS p ON p.code = 'dashboard.view'
WHERE r.code IN ('ACCOUNTANT', 'SUPERVISOR');
