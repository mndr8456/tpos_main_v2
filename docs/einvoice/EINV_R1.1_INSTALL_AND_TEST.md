# TPOS V2 e-Invoice LHDN EINV-R1.1 — Installation and PC tests

## Scope
Settings only. No customer QR, document submission, validation QR or consolidation. MyInvois defaults OFF. No changes to Customer Display 041, Company Profile 042, Receipt Settings 043 or POS receipt rendering.

## Required secret
In `backend/.env` add `EINVOICE_ENCRYPTION_KEY=<64 hexadecimal characters from a cryptographically secure generator>` and keep it outside Git/ZIP. On Windows PowerShell generate: `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`. Do not rotate without a credential-reencryption plan; different tenant/environment values remain independently encrypted. Credentials are never returned by GET.

## Installation
Unzip changed files at `D:\www\tpos_main_v2`. Back up code and DB. Run:

```
cd /d D:\www\tpos_main_v2\backend
npm run db:einvoice-settings
npm run db:einvoice-settings -- --apply
npm run db:einvoice-settings
npm run check
node --test tests/einvoice-settings-r11.test.js
npm test
```

Frontend:
```
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart backend and frontend. Sign in OWNER/ADMIN and open Settings > e-Invoice LHDN.

## Acceptance
1. Existing tenant starts OFF; normal receipts remain without MyInvois QR.
2. Sandbox and Production base URLs are fixed/read-only and credentials are separate.
3. Company name, TIN and registration number are read-only from Company Profile.
4. Enter both credentials and Save; no credentials echoed in subsequent GETs. Run Test Connection with internet access.
5. ON cannot save without supplier TIN, saved credentials or successful connection test.
6. Check separate environment testing and OFF switching. Check Activity Log and Refresh clears notices.
7. Verify cashier cannot view/manage settings. Verify POS cash and noncash, CD, KDS and Receipt Settings remain unchanged.

## Note
An OAuth login success proves credentials, NOT invoice validation or LHDN acceptance. The later QR/form phase needs a customer-reachable HTTPS address. This R1.1 does not invent localhost QR links. Production Hosting remains on HOLD.

Official SDK references: https://sdk.myinvois.hasil.gov.my/api/07-login-as-taxpayer-system/ and https://sdk.myinvois.hasil.gov.my/faq/
