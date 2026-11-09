-- C4.2B explicit verified mappings; never backfill historical POS sales.
CREATE TABLE einvoice_product_mapping_c42b (
 product_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 classification_code VARCHAR(3) NOT NULL,
 unit_code VARCHAR(5) NOT NULL,
 tax_type_code VARCHAR(2) NOT NULL,
 product_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 1,
 confirmed_by BIGINT UNSIGNED NOT NULL,
 confirmed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT fk_einv_c42b_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_einv_c42b_actor FOREIGN KEY(confirmed_by) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TABLE einvoice_product_mapping_audit_c42b (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 product_id BIGINT UNSIGNED NOT NULL,
 actor_user_id BIGINT UNSIGNED NOT NULL,
 old_mapping JSON NULL,
 new_mapping JSON NOT NULL,
 recorded_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 KEY idx_einv_c42b_product_audit(product_id,id),
 CONSTRAINT fk_einv_c42b_audit_product FOREIGN KEY(product_id) REFERENCES products(id),
 CONSTRAINT fk_einv_c42b_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB;
CREATE TRIGGER einv_c42b_audit_no_update BEFORE UPDATE ON einvoice_product_mapping_audit_c42b FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_MAPPING_AUDIT_IMMUTABLE';
CREATE TRIGGER einv_c42b_audit_no_delete BEFORE DELETE ON einvoice_product_mapping_audit_c42b FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_MAPPING_AUDIT_IMMUTABLE';
CREATE TABLE einvoice_line_mapping_evidence_c42b (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 evidence_json JSON NOT NULL,
 evidence_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 captured_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_einv_c42b_sale(sale_id),
 CONSTRAINT fk_einv_c42b_sale FOREIGN KEY(sale_id) REFERENCES pos_sales(id),
 CONSTRAINT fk_einv_c42b_branch FOREIGN KEY(branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TRIGGER einv_c42b_sale_no_update BEFORE UPDATE ON einvoice_line_mapping_evidence_c42b FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_MAPPING_EVIDENCE_IMMUTABLE';
CREATE TRIGGER einv_c42b_sale_no_delete BEFORE DELETE ON einvoice_line_mapping_evidence_c42b FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_MAPPING_EVIDENCE_IMMUTABLE';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('einvoice_verified_mapping_c42b_049');
