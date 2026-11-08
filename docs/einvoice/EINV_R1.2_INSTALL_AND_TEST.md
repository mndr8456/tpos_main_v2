# TPOS Main V2 — EINV-R1.2 Customer Request QR and Buyer Form

Status: PATCH READY / PENDING LIVE PC ACCEPTANCE. No submission to LHDN in this phase.

## Baseline

Apply to a working TPOS Main V2 already containing MyInvois Settings R1.1.3 LULUS / LOCKED (OAuth Sandbox verified, migration 044 CURRENT) and approved Receipt Settings R1.3, Company Profile R1.2 and Customer Display R1.7.

## Scope

- New additive tenant migration `045_tenant_einvoice_requests.sql`, read-only verification by default.
- Receipt QR is a **customer request URL**, NOT MyInvois validation QR. It appears after the approved footer only for a paid cash/noncash receipt, when tenant MyInvois is ON and a safe public HTTPS URL is configured.
- Cash and noncash payment success remain authoritative. Failure to issue QR cannot roll back sales, alter taxes, payment, stock or the Customer Display.
- Customer request accessible through same-origin public URL `/einvoice/request/t<tenant>.<64-hex>`, protected by random token; only token digest is indexed, encrypted token stored to allow reprint/reuse; name and amount only are visible on valid token.
- One request per sale, encrypted buyer form, audit trail, server-side validation, no duplicate submission.
- SDK Invoice v1.1 Buyer fields + seven address fields: Address 1/2/3, Postcode, City, State, Country. Malaysia state code 01–16 and SDK country list 253 codes. Identity types NRIC / BRN / PASSPORT / ARMY, phone E.164, Buyer SST optional (processed according to SDK in future document builder).
- R1.2 stores request as status REQUESTED. It does NOT submit a signed UBL document to LHDN, does not claim validation, and does not produce official MyInvois verification QR.
- Token validity is restricted to end of sale month, based on buyer request timing in LHDN e-Invoice Specific Guideline 4.7 section 3.6.8. Confirm applicability against latest policy before live rollout.

## Installation (Windows)

Extract ZIP into `D:\www\tpos_main_v2`, preserving the folder structure.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:einvoice:requests
npm run db:einvoice:requests -- --apply
npm run db:einvoice:requests
npm run check
node --test tests/einvoice-request-r12.test.js tests/einvoice-settings-r11.test.js
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Expected tenant migration: `MISSING_OR_PARTIAL -> APPLIED -> CURRENT` and zero failures. Do not re-run migrations 041–044.

## Public HTTPS configuration

With deployment/hosting ON HOLD, **leave `EINVOICE_REQUEST_PUBLIC_BASE_URL` unset**. No request QR is displayed and approved normal receipts continue printing unchanged. You can test schema/build/UI code without activating public functionality.

When you explicitly approve a temporary HTTPS Microsoft Dev Tunnel test or a permanent secure public frontend domain, set in `backend/.env`:

```env
EINVOICE_REQUEST_PUBLIC_BASE_URL=https://YOUR-PUBLIC-FRONTEND-HOST
```

Use only a genuine HTTPS public frontend origin (no path/query, no localhost or loopback). It must serve the TPOS React app and forward `/api/v2` to the private backend. **Do not put a backend URL or the MyInvois API URL here.** Restart backend after changing `.env`. A rotating Dev Tunnel URL is suitable only for temporary tests; previously printed QR codes will stop working when its hostname rotates. Do not print real customer QR until permanent address and privacy controls are approved. Preserve `EINVOICE_ENCRYPTION_KEY` from R1.1 exactly; changing it makes saved credentials and customer requests unreadable.

## PC testing

1. Settings e-Invoice LHDN OFF: paid receipt has no request QR, normal cash/noncash checkout functions.
2. ON + verified credentials, but no public HTTPS base URL: still no QR; checkout normal.
3. With approved stable HTTPS frontend URL, ON, and a new paid cash sale: footer followed by customer-request QR, no LHDN verified claim. Test scan via a different mobile device.
4. Buyer form fields, country/state codes, SDK lengths, required TIN/ID/phone/address; invalid data fails on backend.
5. Submit once: success states `REQUESTED`; duplicate submit is rejected. No LHDN document submitted.
6. Repeat for noncash. Confirm unchanged receipt print (80mm), SST, footer snapshot, Customer Display and accounting postings.
7. Switch MyInvois OFF: public request endpoint disables further submission. TPOS POS remains normal.

## Official references

- https://sdk.myinvois.hasil.gov.my/documents/invoice-v1-1/
- https://sdk.myinvois.hasil.gov.my/codes/state-codes/
- https://sdk.myinvois.hasil.gov.my/files/CountryCodes.json
- https://www.hasil.gov.my/en/e-invois/rujukan-pelaksanaan-e-invois/garis-panduan/

## Testing disclosure

Merged V2 + accepted R1.1.3 + R1.2 tests ran in the code inspection environment (789/789 PASS). Targeted e-Invoice tests: 26/26 PASS. The archived V2 snapshot lacked migrations 042 and 043; approved historical migration files and the locked R1.3 receipt test assertion were restored to the isolated test fixture. The environment has no Vite/node_modules and no MySQL tenant or real public HTTPS tunnel. `npm run build`, migration 045 and end-to-end/mobile QR flow require user's Windows PC acceptance. Do not mark LULUS before explicit user approval.

## Resume after R1.1.3

The authenticated sandbox OAuth, V1-aligned `scope=InvoicingAPI`, and `Accept: application/json` from accepted R1.1.3 must be preserved. This ZIP intentionally does not include or overwrite `backend/src/einvoice-settings.js`, `frontend/src/EinvoiceSettings.jsx`, or `backend/tests/einvoice-settings-r11.test.js`. Only the R1.2 modules listed are delivered. No need to regenerate ERP credentials.

Deployment/hosting remains on HOLD: without `EINVOICE_REQUEST_PUBLIC_BASE_URL`, real buyer QR cannot be issued. Do not treat migration/build success as end-to-end QR acceptance.
