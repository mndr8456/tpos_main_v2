# TPOS Main V2 — Customer Display R1.1 Pairing / Connection Fix

**Status:** Fix candidate for live PC acceptance. Customer Display R1 is NOT LULUS / LOCKED.

## Incident

After CASHIER selected **Open Customer Display**, POS displayed a green message saying it was paired, but the new customer-facing page showed **Disconnected** / **Display Not Connected** and a generic **Session expired or unavailable** message. Migration 041 was previously confirmed `CURRENT`, CD R1 23/23 tests passed, and the full backend regression 716/716 passed. Those technical tests did not prove a successful live paired public-view request.

## Changes (complete files only)

1. `backend/src/customer-display.js`: Pair now performs an anonymous/public token readback against the tenant database *after committing the pairing* and verifies that the correct branch and cashier exist and runs the **complete public-view handler** successfully **before** returning `{viewReady:true}`. Read queries for session, merchant and active branch are separated to make public lookup failures unambiguous. Status evaluation uses a database-side UTC comparison. No sale, stock, cash or journal writes were added.
2. `frontend/src/PosTerminal.jsx`: POS only reports pairing as successful if the backend confirms `viewReady:true`; it will close the attempted popup and show the backend error if readiness fails.
3. `frontend/public/customer-display.js`: Live display now distinguishes an HTTP error from network failure, shows safe server error codes (for example `HTTP 403 · INVALID_ORIGIN` or `HTTP 500 · INTERNAL_ERROR`), automatically retries every two seconds, and **does not** incorrectly describe every error as an expired session. The token is retained in memory only and is still removed from the visible URL; it is never printed in errors.
4. `backend/tests/customer-display-pairing-r11.test.js`: Tests browser token handling, real viewer rendering via simulated response, explicit HTTP failure, anonymous backend IDLE response, successful pairing readback and failed readback.

**No migration, SQL changes, `.env` edits, reset, data deletion, payment or KDS changes.** The exact original backend cause cannot be distinguished from the screenshot alone; this patch ensures that POS no longer claims a pairing has succeeded before its backend public lookup is ready, and makes any further failure attributable to a safe, visible API error code.

## Install on Windows PC

1. Back up V2 source. Stop backend and frontend, extract the ZIP into `D:\www` with **Overwrite / Replace**. Do not edit `.env` or database 041.
2. Check:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
npm run db:customer-display
node --test tests/customer-display-pairing-r11.test.js
node --test tests/customer-display-r1.test.js
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

3. Restart backend/frontend. In the POS window sign in and open a Cash Shift, then click **Open Customer Display** again. **Do not refresh the old disconnected CD window**: its token has been deliberately erased from the URL and not stored locally. The new POS pairing action produces a new token.
4. Confirm the display says **Connected** and shows welcome/promotions with no order, then add a test product and check item, quantity, unit price and live total. Test Cash and QR through existing protected POS workflow, using legitimate payment verification only.
5. If the problem persists, capture the **exact** code now shown in the Customer Display (for example `HTTP 500 · INTERNAL_ERROR`) and the corresponding backend console `REQUEST_FAILED` code/message. **Do not paste the token, session cookie, credentials, transaction evidence or payment secrets.** A `HTTP 403 · INVALID_ORIGIN` indicates proxy/origin rejection; `HTTP 404 · CD_PAIR_INVALID` indicates token/session mismatch or expiry; `HTTP 500 · INTERNAL_ERROR` indicates a backend read exception. These are diagnostic categories, not assumptions about the initial screenshot.

## Acceptance

- POS does not show pairing success when public token readback fails.
- A correctly paired display shows **Connected** without exposing a token.
- Distinct safe HTTP/network errors appear when needed, with automatic retry.
- OWNER media/settings, WAITER, KDS, POS cash/QR checkout, receipts, tax, stock and accounting remain unchanged.

**Status after packaging:** Development tests PASS / Live PC pairing acceptance PENDING.
