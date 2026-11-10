# C4.3 R4.6 — Signed JSON v1.1 & One-Shot MyInvois Sandbox Submission (PC acceptance pending)

**Status:** PATCH READY, not accepted by LHDN; signing/certificate integration must be validated with actual authorized Malaysian CA material, then sandbox API result `Valid`/`Invalid` must be obtained. No production submission is implemented.

## Scope

- Uses the canonical R4.3 SDK-style JSON only after R4.4 local XML/XSD validation and R4.5 offline selected rules review.
- Creates MyInvois SDK JSON v1.1 signing properties and XAdES-like signature structures, SHA256 digests and RSA signature. Local cryptographic proof is NOT Malaysian CA/LHDN approval.
- Cert profile subprocess checks **certificate TIN/BRN against current tenant supplier**, non-repudiation (contentCommitment), document-signing EKU, validity, Malaysia country, direct CA signature and operator-pinned SHA256 issuer CA certificate. It does not claim to verify CA's inclusion in MCMC recognized CA list: the operator must independently verify issuer provenance.
- Fixed Sandbox-only API endpoints for OAuth, Submit Documents, Get Submission, Get Document Details (the last only for Invalid).
- One deliberate OWNER-controlled submission with exact preview digest and acknowledgement; uses existing tenant migration 046 (`einvoice_documents`, `einvoice_submission_attempts`, `einvoice_document_audit`). No new migration. **One attempt per sale in Sandbox; no automatic retry.** Unknown status remains blocked for manual reconciliation, including if a network failure occurred after the request reached LHDN.
- Signed JSON is stored encrypted with the existing `EINVOICE_ENCRYPTION_KEY` AES-GCM mechanism. No private key, bearer tokens or raw buyer identity are returned in the API responses.
- No POS sale, voucher, inventory, cash shift, accounting, or customer display changes. No frontend changes.

## Source files in patch

1. `backend/src/app.js` (new separately permission-gated routes)
2. `backend/src/einvoice-sandbox-c43-r46-core.js` (signing, document safety gates, envelope, safe response parsing)
3. `backend/src/einvoice-sandbox-c43-r46.js` (Sandbox-only protected orchestration, one-shot ledger and polling)
4. `backend/scripts/verify-einvoice-certificate-c43-r46.py` (offline cert policy; requires Python cryptography)
5. `backend/tests/einvoice-sandbox-c43-r46.test.js` (tests)
6–7. `backend/tests/fixtures/r46-test-only.pem`, `backend/tests/fixtures/r46-test-only.key` — expired/untrusted **SELF-SIGNED DUMMY TEST MATERIAL**, not a real credential and cannot pass R4.6 CA/identity authorization. Do not configure as actual signer.
8. This README.

## Installation prerequisites

1. Backup/diff current `backend/src/app.js`; unzip with project structure rooted under `D:\www\tpos_main_v2`.
2. Confirm migration 046 is CURRENT. Do not rerun with `--apply` unless existing tenancy schema is missing and the installer review confirms it is safe. These tables must exist, together with permissions `einvoice_documents.view` and `einvoice_documents.submit`.
3. Existing Settings → e-Invoice must have **SANDBOX**, **Enabled**, and verified OAuth credentials. No production activation.
4. Python `lxml` from R4.4 is still used for XSD. Install a second dependency for cert profile checks:

   ```powershell
   cd D:\www\tpos_main_v2\backend
   .\.venv-ubl\Scripts\python.exe -m pip install cryptography
   .\.venv-ubl\Scripts\python.exe -c "from cryptography import x509; print('CRYPTOGRAPHY_OK')"
   ```

