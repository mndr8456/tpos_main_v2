-- POS Receipt R2.1.6: persist an immutable new-format number per new sale.
-- Apply only after migration 036 for new tenants. Existing tenants use
-- scripts/setup-pos-receipt-number.js (read-only preflight by default).
-- Existing issued receipts stay NULL and retain their original POS-XXXXXXXXX
-- appearance on reprint. Existing issued numbers are intentionally left untouched.
ALTER TABLE pos_sales
 ADD COLUMN receipt_number VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER id,
 ADD UNIQUE KEY uq_pos_sales_receipt_number(receipt_number);
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('pos_receipt_number_r216_037');
