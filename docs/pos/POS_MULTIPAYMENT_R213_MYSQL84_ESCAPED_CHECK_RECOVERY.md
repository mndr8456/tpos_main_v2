# TPOS Main V2 — POS Multi-Payment R2.1.3
## MySQL 8.4 escaped CHECK_CLAUSE detection correction

**Status:** Development tested. Requires live PC read-only migration inspection and actual checkout acceptance.
**Based on:** R2.1.2 installed into the active TPOS V2 project.
**Delivery:** Changed full files only, no new SQL migration or `.env` changes.

## What happened

The previous PC output showed migration 035 `MANUAL_REVIEW` with these facts:

- `missingTables: []`, `invalidTables: []`
- `saleEnum: CURRENT`, `journalEnum: CURRENT`
- `permissionPresent: true`, `historyPresent: true`
- `pending: []`, `otherPaymentChecks: []`
- only blocker: `SALE_AMOUNT_CHECK_INCOMPATIBLE`

The exact MySQL 8.4 `cashCheckClause` contained `_utf8mb4\\'CASH\\'`, i.e. the CHECK_CLAUSE result included literal backslashes before single quote delimiters. The earlier strict expression parser did not recognize that representation. Replacing only this exact fixed marker with `_utf8mb4'CASH'` for inspection produces the expected current Cash/non-Cash constraint. This is **read-only normalization inside the verifier**; the MySQL constraint itself is not modified.

The verifier continues to reject changed amounts, unknown SQL operators, additional OR alternatives, unknown charsets and weakened payment safeguards.

## Install (PC)

1. Backup the V2 tenant database before further payment work. Stop the backend while replacing source files.
2. Extract `tpos_main_v2` from this ZIP and copy its **contents** into your **active** project folder, verified previously as `D:\\www\\tpos_main_v2`. Preserve the folder structure; do not create a nested `tpos_main_v2` directory inside your project root.
3. Run from `D:\\www\\tpos_main_v2\\backend`:

```cmd
npm run check
node --test tests/pos-multi-payment-migration-r213.test.js
npm run db:pos:multi-payment
```

**Expected for the already-completed PC schema shown in your diagnostic:** `status: CURRENT`, `failed: 0`. If the inspection reports CURRENT, **DO NOT run `--apply` again**. There is no schema change in R2.1.3.

If the inspection reports `MISSING_OR_PARTIAL`, `MANUAL_REVIEW` or `FAILED`, stop and examine the entire `diagnostic` object. Do not force an SQL ALTER, DROP CHECK or rerun `--apply` without further review. This patch deliberately does not bypass actual incompatible schema checks.

Once the inspection reports CURRENT, run:

```cmd
node --test tests/pos-multi-payment-migration-r211.test.js tests/pos-multi-payment-migration-r212.test.js tests/pos-multi-payment-migration-r213.test.js tests/pos-multi-payment-r21.test.js
npm test
```

Frontend files are **unchanged** from R2.1.2. Restart backend after code installation; test the existing frontend only after the migration reads CURRENT. Actual posting and bank/provider integration remain separate live acceptance requirements.

## Local development verification

- Exact PC CHECK_CLAUSE reproduced: formerly `INCOMPATIBLE`, now `CURRENT`.
- Targeted tests: 30/30 PASS.
- Full backend regression: 609/609 PASS (Node.js 22 available in sandbox). A temporary `.env` copied from `.env.example` was used for a foundation test and removed. No `.env` is included.
- No MySQL server/tenant data was available locally; **live database status is not claimed**.
- No frontend files were changed; a new Vite build was not required for this verifier-only patch.

## Invariants

- No `DROP`/`ALTER`/`UPDATE` in this patch.
- Migration 035, migration history, existing cash journal, noncash journal and the payment evidence encryption format stay unchanged.
- No API/SDK provider connectivity or SARA/MyKasih certification is implied by the migration becoming CURRENT.
- Preserve Cash checkout, Role Permission R1, Payment Methods R1.1 and previously accepted HR modules.
