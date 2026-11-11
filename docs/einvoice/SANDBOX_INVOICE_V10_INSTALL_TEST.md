# TPOS Main V2 — Sandbox Invoice v1.0 (R1)

Status: DEVELOPMENT PATCH / PENDING LIVE SANDBOX ACCEPTANCE. Production submission is not supported.

## Scope and safety

This patch adds a **manual** MyInvois Invoice v1.0 sandbox submission workflow. It is not a replacement for the existing unsigned C4.3-R3 v1.1 preview.

- OWNER/ADMIN, with `einvoice_documents` permissions, are authorized to use this flow.
- The workflow supports PAID sales with a REQUESTED buyer request and fully reconciled C4.3-R3 source evidence. **The current C4.3 builder supports discount/voucher reductions only.** It rejects ordinary sales without the requisite reduction evidence and sales with unresolved service-charge treatment.
- It uses a verified, enabled SANDBOX credential and hardcoded official sandbox API origin. No production host or automated retries.
- The buyer request submission UTC timestamp is used as a deterministic invoice issue timestamp. For this R1 test patch, buyer requests older than 70 hours are refused. This also prevents changing the invoice hash between preview and submit.
- Preview must succeed first; confirmation must include the exact preview SHA-256 hash. Before submitting, the backend rebuilds the document, verifies the hash and rejects changed source evidence.
- Documents are converted from the approved source candidate to unsigned MyInvois UBL JSON v1.0 (`_D`, `_A`, `_B`, `Invoice`, nested unprefixed UBL keys), SHA-256 hashed and base64 encoded. The 300 KB single-document limit is enforced.
- Submission state and encrypted document are stored in the existing tenant-local e-Invoice foundation. Unique `(sale_id,document_type,environment)` prevents duplicate attempts.
- An ambiguous 202 response, timeout, transport failure or HTTP 422 is captured as `SUBMISSION_UNKNOWN` and **must not be retried automatically**. Investigate through the MyInvois portal before any correction.
- HTTP 202 means submitted for processing, **not VALID**. `Refresh LHDN` uses the Get Submission endpoint; manual calls should be at least 3–5 seconds apart.
- No changes to sales, POS checkout, receipt numbers, stock, journals or production environment.

## Install

1. Back up the current V2 source and databases.
2. Extract the patch ZIP at `D:\\www\\tpos-main-V2`, retaining the folder structure, and overwrite changed files only.
3. In `D:\\www\\tpos-main-V2\\backend`, run:
   - `node scripts/setup-einvoice-sandbox-v10.js` — inspect only.
   - `node scripts/setup-einvoice-sandbox-v10.js --apply` — apply migration 052 for all active, schema-ready tenants.
   - `node scripts/setup-einvoice-sandbox-v10.js` — verify each tenant is CURRENT.
   - `npm run check`
   - `node --test tests/einvoice-sandbox-v10.test.js`
   - `npm test`
4. In `D:\\www\\tpos-main-V2\\frontend`, run `npm run build`.
5. Restart both backend and frontend.

## Live PC acceptance checklist

1. Sign in as OWNER or ADMIN; navigate to Settings / e-Invoice LHDN.
2. Verify MyInvois settings are ON, Sandbox environment selected and connection verified.
3. Confirm migration 052 is CURRENT. Review an eligible PAID discount/voucher transaction with a submitted Buyer e-Invoice Request and verified product classifications.
4. Enter the Sale ID in Sandbox Invoice v1.0 and click **Preflight v1.0**. Inspect document number, version 1.0 and SHA-256 hash; resolve missing-source errors before continuing.
5. Select the explicit confirmation checkbox, then click **Submit to Sandbox** once. Do not double-click or repeat on an ambiguous outcome.
6. If MyInvois returns a submission UID and document UUID, check status manually after at least 3–5 seconds. Verify eventual VALID/INVALID using the official Sandbox portal.
7. Verify database status, `einvoice_submission_attempts`, and `einvoice_document_audit` are consistent with the portal. Confirm a repeated submission is rejected.
8. Repeat checks with a CASHIER role (forbidden), Production setting (blocked), missing buyer, stale request, unverified mappings, and service-charge sale (blocked).

## Known gaps / limitations

- No live MyInvois sandbox call was possible in the patch-generation environment; live acceptance and real schema validation remain PENDING.
- No production submission, digital signature, bulk documents, automatic scheduling, or automatic ambiguous-result reconciliation.
- Current C4.3-R3 source builder has not been validated against the authoritative LHDN schema. Preflight checks only local structures. LHDN may reject business or structural fields; inspect validation errors in the Sandbox portal.
- The UI reports a sanitized error/status code; it does not expose buyer identity, raw validation responses or OAuth tokens.
- For future work, expand C4.3 to cover ordinary sales, tax exemptions, service charges and signed v1.1 documents based on independently accepted mappings.

## API routes

- `GET /api/v2/einvoice/sandbox-v10/preview/:saleId`
- `GET /api/v2/einvoice/sandbox-v10/status/:saleId`
- `POST /api/v2/einvoice/sandbox-v10/submit/:saleId` with `{ "confirm": true, "expectedHash": "<64-character lower-case sha256>" }`
- `POST /api/v2/einvoice/sandbox-v10/refresh/:saleId` with `{}`

## Local verification at patch construction

- Targeted Sandbox v1.0 tests: 4/4 PASS.
- Core foundation tests: 10/10 PASS (with `.env.example` copied to a local `.env` for tests only).
- Backend full test suite: 940/942 PASS; 2 existing test files cannot import missing `zod` package in this isolated environment due to incomplete dependency installation.
- Modified backend JS files passed `node --check`.
- Frontend Vite build and live MyInvois validation: NOT RUN / PENDING.
