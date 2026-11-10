# TPOS V2 — C4.3 R4.2 — Machine-Readable Offline UBL JSON Profile

## Scope and integrity
This is a READ-ONLY additional stage based on R4.1, sourced from `tpos_main_v2-LATEST_101120261425.zip` + R4.0/R4.1 patches. It does not change financial tables, checkout, voucher, invoice submissions, migrations, or prior endpoints. No outbound MyInvois requests are performed.

This package includes a **TPOS-authored bounded JSON Schema profile** at `backend/schemas/einvoice-c43-r42-profile.schema.json` and a fail-closed JavaScript evaluator for the explicitly supported schema vocabulary. It is **not** the full OASIS normative UBL 2.1 XSD, not the complete OASIS UBL JSON schema suite, and not MyInvois official validation. `offlineJsonSchemaValidated`, `normativeUblSchemaValidated`, `officialSchemaValidated`, `submissionEnabled` remain `false`. A success means *only* the TPOS bounded profile checks have passed.

References:
- https://sdk.myinvois.hasil.gov.my/types/
- https://sdk.myinvois.hasil.gov.my/document-validation-rules/
- https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/
- https://docs.oasis-open.org/ubl/UBL-2.1-JSON/v2.0/

## Changed files (full file contents)
- `backend/src/app.js` — one new authenticated GET route
- `backend/src/einvoice-ubl-schema-c43-r42.js` — read-only route / R4.1 orchestration
- `backend/src/einvoice-ubl-schema-c43-r42-core.js` — bounded profile evaluator
- `backend/schemas/einvoice-c43-r42-profile.schema.json` — machine-readable profile
- `backend/tests/einvoice-ubl-schema-c43-r42.test.js` — regression for fail-closed behavior
- `docs/einvoice/C43_R42_SCHEMA_PROFILE_README.md`

## Installation / PC validation
1. Backup and compare `backend/src/app.js` with your latest PC file first; ensure R4.1 exists. Do not overwrite unrelated local changes.
2. Extract over `D:\www\tpos_main_v2` keeping the root folder hierarchy.
3. Restart backend, run:
```
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/einvoice-sdk-profile-c43-r4.test.js tests/einvoice-ubl-offline-audit-c43-r41.test.js tests/einvoice-ubl-schema-c43-r42.test.js
npm test
```
4. As authenticated OWNER/ADMIN, call `GET /api/v2/einvoice/ubl-schema-profile/3`.
5. Expect `status=OFFLINE_PROFILE_SCHEMA_PASSED_UNSIGNED`, `offlineProfileSchemaValidated=true`, `offlineJsonSchemaValidated=false`, `normativeUblSchemaValidated=false`, `officialSchemaValidated=false`, `submissionEnabled=false`, 4 invoice lines, payable 14.95 — if and only if the current sale evidence remains consistent.

## Live console command
```js
fetch('/api/v2/einvoice/ubl-schema-profile/3',{credentials:'same-origin',cache:'no-store'})
 .then(async r=>{const d=await r.json();console.log({http:r.status,status:d.status,issues:d.issues,offlineProfileSchemaValidated:d.offlineProfileSchemaValidated,offlineJsonSchemaValidated:d.offlineJsonSchemaValidated,normativeUblSchemaValidated:d.normativeUblSchemaValidated,officialSchemaValidated:d.officialSchemaValidated,submissionEnabled:d.submissionEnabled,lineCount:d.sdkDocument?.Invoice?.[0]?.InvoiceLine?.length,payable:d.sdkDocument?.Invoice?.[0]?.LegalMonetaryTotal?.[0]?.PayableAmount?.[0]?._});});
```

## Acceptance gates
No LULUS/LOCKED until owner's PC live results. The separate future step toward **complete formal normative validation** requires obtaining and pinning verified OASIS UBL 2.1 schema artifacts, selecting a compatible full schema validator, and testing the complete canonical conversion rather than treating this application profile as full compliance. For Invoice v1.1, MyInvois signature validation remains required for a real signed submission; this patch does not perform it.
