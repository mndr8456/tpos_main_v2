# TPOS Main V2 — C4.3 R4.4 R1: Windows XSD Test Detection Fix

## Root cause

The original test `R4.4 can launch real Python/lxml XSD validator locally but does not claim LHDN validation` asserted that the validator **must** report an absent engine or schema. On a properly provisioned PC the engine instead returned `LOCAL_XSD_VALID` with `xsdExecuted=true`, causing a false negative. This is a test expectation bug, not a demonstrated XSD validation failure.

The optional positive/negative lxml test also used `py -3`, which is absent on this Windows PC even though `python` and `.venv-ubl/Scripts/python.exe` are installed. This patch uses the virtual environment when available, falls back to `python` on Windows, and uses `fileURLToPath` for cross-platform script paths.

## Changed files only

- `backend/tests/einvoice-ubl-xsd-c43-r44.test.js`: accept actual executed `LOCAL_XSD_VALID` or `LOCAL_XSD_INVALID`, while checking consistent execution flags, status and disabled official submission; keep clear failure for unknown results; run Python lxml checks with venv if present.
- This README.

No backend production sources, API routes, financial behavior, DB migration or MyInvois signing/submission are changed.

## Windows PowerShell test commands

```powershell
cd D:\www\tpos_main_v2\backend
npm.cmd run check
node --test tests/einvoice-ubl-xsd-c43-r44.test.js
npm.cmd test
```

Alternatively, Command Prompt (`cmd.exe`) allows `npm` normally. `npm.cmd` avoids PowerShell `.ps1` execution-policy restrictions without changing OS security policy.

## Live Sale ID 3 verification

After restarting backend, while logged in as OWNER or ADMIN:

```javascript
fetch('/api/v2/einvoice/ubl-xsd-validation/3', {credentials:'same-origin',cache:'no-store'})
.then(async response => { const d=await response.json(); console.log(JSON.stringify({http:response.status,status:d.status,issues:d.issues,xmlGenerated:d.xmlGenerated,normativeXsdExecuted:d.normativeXsdExecuted,normativeUblSchemaValidated:d.normativeUblSchemaValidated,officialSchemaValidated:d.officialSchemaValidated,submissionEnabled:d.submissionEnabled,lineCount:d.lineCount,payable:d.payable},null,2)); });
```

A successful test suite does **not** prove the real Sale ID 3 XML is valid against normative XSD. Only the real endpoint output with `LOCAL_XSD_VALID`, `normativeXsdExecuted:true`, `normativeUblSchemaValidated:true` establishes local validation. Official MyInvois validation remains false; signing and submission remain disabled. If endpoint reports `LOCAL_XSD_INVALID`, submit sanitized `issues` for a source-grounded XML correction.

## Local pre-delivery test

Reconstructed backend from the supplied latest source + R4.0 through R4.4 patches: 27/27 targeted tests PASS, 0 fail, 0 skip in the packaging environment. PC results still required; full backend regression not claimed.
