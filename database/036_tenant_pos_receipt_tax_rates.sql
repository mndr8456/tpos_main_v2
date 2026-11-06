-- POS Receipt R2.1.5: immutable effective SST/merchant-fee percentage snapshots.
-- Existing tenants: use ONLY the read-only-first installer; do not replay this SQL.
-- Run after 035 on NEW TENANT provisioning. Never backfill historical percentages
-- from today's mutable tenant settings; old rows intentionally stay NULL.
ALTER TABLE pos_sales
 ADD COLUMN sales_tax_rate_pct DECIMAL(6,3) NULL AFTER sales_tax,
 ADD COLUMN service_tax_rate_pct DECIMAL(6,3) NULL AFTER service_tax,
 ADD COLUMN service_charge_rate_pct DECIMAL(6,3) NULL AFTER service_charge;
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('pos_receipt_tax_rates_r215_036');
