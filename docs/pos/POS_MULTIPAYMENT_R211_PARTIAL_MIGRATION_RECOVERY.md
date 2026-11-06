# TPOS Main V2 — POS Multi-Payment R2.1.1 (Recover 035 + frontend installation)

## PC findings (5 November 2026)

The R2.1 migration returned `POS_035_VERIFY_FAILED` after `--apply`, followed by `POS_035_SCHEMA_INCOMPATIBLE_MANUAL_REVIEW`. The previous installer could not distinguish a partially applied MySQL DDL from a failed verifier. **Do not run the original 035 SQL again manually**: `ALTER` statements are not safely repeatable and can leave the check constraint out of sync.

Tests on the PC also reported `ENOENT` for `frontend/src/PosMultiPayment.jsx` and `frontend/public/customer-display.js` at `D:\www\tpos_main_v2`, while `PosTerminal.jsx` there was from before R2.1. The original ZIP contains all three. This strongly indicates a mixed or incomplete installation. Confirm the real active project root before proceeding; do not assume `D:\www\tpos_main_v2` and `D:\www\tpos-main-V2` refer to the same folder.

## Scope of this changed-files package

- `backend/scripts/setup-pos-multi-payment.js`: read-only, detailed diagnostics and incremental recovery for partial migration 035. Cannot update unknown/incompatible schemas; does not overwrite cash or payment records. When the 035 history marker exists, it **does not replay role grant seeding**.
- `backend/src/pos-multi-payment-migration.js`: strict schema/ENUM/CHECK validation, table DDL extraction and safe permitted steps.
- `backend/scripts/verify-pos-multi-payment-files.js`: checks all required backend/frontend R2.1 files within the same root, showing the absolute path that was tested.
- Reinstalls R2.1 frontend files and original 035 SQL to help align the active project. **No `.env`, dependencies or private keys included.**
- Tests for partial recovery, incompatible schema fail-closed behavior, and same-root frontend installation.

## Procedure — backup and stop checkout before migration

1. Stop backend; ensure no staff are making sales. Back up the V2 tenant database, including `pos_sales`, `accounting_journals`, `pos_payment_attempts` and `tpos_feature_setup_history`. Do not modify any V1 database.
2. Identify **one** live project root from the frontend/backend actually being run. The expected root from this project is `D:\www\tpos-main-V2`, but if your live process truly runs from `D:\www\tpos_main_v2`, install into that **same** root instead. Do not mix the two.
3. **Open the ZIP and enter its top folder `tpos_main_v2`; copy only the CONTENTS of that folder** (`backend`, `frontend`, `database`, `docs`) into the active root. Do **not** create `<ROOT>\tpos_main_v2\backend` as a nested directory. Confirm the files are exactly at `<ROOT>\frontend\src\PosMultiPayment.jsx` and `<ROOT>\frontend\public\customer-display.js`.
4. Open CMD inside **that root's** `backend` and run:

   ```cmd
   npm run check
   node scripts/verify-pos-multi-payment-files.js
   npm run db:pos:multi-payment
   ```

   The file verifier must report `failed:0` and the correct `projectRoot`. The migration inspector may report `CURRENT` or `MISSING_OR_PARTIAL` together with `diagnostic`. If it reports `MANUAL_REVIEW`, **DO NOT run --apply**. Copy the diagnostic output for review. The inspector changes no data.
5. Only if `diagnostic.repairable=true`, after backup and stopping checkout, run:

   ```cmd
   npm run db:pos:multi-payment -- --apply
   npm run db:pos:multi-payment
   ```

   On a previous partial run you may see `RECOVERED` instead of `APPLIED`. Successful final read-only output must show `CURRENT`, `failed:0`, `diagnostic.pending:[]` and `diagnostic.blockers:[]`. **Do not rerun --apply endlessly if it fails.** Share the new error/diagnostic.
6. Run the targeted tests and full regression **from the same root**:

   ```cmd
   node --test tests/pos-multi-payment-migration-r211.test.js
   node --test tests/pos-multi-payment-r21.test.js
   npm test
   ```

   Then build the frontend from `<ROOT>\frontend`:

   ```cmd
   npm run build
   ```

7. Restart backend and frontend. Logout/login for refreshed permissions. Test **Cash first**, then an actual configured Static QR with the merchant account and redacted payment evidence, and a second-screen Customer Display. Test reference duplicates and branch restrictions. Do not simulate successful bank or terminal verification.

## Safeguards and limits

- All schema checks are tenant-scoped. Only ACTIVE tenants are inspected.
- A previously created `pos_payment_attempts` table is not dropped, emptied, re-created or force-altered. The installer refuses unknown table columns/indexes.
- CASH continues to require valid tender and change. Non-CASH requires zero cash tender and zero cash change in `chk_pos_sale_amounts`; existing sales are prevalidated before that check is changed.
- Unknown ENUM values, incompatible check constraints, wrong tenant database identity, or missing migration 034 fail closed with named diagnostics.
- If migration 035's history marker is already present, existing Role Permission grants are not reset.
- `PAYMENT_EVIDENCE_ENCRYPTION_KEY` remains required in the existing backend `.env`. Never generate a new key if encrypted evidence already exists.
- Integrated bank/card/e-wallet terminals and SARA/MyKasih remain unconnected until officially supported by their providers. R2.1.1 is an installation/migration repair, **not** a connected-terminal release.

## Read-only SQL for unresolved failures

Use a read-only DBA connection to the affected V2 tenant if `MANUAL_REVIEW` persists:

```sql
SELECT feature_code FROM tpos_feature_setup_history WHERE feature_code IN ('role_permissions_r1_034','pos_multi_payment_r21_035');
SELECT table_name,column_name,column_type FROM information_schema.columns
 WHERE table_schema=DATABASE() AND ((table_name='pos_sales' AND column_name='payment_method') OR (table_name='accounting_journals' AND column_name='source_type'));
SELECT tc.table_name,tc.constraint_name,cc.check_clause FROM information_schema.table_constraints tc
 JOIN information_schema.check_constraints cc ON cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name
 WHERE tc.constraint_schema=DATABASE() AND tc.table_name='pos_sales' AND tc.constraint_type='CHECK';
SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('pos_payment_attempts','pos_payment_attempt_audit','pos_payment_display_tokens');
```

These queries do not alter rows or schema. Do not copy bank evidence, API keys, customer data or `.env` into screenshots/logs.

## Acceptance

Status **PENDING PC ACCEPTANCE** until migration 035 reports CURRENT, backend regression and frontend build are successful and an actual Cash + properly verified manual QR transaction is tested. Never mark a payment successful based solely on a customer screenshot or typed reference.
