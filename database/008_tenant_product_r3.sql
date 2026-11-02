-- Product R3 additive migration. Apply ONCE on each existing R2 tenant.
-- No schema resets, no data loss and no modifications to 007 migration.
ALTER TABLE products
 ADD COLUMN jkdm_tax_type ENUM('NONE','SALES_TAX','SERVICE_TAX') NOT NULL DEFAULT 'NONE' AFTER is_tax_inclusive,
 ADD COLUMN jkdm_tax_rate DECIMAL(6,2) NOT NULL DEFAULT 0.00 AFTER jkdm_tax_type,
 ADD COLUMN jkdm_tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE AFTER jkdm_tax_rate,
 ADD CONSTRAINT chk_jkdm_tax_rate CHECK(jkdm_tax_rate>=0 AND jkdm_tax_rate<=100);
