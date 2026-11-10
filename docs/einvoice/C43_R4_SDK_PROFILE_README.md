# C4.3 R4.0 — MyInvois v1.1 SDK JSON profile preview (NOT formal schema validation)

## Source and reference

- Source baseline: `tpos_main_v2-LATEST_101120261425.zip` (2026-11-10 14:25).
- V1 reference: `tpos_main_v2-v1-reference-backup.zip` (reference only; no modifications).
- MyInvois sample: https://sdk.myinvois.hasil.gov.my/files/sdksamples/1.1-Invoice-MultiLineItem-Sample.json
- MyInvois UBL 2.1: https://sdk.myinvois.hasil.gov.my/types/
- Validation categories: https://sdk.myinvois.hasil.gov.my/document-validation-rules/

## Purpose and limits

Existing C4.3 R3 emits an **internal** unsigned candidate using keys `cbc_...` / `cac_...` and `_DRAFT_ONLY`. The official JSON SDK sample uses UBL JSON keys without these prefix markers and a namespace envelope (`_D`, `_A`, `_B`). R4.0 exposes a separate read-only **SDK sample-aligned profile mapping** and checks supplier/buyer ID types, address/country, Malaysia state, classification, unique lines, monetary totals and previously accepted Sale ID 3 voucher evidence. It does not rewrite financial snapshots or R3.

**Important:** R4.0 is NOT official full JSON Schema validation or official UBL XSD validation. `offlineJsonSchemaValidated`, `officialSchemaValidated`, `signaturePresent`, `submissionReady` and `submissionEnabled` are ALWAYS false. A passed result is **not a document ready to submit**. Do not rename `SDK_PROFILE_CHECK_PASSED_UNSIGNED` to `SCHEMA_VALIDATED`. The SDK sample is guidance, not a normative JSON schema engine.

## Changed files (full files)

1. `backend/src/app.js`: add GET route only; original C4.3 R3 route unchanged.
2. `backend/src/einvoice-sdk-profile-c43-r4.js`: new API adapter using original R3 read-only handler.
3. `backend/src/einvoice-sdk-profile-c43-r4-core.js`: pure mapping and profile checks.
4. `backend/tests/einvoice-sdk-profile-c43-r4.test.js`: tests.

No SQL/migration, no frontend, no payment, stock, voucher, ledger or source audit mutation. Do not extract the ZIP over a newer `app.js` without comparing the differences first.

## Installation and PC checks

Backup current files and extract ZIP to `D:\www` preserving `tpos_main_v2` directories.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/einvoice-sdk-profile-c43-r4.test.js
node --test tests/einvoice-ubl-invoice-c43-r3.test.js tests/einvoice-ubl-treatment-c43-r2.test.js
npm test
```

Restart backend; log in as OWNER or ADMIN with `einvoice_settings.view`. Browser console:

```javascript
fetch('/api/v2/einvoice/ubl-sdk-profile/3', { credentials: 'same-origin', cache: 'no-store' })
  .then(async r => {
    const d = await r.json();
    console.log({http:r.status, status:d.status, issues:d.issues,
      sdkProfileChecksPassed:d.sdkProfileChecksPassed,
      offlineJsonSchemaValidated:d.offlineJsonSchemaValidated,
      officialSchemaValidated:d.officialSchemaValidated,
      signaturePresent:d.signaturePresent,
      submissionReady:d.submissionReady,
      submissionEnabled:d.submissionEnabled,
      sdkDocumentGenerated:!!d.sdkDocument,
      lineCount:d.sdkDocument?.Invoice?.[0]?.InvoiceLine?.length,
      payable:d.sdkDocument?.Invoice?.[0]?.LegalMonetaryTotal?.[0]?.PayableAmount?.[0]?._});
  });
```

Expected if R3 source is complete: `HTTP 200`, `SDK_PROFILE_CHECK_PASSED_UNSIGNED`, 4 lines and 14.95 payable; all five formal validation/signature/submission flags false. If `SDK_PROFILE_GAPS`, inspect issue codes, do not bypass. If actual official MyInvois schema validation is required, that is a separate future phase with licensed/verified UBL JSON schema tool and official server validation when signing/submission is explicitly authorized.

## Acceptance

Development-time 4/4 target tests PASSED (pure module). This is not PC regression acceptance. Do NOT mark LULUS/LOCKED without user's live evidence.
