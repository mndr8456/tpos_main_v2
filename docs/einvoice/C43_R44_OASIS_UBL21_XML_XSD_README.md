# TPOS Main V2 — C4.3 R4.4 Local OASIS UBL 2.1 XML/XSD Validation

## Source / scope

- Based on `tpos_main_v2-LATEST_101120261425.zip` plus R4.0, R4.1, R4.2, R4.3 (applied in order); V1 remains reference only.
- Additive, **GET-only** validation endpoint; existing R3/R4.0/R4.1/R4.2/R4.3 endpoints unchanged.
- **No DB migration, frontend changes, sale changes, payment/inventory/accounting postings, signing or MyInvois submission.**
- Generates unsigned XML in backend memory from the canonical read-only R4.3 JSON. It is not included in HTTP response because supplier/buyer identifiers can be private.
- Executes **actual offline XSD validation** via Python `lxml` *only after* the operator installs the official OASIS UBL 2.1 schema package and Python engine. XSD imports are resolved from local files; the validator disables network and XML entities. XSD error output is limited to error type and line, not raw identity values.
- This patch **does not include or redistribute** the OASIS XSD package. The network-restricted build environment could verify the official source URL, but could not download the complete schema tree. There is **no claimed local normative pass until your PC actually executes XSD**.

## Official references

- OASIS UBL 2.1 official release: `https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip`
- Invoice XSD: `https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd`
- Common XSD dependencies: `https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/common/`
- SDK: `https://sdk.myinvois.hasil.gov.my/types/`

## Local installation on your Windows PC

**Back up existing backend/src/app.js and compare before applying** (the patch contains complete changed files).

Extract the R4.4 ZIP under `D:\www` preserving root folder `tpos_main_v2`.

Install Python 3 if necessary. Then from PowerShell:

```powershell
cd D:\www\tpos_main_v2\backend
py -3 -m venv .venv-ubl
.\.venv-ubl\Scripts\python.exe -m pip install lxml

$archive = Join-Path $env:TEMP 'OASIS-UBL-2.1.zip'
$release = Join-Path $env:TEMP 'OASIS-UBL-2.1-extracted'
Invoke-WebRequest 'https://docs.oasis-open.org/ubl/os-UBL-2.1/UBL-2.1.zip' -OutFile $archive
Expand-Archive -LiteralPath $archive -DestinationPath $release -Force
$invoice = Get-ChildItem -LiteralPath $release -Filter 'UBL-Invoice-2.1.xsd' -File -Recurse | Where-Object { $_.Directory.Name -eq 'maindoc' -and $_.Directory.Parent.Name -eq 'xsd' } | Select-Object -First 1
if (-not $invoice) { throw 'Official UBL-Invoice-2.1.xsd not located' }
New-Item -ItemType Directory -Path '.\data\ubl-2.1' -Force | Out-Null
Copy-Item -LiteralPath $invoice.Directory.Parent.FullName -Destination '.\data\ubl-2.1\' -Recurse -Force
Test-Path '.\data\ubl-2.1\xsd\maindoc\UBL-Invoice-2.1.xsd'
Test-Path '.\data\ubl-2.1\xsd\common'
```

Both Test-Path checks must be `True`. Do not copy only Invoice XSD; preserve all `xsd/common` dependencies.

Run tests:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/einvoice-sdk-profile-c43-r4.test.js tests/einvoice-ubl-offline-audit-c43-r41.test.js tests/einvoice-ubl-schema-c43-r42.test.js tests/einvoice-ubl-normative-audit-c43-r43.test.js tests/einvoice-ubl-xsd-c43-r44.test.js
npm test
```

Restart backend and sign into TPOS as OWNER/ADMIN. Run browser DevTools Console:

```javascript
fetch('/api/v2/einvoice/ubl-xsd-validation/3',{credentials:'same-origin',cache:'no-store'})
  .then(async r=>console.log({http:r.status,...await r.json()}));
```

## Interpretation of returned status

| Field / status | Meaning |
|---|---|
| `XSD_NOT_INSTALLED` | No official local OASIS schema tree; XSD not executed |
| `XSD_ENGINE_NOT_INSTALLED` | Python exists but `lxml` unavailable |
| `XSD_ENGINE_NOT_AVAILABLE` | Python executable unavailable |
| `XSD_SCHEMA_LOAD_FAILED` / `XSD_DEPENDENCY_MISSING` | Local schema directory incomplete/bad; XSD validation not executed |
| `XML_SERIALIZATION_FAILED` | The canonical JSON cannot safely become XML |
| `LOCAL_XSD_INVALID` | Actual XSD engine ran and rejected XML; inspect sanitized `issues` |
| `LOCAL_XSD_VALID` | Actual local XSD engine ran and XML passes the installed schema; does NOT mean MyInvois accepted it |
| `officialSchemaValidated` | Always `false`: no MyInvois API validation was performed |
| `signaturePresent` / `submissionReady` / `submissionEnabled` | Always `false` |

**Do not presume Sale ID 3 passes normative XSD.** Passing earlier R4.3 compatibility is not normative proof; there may be important remaining structural gaps, which should be corrected in a subsequent patch only after observing the real XSD error list. The historical four lines and payable RM14.95 must remain unchanged.

## Test evidence

- Locally verified: R4.0–R4.4 targeted tests `27/27 PASS`, Node syntax checks.
- Included genuine Python/lxml engine self-test with a disposable **test schema** to show valid vs invalid XML; this self-test is **not** the official OASIS Invoice XSD.
- PC `npm test`, installed OASIS XSD provenance and Sale ID 3 XSD result remain pending.
