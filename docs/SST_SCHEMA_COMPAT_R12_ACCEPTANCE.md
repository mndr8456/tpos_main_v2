# TPOS Main V2 — GST / SST R1.2 Schema Compatibility Repair

## Root cause

Some existing V2 tenant databases have an older `company_registrations` table without
`sst_sales_tax_number` and/or `sst_service_tax_number`. Migration 018 initially checked only
whether its new tables existed. It therefore reported `CURRENT` despite the registration
column mismatch, and GET `/api/v2/sst-settings` raised MySQL `ER_BAD_FIELD_ERROR`.

The source foundation schema (`002_tenant_foundation.sql`) already defines both registration
columns, so **do not rerun** the old foundation migration or replace registration records.

## Changed files

- `backend/src/sst-registration-schema.js` (NEW): exact schema inspection and conditional additive ALTER
- `backend/scripts/setup-sst-settings.js` (REPLACE): inspect missing registration columns on all active tenants; read-only by default and verify repair
- `backend/tests/sst-registration-schema-r12.test.js` (NEW): regression coverage

No frontend, SQL file, database credential, environment file or historical migration was modified.

## Installation

1. Back up the live V2 tenant databases before any schema operation.
2. Extract ZIP into `D:\\www\\tpos_main_v2\\` replacing the files above.
3. In an administrator CMD on the PC:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:sst-settings
npm run db:sst-settings -- --apply
npm run db:sst-settings
npm run check
npm test
```

4. Restart backend. Reopen GST / SST Settings and click the in-page Refresh icon.
5. Confirm both Tax Rate inputs still display `0.00`. Save and reopen as OWNER.

## Expected console output (for a tenant with both columns missing)

```text
{"tenantId":"1","status":"MISSING","mode":"read-only","missingRegistrationColumns":["sst_sales_tax_number","sst_service_tax_number"],"missingTables":[],"missingTaxTypes":[]}
{"tenantId":"1","status":"APPLIED","mode":"apply","missingRegistrationColumns":[],"missingTables":[],"missingTaxTypes":[]}
{"tenantId":"1","status":"CURRENT","mode":"read-only","missingRegistrationColumns":[],"missingTables":[],"missingTaxTypes":[]}
```

The exact missing list may contain only one column. Already-compatible tenants remain CURRENT.

## Data protection

- The installer uses `information_schema.COLUMNS` to inspect each active tenant.
- It adds **only absent** `VARCHAR(80) NULL` SST registration fields.
- It does not overwrite or migrate SSM, TIN, registration values, tax rates, or existing POS orders.
- Existing SST switch states are preserved. Missing settings seed rows, if any, are inserted OFF.
- Read-only mode never executes DDL. `--apply` is required to make changes.
- On an incompatible column or missing ALTER privilege, it prints FAILED and exits non-zero.
- MySQL DDL cannot generally be rolled back. Always back up first.

If the columns were missing at the time of initial tenant registration, their values are NULL after the repair. The OWNER must enter the legitimate SST registration number(s) in GST / SST Settings; no number is guessed or fabricated.

## Optional MySQL structural check (no sensitive values)

```sql
SELECT COLUMN_NAME,DATA_TYPE,CHARACTER_MAXIMUM_LENGTH,IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA='tpos_v2_tenant_1'
  AND TABLE_NAME='company_registrations'
  AND COLUMN_NAME IN ('sst_sales_tax_number','sst_service_tax_number')
ORDER BY COLUMN_NAME;
```

There must be exactly two columns for Tenant 1. Use the configured tenant database name if different. Do not post full SST registration numbers or credentials.

## Known limits

- Backend regression and live MySQL acceptance must be executed on the user's PC.
- This patch addresses registration schema drift; it does not activate SST or perform payment posting.
- POS checkout remains disabled until the other financial integrations are complete.
