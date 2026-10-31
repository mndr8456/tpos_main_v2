# TPOS Main V2 — Payment Methods R1 Acceptance

Source baseline: `tpos_main_v2-LATEST_311020261021.zip`, with previously accepted Product KPDN / SST label changes retained in the working source. The ZIP contains **only changed files** to install into the current PC source.

## Scope

- Branch-specific methods: Cash, Debit Card, Credit Card, Bank Transfer, DuitNow QR, E-Wallet and SARA/MyKasih.
- DuitNow QR and E-Wallet are **in one form** and each has its own Active/Inactive switch, QR/logo image Choose File and provider API fields.
- Only OWNER/ADMIN can change configuration; MANAGER, ACCOUNTANT, SUPERVISOR have read-only access. CASHIER has no settings access.
- Image is stored as private BLOB inside the corresponding tenant database (PNG/JPEG/WebP <=1 MiB). Viewing requires authentication.
- API Key is encrypted at rest using AES-256-GCM and is never returned to a client, printed in logs, or included in audit.
- SARA cannot be activated until authorized MyKasih processing is implemented. Its merchant/terminal IDs can be recorded for future integration.
- All non-cash methods are initially INACTIVE; CASH is ACTIVE by default. These are **configuration states only**, not working payment provider transactions.
- No checkout, revenue journal, QR confirmation, refund, merchant settlement, card terminal or MyKad authorization implemented in this stage.

## Install

Extract this ZIP into the **existing project root** `D:\www\tpos_main_v2`, not into a new folder. Do **not** overwrite `.env`, re-run old SQL or replace the full project. Review the manifest first.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:payment-methods
npm run db:payment-methods -- --apply
npm run db:payment-methods
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Expected migration for active tenants: `MISSING → APPLIED → CURRENT`; existing tenants already current show `CURRENT` immediately. Migration file is **016_tenant_payment_methods.sql**. Restart backend, logout and login again to refresh permission grants. There is no need to reapply migrations `001`–`015`.

## Provider credential setup

**Only if API Key/Secret will be saved:** generate a strong key once on the backend PC:

```bat
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Privately add `PAYMENT_METHODS_ENCRYPTION_KEY=<64 hexadecimal characters>` to the existing `backend/.env` manually. Never share this value or include it in a ZIP or screenshots. Restart backend. Back up the key securely. **Losing or changing it makes previously saved provider secrets unusable**; there is no rotation interface in R1. Without this key, saving API Keys is deliberately rejected with `PAYMENT_ENCRYPTION_KEY_NOT_CONFIGURED`, but non-secret settings, activation controls, and images still work.

The API URL is **HTTPS only**, and the R1 server stores it but never contacts that endpoint. Do not enter API passwords in URL, merchant ID or free-text fields.

## PC acceptance checklist

1. As OWNER, open **Payment Methods**. Confirm the correct business and branch. Cash should be ACTIVE by default; other methods INACTIVE.
2. Switch DuitNow QR ACTIVE. Upload a PNG/JPG/WebP image using **Choose File**, verify its preview and reload the page. It must persist.
3. Under **2. Provider API / Bank Details**, save provider name, HTTPS API URL and optional merchant reference. Verify saved state without exposing credential value. If encrypted API credential is configured, enter it and confirm UI shows `A key is saved` without displaying it.
4. Repeat for E-Wallet in the **same** Digital Payment form. Each channel must maintain independent activation and image/API settings.
5. Change branch, if available, and verify its independent settings and image. Check the change Activity Log (OWNER/ADMIN).
6. Test an invalid file, an image larger than 1 MiB, HTTP API URL, missing encryption key when saving API Key and a duplicate image replacement. Expect validation errors and no unintended changes.
7. As MANAGER/ACCOUNTANT/SUPERVISOR, verify settings are view-only and that direct PUT/POST requests are rejected (403). CASHIER should not have this menu or API access.
8. SARA/MyKasih must show INACTIVE and a note that authorized official integration is needed. It must refuse activation, even via direct API request.
9. Verify Product/Discount/Voucher/Shift Cash/Log Drawer remain unaffected; backend `npm test` and frontend `npm run build` must PASS.

## Release gate

R1 only establishes methods/settings; the real POS can only mark a sale PAID after verified transaction processing. Static DuitNow QR **does not** mean money received. Provider API URLs/credentials are reserved for a future authorized adapter. SARA is not a generic wallet and requires MyKad and approved product/merchant validation.

**Status: local targeted tests passed; frontend Vite and live MySQL/PC acceptance pending. Do not mark LOCKED until live proof.**
