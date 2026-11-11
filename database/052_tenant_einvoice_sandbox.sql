-- EINV Sandbox Invoice v1.0. Does not modify POS, customer request or accounting records.
-- Requires 046 foundation and 049 verified mappings. Production submission remains disabled.
ALTER TABLE einvoice_documents DROP CHECK chk_einvoice_document_version;
ALTER TABLE einvoice_documents ADD CONSTRAINT chk_einvoice_document_version CHECK (document_version IN ('1.0','1.1'));
INSERT IGNORE INTO tpos_feature_setup_history(feature_code) VALUES ('einvoice_sandbox_invoice_v10_052');
