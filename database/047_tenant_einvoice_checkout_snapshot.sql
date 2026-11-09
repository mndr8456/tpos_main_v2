-- EINV R1.3 C4: additive, tenant-local append-only sale snapshot. No historical backfill.
CREATE TABLE IF NOT EXISTS einvoice_checkout_snapshots (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 sale_id BIGINT UNSIGNED NOT NULL,
 branch_id BIGINT UNSIGNED NOT NULL,
 snapshot_version VARCHAR(16) NOT NULL DEFAULT 'C4.1',
 snapshot_status ENUM('INCOMPLETE') NOT NULL DEFAULT 'INCOMPLETE',
 snapshot_json JSON NOT NULL,
 snapshot_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 captured_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 CONSTRAINT uq_einvoice_checkout_sale UNIQUE (sale_id),
 KEY idx_einvoice_checkout_branch (branch_id),
 CONSTRAINT fk_einvoice_checkout_sale FOREIGN KEY (sale_id) REFERENCES pos_sales(id),
 CONSTRAINT fk_einvoice_checkout_branch FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;
CREATE TRIGGER einvoice_checkout_no_update BEFORE UPDATE ON einvoice_checkout_snapshots FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_CHECKOUT_SNAPSHOT_IMMUTABLE';
CREATE TRIGGER einvoice_checkout_no_delete BEFORE DELETE ON einvoice_checkout_snapshots FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='EINV_CHECKOUT_SNAPSHOT_IMMUTABLE';
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES('einvoice_checkout_snapshot_r13_047');
