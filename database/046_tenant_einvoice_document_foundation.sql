-- EINV-R1.3 Phase B: tenant-local document foundation only. NO LHDN submission.
-- Requires migration 045 and POS receipt number migration 037.
CREATE TABLE IF NOT EXISTS einvoice_documents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 request_id BIGINT UNSIGNED NOT NULL,
 environment ENUM('SANDBOX','PRODUCTION') NOT NULL,
 document_type ENUM('INVOICE') NOT NULL DEFAULT 'INVOICE',
 document_version VARCHAR(10) NOT NULL DEFAULT '1.1',
 status ENUM('PENDING','READY','SUBMITTING','SUBMITTED','PROCESSING','VALID','INVALID','REJECTED','SUBMISSION_UNKNOWN','FAILED') NOT NULL DEFAULT 'PENDING',
 document_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 document_cipher MEDIUMTEXT NULL,
 submission_uid VARCHAR(120) NULL,
 lhdn_uuid VARCHAR(120) NULL,
 lhdn_long_id VARCHAR(200) NULL,
 last_error_code VARCHAR(100) NULL,
 submitted_at DATETIME(6) NULL,
 validated_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_einvoice_document_sale_type_env (sale_id,document_type,environment),
 UNIQUE KEY uq_einvoice_document_request (request_id),
 KEY ix_einvoice_document_status (environment,status,created_at),
 KEY ix_einvoice_document_submission (submission_uid),
 CONSTRAINT fk_einvoice_document_sale FOREIGN KEY(sale_id) REFERENCES pos_sales(id),
 CONSTRAINT fk_einvoice_document_request FOREIGN KEY(request_id) REFERENCES einvoice_customer_requests(id),
 CONSTRAINT chk_einvoice_document_hash CHECK (document_hash IS NULL OR CHAR_LENGTH(document_hash)=64),
 CONSTRAINT chk_einvoice_document_version CHECK (document_version='1.1')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS einvoice_submission_attempts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 document_id BIGINT UNSIGNED NOT NULL,
 attempt_number INT UNSIGNED NOT NULL,
 result ENUM('STARTED','ACCEPTED','REJECTED','UNKNOWN','FAILED') NOT NULL DEFAULT 'STARTED',
 http_status SMALLINT UNSIGNED NULL,
 error_code VARCHAR(100) NULL,
 submission_uid VARCHAR(120) NULL,
 started_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 finished_at DATETIME(6) NULL,
 UNIQUE KEY uq_einvoice_attempt_sequence (document_id,attempt_number),
 CONSTRAINT fk_einvoice_attempt_document FOREIGN KEY(document_id) REFERENCES einvoice_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS einvoice_document_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 document_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NULL,
 event_code VARCHAR(60) NOT NULL,
 old_status VARCHAR(32) NULL,
 new_status VARCHAR(32) NULL,
 details_code VARCHAR(100) NULL,
 occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_einvoice_document_audit (document_id,id),
 CONSTRAINT fk_einvoice_audit_document FOREIGN KEY(document_id) REFERENCES einvoice_documents(id),
 CONSTRAINT fk_einvoice_audit_user FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO permissions(code,description) VALUES
 ('einvoice_documents.view','View MyInvois document preparation status'),
 ('einvoice_documents.prepare','Prepare MyInvois documents once implemented'),
 ('einvoice_documents.submit','Submit documents to MyInvois once implemented'),
 ('einvoice_documents.audit','View e-Invoice document activity');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code LIKE 'einvoice_documents.%' WHERE r.code IN ('OWNER','ADMIN');
INSERT IGNORE INTO role_permissions(role_id,permission_code)
 SELECT r.id,p.code FROM roles r JOIN permissions p ON p.code='einvoice_documents.view' WHERE r.code='ACCOUNTANT';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('einvoice_document_foundation_r13_046');
