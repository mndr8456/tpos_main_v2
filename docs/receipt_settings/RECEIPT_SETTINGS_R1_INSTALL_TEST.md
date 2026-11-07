# TPOS Main V2 — Receipt Settings R1 (Phase 2)

## Baseline
`tpos_main_v2 LATEST_071120262210.zip` + approved Company Profile R1 → R1.1 → R1.2 patches. Apply changed files **after** Company Profile R1.2 has been installed and accepted.

## Installation
1. Back up `D:\www\tpos_main_v2`, databases and configuration before replacing files.
2. Extract patch at `D:\www\tpos_main_v2`, retaining paths.
3. In backend terminal:
   ```bat
   cd /d D:\www\tpos_main_v2\backend
   npm run db:receipt-settings
   npm run db:receipt-settings -- --apply
   npm run db:receipt-settings
   npm run check
   node --test tests/receipt-settings-r1.test.js tests/pos-cash-checkout-atomic-r1.test.js tests/pos-receipt-sst-owner-switches-r14.test.js
   npm test
   ```
4. In frontend terminal:
   ```bat
   cd /d D:\www\tpos_main_v2\frontend
   npm run build
   ```
5. Restart backend/frontend and sign in again as OWNER/ADMIN to load the new permission grants.

Migration 043 is **read-only by default**, `--apply` explicitly changes tenant schema. Expect MISSING_OR_PARTIAL → APPLIED → CURRENT per tenant. Do not run against V1. NO changes to historical POS sale, accounting, or Customer Display tables.

## Live PC acceptance
1. Settings > Receipt Settings appears for OWNER/ADMIN. Header is read-only, fetched from Company Profile (Business Name, Address 1/2/3, Postcode, City, State, Country).
2. Edit Receipt Footer from `Thank you.` to a different message; live preview updates before Save.
3. Save (compact). Notifies success, records Activity Log.
4. Click icon-only Refresh: notification clears without browser reload; persisted message reloads.
5. Click icon-only Activity Log: prior/next footer entries, actor/time shown.
6. Cash checkout: receipt prints new footer, keeps same tax, total, number, layout; old posted receipts reprint with their original (`Thank you.`) footer.
7. After changing footer again, reprint the already-posted receipt; it must preserve original footer.
8. Noncash (manual verified) checkout: receipt prints its posting-time footer; reprint retains it. Customer Display pairing/status, after-print return and KDS unchanged.
9. Cross-tenant: each tenant has independent receipt setting and audit. A CASHIER cannot access Settings APIs or mutate the footer.
10. MyInvois QR is **not** implemented in Phase 2. Phase 3 will control its presence with explicit OFF/ON; no provisional or fake QR is printed.

## Testing performed in patch environment
- Full backend static/mock regression: **777/777 PASS**.
- Backend JavaScript syntax checks: PASS.
- Frontend Vite build: **NOT VERIFIED here** (offline npm cache missing `yallist`); **must run on user PC**.
- Live MySQL/PC checkout and print: **PENDING**.

## Compatibility notes
- Before migration 043, do not accept new checkout requests: newly-posted sales now require the immutable footer snapshot row. Run 043 on active tenants first.
- Historically posted sales that predate 043 display the original default `Thank you.` (rather than today's mutable footer).
- Company Profile remains the only editing source for header fields. Currency, SST, receipt sequence, payment logic, BNM rounding, and Customer Display R1.7 are not redesigned.
