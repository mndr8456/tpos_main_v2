# TPOS Main V2 — C4.3 R4.1 Offline UBL Rule Audit (Read Only)

## Source and scope

Baseline: `tpos_main_v2-LATEST_101120261425.zip`, with the previously delivered C4.3 R4.0 patch applied on top. V1 backup is reference-only. The R4.1 ZIP includes **only new/modified full files**. Do not overwrite the original project with an older baseline.

This update introduces an independent, **GET-only** offline validator on the SDK-shaped JSON emitted by R4.0. It checks namespaces, required cardinalities, Party IDs/address, invoice version/date/time, quantity/unit, product classification presence, tax subtotals/codes, currency, line amounts, allowances, arithmetic sums and historic Sale 3 reconciliation, while blocking unexpected signature content.

**Important distinction:** This is a bounded *SDK-guided offline rule audit*, **NOT** full normative UBL 2.1 JSON Schema / XML XSD validation, and NOT MyInvois server validation. `offlineJsonSchemaValidated`, `officialSchemaValidated`, `signaturePresent`, `submissionReady`, `submissionEnabled` are always `false`. Never change these flags to true based on this patch. No signed invoice may be submitted through this endpoint.

Official references:
- https://sdk.myinvois.hasil.gov.my/types/
- https://sdk.myinvois.hasil.gov.my/document-validation-rules/
- https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/
- https://sdk.myinvois.hasil.gov.my/signature/

## Changed files

- `backend/src/app.js` — full file, based on R4.0, one R4.1 GET registration/import
- `backend/src/einvoice-ubl-offline-audit-c43-r41-core.js` — new offline rule validator
- `backend/src/einvoice-ubl-offline-audit-c43-r41.js` — new GET adapter reusing R4.0, no SQL writes
- `backend/tests/einvoice-ubl-offline-audit-c43-r41.test.js` — six targeted tests
- `docs/einvoice/C43_R41_OFFLINE_UBL_RULE_AUDIT_README.md` — this document

No frontend, database migration, existing financial source handler, voucher, receipt, or checkout files are changed.

## Installation

Back up the PC files (especially `backend/src/app.js`) and compare them with this patch. Extract into `D:\\www`, maintaining directory structure `tpos_main_v2`. Restart backend after tests.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/einvoice-sdk-profile-c43-r4.test.js tests/einvoice-ubl-offline-audit-c43-r41.test.js
npm test
```

The project is expected to retain the existing R4.0 files `einvoice-sdk-profile-c43-r4-core.js` and `einvoice-sdk-profile-c43-r4.js` from the previous patch. No database migration.

## Live read-only test

Run after authenticated OWNER/ADMIN login:

```js
fetch('/api/v2/einvoice/ubl-offline-rules/3', {
  credentials: 'same-origin', cache: 'no-store'
}).then(async r => {
  const d = await r.json();
  console.log({
    http: r.status,
    status: d.status,
    issues: d.issues,
    offlineRuleChecksPassed: d.offlineRuleChecksPassed,
    offlineJsonSchemaValidated: d.offlineJsonSchemaValidated,
    officialSchemaValidated: d.officialSchemaValidated,
    submissionEnabled: d.submissionEnabled,
    lineCount: d.sdkDocument?.Invoice?.[0]?.InvoiceLine?.length,
    payable: d.sdkDocument?.Invoice?.[0]?.LegalMonetaryTotal?.[0]?.PayableAmount?.[0]?._
  });
});
```

**Expected only if all local rules pass:** HTTP 200, status `OFFLINE_RULE_CHECKS_PASSED_UNSIGNED`, issues empty, `offlineRuleChecksPassed=true`, 4 invoice lines, RM14.95. All official schema, signing and submission flags remain false. If any issue is returned, do not bypass the validator or invent data.

## Outstanding work

A true normative validation stage requires obtaining and pinning an appropriate published UBL schema/validator and proving compatibility with the MyInvois JSON representation and local tax code lists; even this still cannot count as LHDN server validation. MyInvois Invoice v1.1 signature requirements must be addressed separately in an expressly approved future phase.

Status: **PATCH READY / USER PC LIVE ACCEPTANCE PENDING**. Production hosting remains HOLD.
