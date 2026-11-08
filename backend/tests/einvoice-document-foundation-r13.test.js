import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const sql=source('../../database/046_tenant_einvoice_document_foundation.sql');
const logic=source('../src/einvoice-document-foundation-r13.js');
const setup=source('../scripts/setup-einvoice-document-foundation.js');
test('046 is additive and has no POS/customer-request mutations',()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS einvoice_documents/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS einvoice_submission_attempts/);
 assert.match(sql,/CREATE TABLE IF NOT EXISTS einvoice_document_audit/);
 assert.doesNotMatch(sql,/\b(?:DROP|TRUNCATE|ALTER TABLE|DELETE FROM)\b/i);
 assert.doesNotMatch(sql,/^UPDATE\s+|^INSERT\s+INTO\s+(?:pos_sales|einvoice_customer_requests)/im);
 assert.match(sql,/FOREIGN KEY\(sale_id\) REFERENCES pos_sales\(id\)/);
 assert.match(sql,/FOREIGN KEY\(request_id\) REFERENCES einvoice_customer_requests\(id\)/);
});
test('enforces single Invoice per sale per environment and per buyer request',()=>{
 assert.match(sql,/UNIQUE KEY uq_einvoice_document_sale_type_env \(sale_id,document_type,environment\)/);
 assert.match(sql,/UNIQUE KEY uq_einvoice_document_request \(request_id\)/);
 assert.match(sql,/UNIQUE KEY uq_einvoice_attempt_sequence \(document_id,attempt_number\)/);
});
test('submission and audit records do not include raw buyer payloads, OAuth tokens or credentials',()=>{
 assert.doesNotMatch(sql, /buyer_cipher|client_secret|access_token|request_token|raw_response|http_body/i);
 assert.match(sql,/last_error_code/);
 assert.match(sql,/details_code/);
});
test('strict sandbox-only, PAID sale, same request and buyer validation',()=>{
 for(const expression of [/environment!=='SANDBOX'/,/sale.status!=='PAID'/,/request.status!=='REQUESTED'/,/request.environment!==environment/,/request.sale_id/,/buyerRequestSchema.safeParse/,/supplier\.tin/,/supplier\.registrationNumber/])assert.match(logic,expression);
});
test('money amounts checked with decimal cents not floating point, and READY blocked',()=>{
 assert.match(logic,/BigInt\(units\)/);
 assert.match(logic,/subtotal\+tax\+charge\+rounding!==total/);
 assert.match(logic,/R13_SUBMISSION_ENABLED=false/);
 assert.match(logic,/EINV_R13_UBL_SIGNING_NOT_IMPLEMENTED/);
 assert.doesNotMatch(logic, /\bfetch\s*\(|\/api\/v2\/|\/documentsubmissions/);
});
test('explicit installer only and migration 045 required',()=>{
 assert.match(setup,/includes\('--apply'\)/);
 assert.match(setup,/EINV_R13_REQUIRES_MIGRATION_045/);
 assert.match(setup,/EINV_R13_PARTIAL_SCHEMA_MANUAL_REVIEW/);
 assert.match(setup,/046_tenant_einvoice_document_foundation.sql/);
 assert.match(source('../src/tenants.js'),/045_tenant_einvoice_requests\.sql'[\s\S]*046_tenant_einvoice_document_foundation\.sql'/);
});
