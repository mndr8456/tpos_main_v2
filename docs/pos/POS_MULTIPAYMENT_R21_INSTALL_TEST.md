# TPOS Main V2 — POS Multi-Payment R2.1 (partial, safe foundation)

## Source baseline
`tpos_main_v2 - Latest_05112026_1853.zip`, with accepted Role Permission R1 and Payment Methods Read-Only R1.1 patches. Copy complete changed files from ZIP into `D:\www\tpos-main-V2`. Do not copy a new `.env` file over the PC configuration. Do not modify V1 databases.

## EXACT scope delivered

| Method | R2.1 | Verification |
|---|---|---|
| Cash | Existing accepted route, unchanged in business logic | Cash received, existing atomic posting |
| DuitNow Static QR | Manual verified non-cash (ACTIVE, merchant QR image uploaded) | Cashier checks recipient bank/eWallet merchant transaction, exact amount and reference; requires redacted evidence image |
| E-Wallet Static QR | Same as Static QR | Manual verification in merchant account |
| Bank Transfer | Manual verified non-cash (ACTIVE) | Cashier checks incoming bank transaction (not merely customer screenshot) |
| Standalone Credit/Debit card terminal | Manual terminal reconciliation (ACTIVE + terminal reference configured) | Cashier checks physical terminal APPROVED receipt; records approval reference and redacted receipt image; NOT integrated terminal status |
| Bank / eWallet / card integrated terminal | **NOT CONNECTED** | Requires actual provider SDK/API, merchant contract, device pairing, authenticated signed provider response |
| SARA/MyKasih/MyKad | **NOT CONNECTED — blocked** | Requires official MyKasih merchant/terminal integration, eligible-item catalog and provider authorization |

**IMPORTANT:** R2.1 does NOT claim connected-terminal, card network or SARA live integration. Saving a provider API URL, merchant number or API key does not change that. A cashier reference is an auditable record of a human verification, not bank API verification.

## Schema and security
- `035_tenant_pos_multi_payment.sql` adds tenant-local `pos_payment_attempts`, immutable `pos_payment_attempt_audit`, 15-minute short-lived public customer display token hashes, and separate cash vs noncash journal source and payment method ENUM.
- Existing cash sales still require `cash_received >= total`. Noncash sales require `cash_received = 0` and `cash_change = 0`; closing cash shift counts only actual cash methods.
- No card PAN, CVV, PIN, MyKad ID or OTP input is provided or stored. Transaction evidence must be redacted by staff and is AES-256-GCM encrypted at rest using a separate environment key.
- Never collect personal bank screenshots that include passwords, full card numbers, MyKad, account logins or balances. Restrict evidence access and retention under the organization's privacy policy.
- Attempt IDs, cashier ownership, branch access, open shift, locked draft version, exact server quote and stock are checked on the server. Duplicate reference hashes and repeated request keys are rejected. Posting, inventory, journal, table release and audit are atomic.
- Customer Display uses a 256-bit random token in a URL fragment (not request logs), scoped to a tenant, expires after 15 minutes; only merchant name, static QR image, amount and coarse payment state are exposed.
- Existing Role Permission matrix automatically sees `pos.checkout.manual` as a special permission; it is initially copied from CASH checkout roles **once only** in migration 035. Subsequent changes are not reset by installer reruns.

## Install — stop backend before migration
1. Back up the V2 central and tenant databases and project folder. Ensure migrations 016, 023, 024 and 034 are CURRENT. This ALTER may lock large `pos_sales` or `accounting_journals` tables; use a maintenance window.
2. Extract ZIP **Changed Files Only** into `D:\www\tpos-main-V2`, preserving directory structure.
3. Add a secret key to your **existing** `backend/.env` (do not put it in source control):

   ```cmd
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Copy the generated 64-hex value into:

   ```text
   PAYMENT_EVIDENCE_ENCRYPTION_KEY=<YOUR_64_HEX_RANDOM_SECRET>
   ```

   Keep secure encrypted backups of this key; losing it makes previously stored evidence unrecoverable. Use the same key after restarts; never rotate without re-encrypting existing evidence.
4. Apply the migration **once per ACTIVE tenant** using the supported installer (read-only by default):

   ```cmd
   cd /d D:\www\tpos-main-V2\backend
   npm run check
   npm run db:pos:multi-payment
   npm run db:pos:multi-payment -- --apply
   npm run db:pos:multi-payment
   node --test tests/pos-multi-payment-r21.test.js
   npm test
   cd /d D:\www\tpos-main-V2\frontend
   npm run build
   ```

   Expected: tenant MISSING → APPLIED → CURRENT, failed=0. If the migration fails, **do not keep re-running blindly**. Capture the error and check schema; restore backup if necessary.
5. Restart backend and frontend. Log out/in to reload `pos.checkout.manual` role grant.

## PC acceptance tests
1. **Cash regression**: existing Cash Checkout and receipt work, stock decrements once and cash shift reconciles only cash.
2. **DuitNow Static QR**: OWNER uploads actual merchant QR and enables method; cashier opens an active draft, selects DuitNow QR, sees the configured image, opens **Show on Customer Display** in a second screen; no sale is yet posted.
3. **Static QR verification**: ONLY after actual bank merchant account evidence is inspected, attach a redacted PNG/JPEG/WebP image (<1 MiB), type the genuine reference, tick manual verification and click Pay. Ensure one sale, one payment reference, one noncash journal, one stock issue and customer display success. Test mismatched amount in backend API, empty/duplicate reference, missing photo and duplicate click; all must fail or be idempotent.
4. **Bank Transfer**: enable method in Settings; check incoming account and exact amount; record reference, photo and verification. Sale should post to bank clearing, not cash drawer.
5. **Card terminal standalone**: enable Debit/Credit Card with a configured terminal reference. Confirm only from an *actual approved physical terminal receipt*, not a fictitious code. Label the receipt as **MANUAL_TERMINAL**. The application is not connected to the terminal API.
6. **SARA**: remains locked and no manual approval, so an unauthorized merchant cannot claim SARA funds. This is correct until official integration is implemented and certified.
7. **Security**: another cashier/branch cannot read or finalize the attempt; unauthenticated customer display sees only the limited data for a valid token; expired token is refused; unauthorized staff cannot read saved proof; no API keys leave Payment Methods.
8. **Protected versions**: Leave Requests R1.6, Payment Methods R1.1, Operational Sidebar R1 and Role Permission R1 continue working.

## Not yet complete: provider-connected terminals & MyKasih
A real provider adapter requires the contracted **acquirer and terminal brand/model**, vendor-certified integration mode (local secure agent / cloud API / signed webhook), merchant/terminal IDs, sandbox test credentials, device pairing procedure, callback signature specification, settlement/reversal/refund behavior, and end-to-end certification. No universal provider protocol can be safely assumed. Do not enable any automatic PAID path without vendor verification and production accreditation.

**SARA/MyKasih:** separate official merchant authorization, approved product barcode/catalog rules, MyKad/chip terminal flow and provider-confirmed payment result. **Never** treat the recipient's MyKad or a manually typed reference as payment confirmation. Raw MyKad data/PIN must not enter TPOS.

Provider-adapter phase must use the same attempt/sale/inventory/journal ledger, but only transition to PAID from a verified provider authorization, with replay protection, exact amount and currency checks, merchant/terminal identity checks, reconciliation and refund/unknown status handling. It is **pending external provider specifications and access**.
