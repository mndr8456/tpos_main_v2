-- EINV-R1.2: customer requests only; never submits a MyInvois document.
CREATE TABLE IF NOT EXISTS einvoice_customer_requests (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 request_token_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 request_token_cipher TEXT NOT NULL,
 status ENUM('ISSUED','REQUESTED') NOT NULL DEFAULT 'ISSUED',
 buyer_cipher MEDIUMTEXT NULL,
 sdk_version VARCHAR(10) NOT NULL DEFAULT '1.1',
 environment ENUM('SANDBOX','PRODUCTION') NOT NULL,
 expires_at DATETIME(6) NOT NULL,
 submitted_at DATETIME(6) NULL,
 created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_einvoice_request_sale (sale_id),
 UNIQUE KEY uq_einvoice_request_hash (request_token_sha256),
 KEY ix_einvoice_request_status (status,created_at),
 CONSTRAINT fk_einvoice_request_sale FOREIGN KEY(sale_id) REFERENCES pos_sales(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS einvoice_customer_request_audit (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 request_id BIGINT UNSIGNED NOT NULL,
 event ENUM('ISSUED','REQUESTED') NOT NULL,
 occurred_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY ix_einvoice_request_audit (request_id,id),
 CONSTRAINT fk_einvoice_request_audit FOREIGN KEY(request_id) REFERENCES einvoice_customer_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('einvoice_customer_request_r12_045');
