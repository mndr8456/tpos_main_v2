-- Discount R1.3 role policy. Additive, repeatable and isolated to discounts.*.
-- OWNER / ADMIN: full Discount management and calculation preview.
-- MANAGER / ACCOUNTANT / SUPERVISOR: view-only Discount list/details.
-- CASHIER and all non-Discount role permissions are intentionally untouched.
INSERT IGNORE INTO permissions (code, description)
VALUES ('discounts.calculate', 'Preview discount calculation without posting transactions');

-- Revoke only Discount permissions from the three view-only roles.
DELETE rp FROM role_permissions AS rp
JOIN roles AS r ON r.id = rp.role_id
WHERE r.code IN ('MANAGER', 'ACCOUNTANT', 'SUPERVISOR')
  AND rp.permission_code LIKE 'discounts.%'
  AND rp.permission_code <> 'discounts.view';

-- Ensure those roles can still view Discount master records.
INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles AS r
JOIN permissions AS p ON p.code = 'discounts.view'
WHERE r.code IN ('MANAGER', 'ACCOUNTANT', 'SUPERVISOR');

-- OWNER/ADMIN explicitly retain every Discount permission, including preview.
INSERT IGNORE INTO role_permissions (role_id, permission_code)
SELECT r.id, p.code FROM roles AS r
JOIN permissions AS p ON p.code LIKE 'discounts.%'
WHERE r.code IN ('OWNER', 'ADMIN');
