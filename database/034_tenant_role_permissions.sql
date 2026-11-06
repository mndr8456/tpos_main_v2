-- TPOS V2 Role Permission R1 (034), one-time additive deployment.
-- Historical grants are copied to granular CRUD only once. Never re-run for reset.
CREATE TABLE IF NOT EXISTS tpos_feature_setup_history (feature_code VARCHAR(80) NOT NULL PRIMARY KEY,applied_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS role_permission_revisions (role_id SMALLINT UNSIGNED NOT NULL PRIMARY KEY,revision BIGINT UNSIGNED NOT NULL DEFAULT 0,updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),CONSTRAINT fk_rpr_role FOREIGN KEY(role_id) REFERENCES roles(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS role_permission_change_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_user_id BIGINT UNSIGNED NOT NULL, role_id SMALLINT UNSIGNED NOT NULL,
 permission_code VARCHAR(80) NOT NULL, prior_allowed BOOLEAN NOT NULL, new_allowed BOOLEAN NOT NULL,
 change_reason VARCHAR(500) NOT NULL, revision BIGINT UNSIGNED NOT NULL,
 recorded_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX ix_rpca_role_time(role_id,recorded_at),INDEX ix_rpca_actor_time(actor_user_id,recorded_at),
 CONSTRAINT fk_rpca_actor FOREIGN KEY(actor_user_id) REFERENCES users(id),
 CONSTRAINT fk_rpca_role FOREIGN KEY(role_id) REFERENCES roles(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
START TRANSACTION;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('users.create','Create Users'),
 ('users.update','Update Users'),
 ('vouchers.create','Create Vouchers'),
 ('vouchers.update','Update Vouchers'),
 ('vouchers.delete','Delete Vouchers'),
 ('pos.create','Create POS Terminal'),
 ('pos.update','Update POS Terminal'),
 ('payment_methods.update','Update Payment Methods'),
 ('sst_settings.update','Update GST / SST Settings'),
 ('service_charge.update','Update Service Charge Settings'),
 ('staff_profiles.create','Create Staff Profiles'),
 ('staff_profiles.update','Update Staff Profiles'),
 ('attendances.create','Create Attendances'),
 ('attendances.update','Update Attendances'),
 ('leave_types.create','Create Leave Types'),
 ('leave_types.update','Update Leave Types'),
 ('leave_balances.create','Create Leave Balances'),
 ('leave_balances.update','Update Leave Balances'),
 ('leave_requests.create','Create Leave Requests'),
 ('leave_requests.update','Update Leave Requests'),
 ('role_permissions.view','View Role Permission matrix'),
 ('role_permissions.manage','Modify Role Permission grants'),
 ('role_permissions.audit','View Role Permission audit');
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'users.create' FROM role_permissions rp WHERE rp.permission_code='users.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'users.update' FROM role_permissions rp WHERE rp.permission_code='users.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'vouchers.create' FROM role_permissions rp WHERE rp.permission_code='vouchers.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'vouchers.update' FROM role_permissions rp WHERE rp.permission_code='vouchers.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'vouchers.delete' FROM role_permissions rp WHERE rp.permission_code='vouchers.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'pos.create' FROM role_permissions rp WHERE rp.permission_code='pos.cart.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'pos.update' FROM role_permissions rp WHERE rp.permission_code='pos.cart.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'payment_methods.update' FROM role_permissions rp WHERE rp.permission_code='payment_methods.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'sst_settings.update' FROM role_permissions rp WHERE rp.permission_code='sst_settings.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'service_charge.update' FROM role_permissions rp WHERE rp.permission_code='service_charge.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'staff_profiles.create' FROM role_permissions rp WHERE rp.permission_code='staff_profiles.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'staff_profiles.update' FROM role_permissions rp WHERE rp.permission_code='staff_profiles.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'attendances.create' FROM role_permissions rp WHERE rp.permission_code='attendances.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'attendances.update' FROM role_permissions rp WHERE rp.permission_code='attendances.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'leave_types.create' FROM role_permissions rp WHERE rp.permission_code='leave_types.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'leave_types.update' FROM role_permissions rp WHERE rp.permission_code='leave_types.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'leave_balances.create' FROM role_permissions rp WHERE rp.permission_code='leave_balances.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'leave_balances.update' FROM role_permissions rp WHERE rp.permission_code='leave_balances.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'leave_requests.create' FROM role_permissions rp WHERE rp.permission_code='leave_requests.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT rp.role_id,'leave_requests.update' FROM role_permissions rp WHERE rp.permission_code='leave_requests.manage';
INSERT IGNORE INTO role_permissions(role_id,permission_code) SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code IN ('role_permissions.view','role_permissions.manage','role_permissions.audit') WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO role_permission_revisions(role_id) SELECT id FROM roles;
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('role_permissions_r1_034');
COMMIT;
