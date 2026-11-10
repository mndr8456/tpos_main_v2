-- C4.3 R3.1 Supplier Metadata. Additive. Executed only after three-column preflight.
-- This file is NOT safe to replay: explicit setup script performs idempotent detection.
ALTER TABLE company_profiles
 ADD COLUMN einvoice_state_code CHAR(2) NULL AFTER state,
 ADD COLUMN msic_code CHAR(5) NULL AFTER einvoice_state_code,
 ADD COLUMN business_activity_description VARCHAR(300) NULL AFTER msic_code;
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('einvoice_supplier_metadata_r31_051');
