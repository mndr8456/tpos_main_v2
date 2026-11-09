-- C4.2A immutable companion evidence. No historical backfill or POS financial DDL.
CREATE TABLE IF NOT EXISTS einvoice_line_tax_evidence_c42 (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 evidence_json JSON NOT NULL,
 evidence_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 captured_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT uq_einvoice_line_tax_sale UNIQUE (sale_id),
 KEY idx_einvoice_line_tax_branch (branch_id),
 CONSTRAINT fk_einvoice_line_tax_sale FOREIGN KEY (sale_id) REFERENCES pos_sales(id),
 CONSTRAINT fk_einvoice_line_tax_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TRIGGER einvoice_line_tax_no_update BEFORE UPDATE ON einvoice_line_tax_evidence_c42 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_LINE_TAX_EVIDENCE_IMMUTABLE';
CREATE TRIGGER einvoice_line_tax_no_delete BEFORE DELETE ON einvoice_line_tax_evidence_c42 FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_LINE_TAX_EVIDENCE_IMMUTABLE';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('einvoice_line_tax_evidence_c42_048');
