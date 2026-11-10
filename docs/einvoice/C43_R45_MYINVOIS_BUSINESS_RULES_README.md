# TPOS Main V2 C4.3 R4.5 — MyInvois SDK Business Rules Offline Audit

## Scope

This patch introduces a **read-only, bounded, offline SDK preflight** for Sale ID 3 and other eligible already-paid sales. It is **not a complete replication of the MyInvois validation rules**. It does not create signatures, call the MyInvois API, change invoice dates, or submit anything.

Official SDK sources reviewed on 2026-11-10:
- https://sdk.myinvois.hasil.gov.my/document-validation-rules/
- https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/
- https://sdk.myinvois.hasil.gov.my/signature/
- https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents/
- https://sdk.myinvois.hasil.gov.my/einvoicingapi/08-get-document-details/

The protected endpoint `GET /api/v2/einvoice/sdk-business-audit/:saleId` requires `einvoice_settings.view`. It runs the R4.4 XSD check and, if successful, loads the canonical R4.3 SDK document in memory. Sale ID, line count, and payable must agree. Only sanitized summaries and code identifiers are returned (no raw buyer/supplier identity, signing secret, or XML).

## Local checks and limits

Checks selected core fields: invoice number length, Invoice `01` / version `1.1`, UTC issue date/time format, issue date being current UTC date, MYR currency, invoice line presence and Supplier/Buyer party presence. Does not modify historical data.

**Always external / unresolved**: Malaysian XAdES certificate and signature validation, actual taxpayer registration, current LHDN catalogs and code validation, document duplicates, reference validation, and LHDN currency validation. These must NOT be called PASS by an offline audit. `offlineBusinessRulesPassed`, `signatureValidated`, `lhdnAccepted`, `submissionEnabled` are always false in this phase.

* `OFFLINE_BUSINESS_AUDIT_PREREQUISITE_MISSING`: no successful R4.4 local XSD validation.
* `OFFLINE_BUSINESS_RULES_BLOCKED`: selected locally checkable issue, e.g. historic issue date.
* `OFFLINE_BUSINESS_RULES_REVIEW_REQUIRED`: limited local checks have no blockers; all online/signature checks still pending.

## PC install and tests

Merge changed files under `D:\www` after comparing the current `backend/src/app.js` with the included version. This patch contains no SQL, migration, frontend modification, certificate, authentication token or external API code.

```powershell
cd D:\www\tpos_main_v2\backend
npm.cmd run check
node --test tests/einvoice-sdk-business-c43-r45.test.js
npm.cmd test
```

Restart backend and call in the logged-in OWNER/ADMIN browser session:

```js
fetch('/api/v2/einvoice/sdk-business-audit/3', {credentials:'same-origin',cache:'no-store'})
  .then(async r=>{const d=await r.json();console.log({http:r.status,...d});});
```

## Actual LHDN Sandbox acceptance requires a separate write-enabled phase

1. Confirm sandbox taxpayer credentials, role/permission and Malaysian CA-issued certificate/profile for signature v1.1. Keep secrets out of browser logs and ZIPs.
2. Build and locally verify XAdES signature over an explicitly created **test e-Invoice**, not an implicit mutation of the historic paid POS sale.
3. Guard explicit OWNER-only sandbox submission using a durable idempotency key, single-submission lock and immutable local audit, with no production URL.
4. Submit via `POST /api/v1.0/documentsubmissions/`; HTTP 202 merely means accepted for asynchronous processing, **not validated**.
5. Poll Get Submission on SDK recommended cadence (3–5 seconds), then Get Document Details when needed for invalid/error diagnosis. Record actual document status (`Valid` / `Invalid`) and SDK validation results. Never report `LHDN_VALID` without server evidence.

**No Sandbox submission was performed by this ZIP.**