5. Obtain a legally authorized **organization signing certificate and matching private key** from an MCMC-recognized Malaysian CA suitable for MyInvois v1.1; check taxpayer TIN/BRN and representative permissions independently. Install on a protected directory **outside the web/project tree** with OS restricted access (e.g. `C:\TPOS-Private\myinvois\`). **Never upload key material to this chat.** A direct issuing CA certificate PEM is required by this first-party verifier. If your CA issues through a different chain, do not bypass verification; instead review chain support separately.

6. Set server-only environment variables in backend `.env` (example filenames only; never paste credentials):

   ```dotenv
   EINVOICE_R46_SANDBOX_SEND_ENABLED=false
   EINVOICE_R46_CERT_PEM_PATH=C:\TPOS-Private\myinvois\signer.pem
   EINVOICE_R46_KEY_PEM_PATH=C:\TPOS-Private\myinvois\signer-private.pem
   EINVOICE_R46_CA_PEM_PATH=C:\TPOS-Private\myinvois\issuer-ca.pem
   EINVOICE_R46_ISSUER_CA_SHA256=<verified-64-hex-sha256-of-issuer-ca-DER>
   # EINVOICE_R46_KEY_PASSPHRASE=... (only if encrypted private key)
   ```

   Compute DER certificate SHA256 fingerprint locally, compare against the **independently verified issuing CA**, not blindly against any emailed self-signed certificate:

   ```powershell
   .\.venv-ubl\Scripts\python.exe -c "from cryptography import x509; from cryptography.hazmat.primitives import hashes; p=r'C:\TPOS-Private\myinvois\issuer-ca.pem'; print(x509.load_pem_x509_certificate(open(p,'rb').read()).fingerprint(hashes.SHA256()).hex())"
   ```

7. Do not enable the send gate yet; complete read-only preflight and OWNER verification. When all checks pass on a **fresh legitimate Sandbox test sale**, and the OWNER explicitly approves sending, set `EINVOICE_R46_SANDBOX_SEND_ENABLED=true` and restart backend. The flag controls **Sandbox only**. Never set a production base URL. Remote API acceptance is not guaranteed.

## PC tests

```powershell
cd D:\www\tpos_main_v2\backend
npm.cmd run check
node --test tests/einvoice-sandbox-c43-r46.test.js
npm.cmd test
```

Check read-only preflight for a sale with PAID receipt and captured buyer request. **Historical Sale ID 3 should NOT be submitted**: its issuance timestamp is past the allowed ordinary invoice window. Never rewrite it to make tests pass. Use a new real test sale and its own buyer request from the existing TPOS process.

```javascript
const saleId = Number(window.prompt('Enter NEW verified paid Sandbox sale ID (NOT Sale ID 3)'));
const r = await fetch(`/api/v2/einvoice/sandbox/preflight/${saleId}`, {credentials:'same-origin',cache:'no-store'});
const p = await r.json();
console.log({http:r.status, status:p.status, ready:p.ready, sendEnabled:p.sendEnabled, unsignedDigest:p.unsignedDigest});
```

The read-only preflight can be run with the send gate off and is safe. **Do not run the next command until the actual OWNER knowingly authorizes a single Sandbox submission**, the signing certificate has independently verified legal provenance, and the preflight `ready === true`.

```javascript
// OWNER-APPROVED, REAL SANDBOX NETWORK WRITE; NOT A DRY RUN.
const approved = window.confirm('Send ONE signed document to LHDN Sandbox now? This cannot be automatically undone.');
if (approved && p.ready && p.sendEnabled) {
 const send = await fetch(`/api/v2/einvoice/sandbox/submit/${saleId}`, {
  method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({acknowledgement:'I_CONFIRM_SANDBOX_SUBMISSION',expectedUnsignedDigest:p.unsignedDigest})
 });
 console.log({http:send.status, ...(await send.json())});
}
```

**IMPORTANT:** HTTP `202` and `SUBMITTED` are asynchronous initial acceptance only, **never `Valid`**. Status monitoring is explicit and server-audited. Wait at least five seconds between refreshes.

```javascript
const status = await fetch(`/api/v2/einvoice/sandbox/status/${saleId}`,{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
console.log(status);
const refreshed = await fetch(`/api/v2/einvoice/sandbox/status/${saleId}/refresh`,{
 method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
 body:JSON.stringify({acknowledgement:'I_CONFIRM_SANDBOX_STATUS_REFRESH'})
}).then(r=>r.json());
console.log(refreshed);
```

When status becomes `INVALID`, request sanitized validation steps (no private details):

```javascript
const errors = await fetch(`/api/v2/einvoice/sandbox/invalid-details/${saleId}`,{credentials:'same-origin',cache:'no-store'}).then(r=>r.json());
console.log(errors);
```

A result of `VALID` returned after Get Submission confirms that **this particular signed invoice** was marked Valid by MyInvois Sandbox. Production readiness, official system approval and CA authenticity are separate concerns.

## Important gates / limitations

- OWNER role **and** tenant permissions are required. Admin cannot submit merely because a grant exists.
- Source invoice, real issued timestamp, vouchers, tax mapping and accounting remain immutable. No backdating or fabricated identifiers.
- `SEND_ENABLED=false` is the default; no background submission or retries, and no network call during module import or automated tests.
- A single failed/unknown attempt is intentionally locked; use the `SUBMISSION_UNKNOWN` manual investigation path. Do **not** bypass the unique key or reset records to send again.
- This is the **first implementation of SDK signed JSON**; only a real Sandbox test with legally issued certificate can prove whether the LHDN signature validator accepts its exact XAdES transliteration and current business data. A local RSA verification is not equivalent.
- R4.4 XSD is for unsigned **XML**. R4.6 submits **signed JSON** per MyInvois SDK, not signed XML. The MyInvois server remains authoritative for signed JSON validation.
- `einvoice_documents` existing migration 046 (no new database changes). Audit and anti-duplicate are isolated per tenant. Production Hosting stays HOLD and **Production Submission is NOT implemented**.

Official SDK references: https://sdk.myinvois.hasil.gov.my/signature-creation-json/ ; https://sdk.myinvois.hasil.gov.my/signature/ ; https://sdk.myinvois.hasil.gov.my/einvoicingapi/02-submit-documents/ ; https://sdk.myinvois.hasil.gov.my/einvoicingapi/06-get-submission/ ; https://sdk.myinvois.hasil.gov.my/einvoicingapi/08-get-document-details/ .
