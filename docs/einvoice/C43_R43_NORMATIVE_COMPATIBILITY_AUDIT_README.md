# TPOS V2 — C4.3 R4.3 OASIS UBL 2.1 Normative Schema Compatibility Audit

## BASELINE AND INSTALLATION
- Baseline source: `tpos_main_v2-LATEST_101120261425.zip` plus R4.0, R4.1, R4.2 installed patches.
- V1 ZIP is reference only. Do not extract it over V2.
- Changed complete files only. Backup existing full `backend/src/app.js`, compare against currently installed file, then extract to `D:\www`. The archive root is `tpos_main_v2/`.
- No migration or database writes. No frontend change. No MyInvois OAuth, signing or submission changes.
- The operator's real `backend/src/app.js` may include local changes made after the baseline; merge the new import and GET route rather than overwrite blindly.

## WHAT R4.3 DOES
- Adds authenticated, permission-guarded, **GET-only** endpoint:
  `GET /api/v2/einvoice/ubl-normative-compatibility/:saleId`.
- Reuses prior R4.2 successful response; checks a bounded, explicitly declared subset of OASIS UBL 2.1 XML Invoice element vocabulary, element order and cardinality.
- Reports `sourceOrderIssues` when the existing R3/R4 SDK-shaped JSON has noncanonical UBL element order; this includes `InvoiceLine` before `TaxTotal` and `LegalMonetaryTotal` in the existing source fixture.
- Creates an *audit-only* canonical key-order copy of the SDK JSON, then audits it. Arrays and scalar values, invoice lines, monetary totals and reference identifiers are left intact. Existing R3/R4/R4.1/R4.2 endpoints are not changed.
- Refuses unknown elements and invalid cardinality; does not label normalized bad input as compliant.
- The output `sdkDocument` is still UNSIGNED and NOT for submission.

## IMPORTANT LIMITATION — NO FALSE NORMATIVE PASS
The official OASIS UBL 2.1 XSD files, including `xsd/maindoc/UBL-Invoice-2.1.xsd` and dependencies under `xsd/common/`, are the normative XML representation. This R4.3 patch **does not bundle the full OASIS XSD files**, perform JSON-to-XML serialization, or invoke an XSD validating processor. Thus it is a compatibility audit and NOT a completed normative schema validation.

Reference:
- https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd
- https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/common/
- https://sdk.myinvois.hasil.gov.my/types/

`normativeXsdExecuted=false`, `normativeUblSchemaValidated=false`, `offlineJsonSchemaValidated=false`, `officialSchemaValidated=false`, `submissionEnabled=false`, `submissionReady=false`, `signaturePresent=false` ALWAYS.

## PC TEST STEPS
```
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/einvoice-sdk-profile-c43-r4.test.js tests/einvoice-ubl-offline-audit-c43-r41.test.js tests/einvoice-ubl-schema-c43-r42.test.js tests/einvoice-ubl-normative-audit-c43-r43.test.js
npm test
```
Restart backend, sign in as OWNER or ADMIN with `einvoice_settings.view`, and in browser console run:
```
fetch('/api/v2/einvoice/ubl-normative-compatibility/3',{credentials:'same-origin',cache:'no-store'})
.then(async r=>{
  const d=await r.json();
  const i=d.sdkDocument?.Invoice?.[0];
  console.log({http:r.status,status:d.status,issues:d.issues,
    sourceOrderIssues:d.sourceOrderIssues,canonicalOrderingApplied:d.canonicalOrderingApplied,
    normativeCompatibilityChecksPassed:d.normativeCompatibilityChecksPassed,
    normativeXsdExecuted:d.normativeXsdExecuted,
    normativeUblSchemaValidated:d.normativeUblSchemaValidated,
    officialSchemaValidated:d.officialSchemaValidated,
    submissionEnabled:d.submissionEnabled,
    lineCount:i?.InvoiceLine?.length,
    payable:i?.LegalMonetaryTotal?.[0]?.PayableAmount?.[0]?._,
    invoiceElementOrder:i?Object.keys(i):null});
});
```
Target for the previous Sale ID 3 if all data remain unchanged:
- HTTP 200; `status: 'NORMATIVE_COMPATIBILITY_CHECKS_PASSED_UNSIGNED'`; `issues: []`;
- `canonicalOrderingApplied: true` if source remains in previous order;
- `normativeCompatibilityChecksPassed: true`; `normativeXsdExecuted: false`;
- 4 lines, payable RM14.95; all normative/official/submission booleans false.

**Do not mark LULUS / LOCKED until user confirms PC acceptance.** Production hosting remains HOLD.
