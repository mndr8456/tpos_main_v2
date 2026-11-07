# TPOS Main V2 — Customer Display R1.6

**Scope:** CD pairing persistence across Refresh, POS/CD expiry parity, existing-window reattachment, and return to Welcome/Promotions after receipt printing. Integrates with already installed Customer Display R1–R1.5, KDS R1 and POS. **No database migration.**

## Why this patch exists

1. R1.5 removed the pairing token from the URL (correct) but kept it only in RAM. Reloading `customer-display.html` lost that token and disconnected the display.
2. The cashier routes compared a JavaScript `Date` copy of `expires_at` against MySQL `UTC_TIMESTAMP(6)`, while the public viewer checked expiry directly inside MySQL. MySQL driver/timezone conversion could make the POS falsely report `CD_PAIR_EXPIRED` while the monitor still said `Connected`.
3. `Print Receipt` launched the print frame but did not dismiss the POS receipt. The owner-defined Thank You countdown therefore did not begin until someone clicked Close (with a 90-second safety fallback).
4. Reopening Customer Display after a POS refresh could navigate the already-named monitor to `about:blank`, destroying its current view and forcing a new token.

## Changes

- Save the 12-hour bearer token **only in `sessionStorage` of the CD window**. It survives Refresh, not a normal deliberate browser-window closure. The token is removed from the URL immediately and is not stored in durable localStorage or cookies. On a real invalid/replaced/expired token the tab's stored pairing is cleared. Network outages do not clear it. The backend validates token hash, tenant, branch and expiry on every public view.
- POS session expiry is checked against `UTC_TIMESTAMP(6)` entirely within MySQL. The JavaScript date object is no longer sent back as a query parameter.
- `Print Receipt` prints via the existing isolated, cloned receipt iframe; when the print dialog returns, the POS receipt is dismissed. CD then shows remaining Cash Change if any and the OWNER-configured Thank You interval, followed by Welcome/Promotions.
- When POS is refreshed but the named Customer Display window is still open and Connected, `Open Customer Display` reattaches/focuses that window without rotating its token or replacing the viewer with `about:blank`.
- All POS sale, cash drawer, shift, inventory, tax, KDS and financial posting modules are unchanged.

## Installation on Windows PC

1. Back up `D:\www\tpos_main_v2` and the V2 tenant database. Stop backend and frontend.
2. Extract **Changed Files Only** ZIP into `D:\www`, selecting **Replace** for matching files. Do not replace `.env`, overwrite the V1 root or run a migration.
3. From Command Prompt:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node scripts/verify-customer-display-r1.js
npm run db:kds
npm run db:customer-display
node --test tests/customer-display-stable-session-r16.test.js
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

4. Both 040 and 041 must report `CURRENT`. **Do not use `--apply` again**.
5. Restart both servers. On first run of the patch, close the **old CD window once**, hard-refresh the POS tab, and click **Open Customer Display** to create one new pairing. Following Refreshes of that same CD window must retain `Connected` without pairing again.

## Live acceptance sequence

1. Start two browser windows, one for POS, the other for `customer-display.html`, on the same PC or move CD to the second physical monitor.
2. Pair once. Verify `Connected`. Refresh **only the CD window** (F5 / Ctrl+R) and verify `Connected` returns without clicking Pair in POS. Verify token is not shown in the address bar.
3. Add items and check quantity, price, scope and backend total on the CD.
4. Open Cash Payment, confirm a posted sale, see Cash Change then the OWNER-configured Thank You message. Click `Print Receipt`, finish the printer dialog; the POS receipt closes, and CD returns to Welcome/Promotions after the configured success period. Also test Close without printing.
5. Start a second order **using the same pairing**. Check no `CD_PAIR_EXPIRED` toast and CD reflects the new order. Test Held → Resume and a QR payment attempt. Only a real posted payment is allowed to show SUCCESS.
6. Refresh the POS tab while leaving CD open, then click Open Customer Display. It must focus the connected named window, not blank/re-pair it.
7. A true pairing expiry after 12 hours, a deliberate re-pair from another window, or closing the CD browser window and opening a fresh one requires pairing again. That is a security constraint, not a normal post-payment disconnect.

## Operational limits

- The 12-hour limit is unchanged, and `sessionStorage` does **not** guarantee retention after manually closing the browser/window or using private browsing policies that block tab storage. This patch addresses accidental Refresh and reuse of a still-open paired monitor.
- Two monitors are two physical outputs; the browser's pairing is tied to the Customer Display window, **not** to the monitor hardware. Moving the CD window to monitor two and using Full Screen does not require a new pair.
- Browser printing behavior can differ across Chrome versions, printer drivers and print dialogs. Test the actual printer before accepting R1.6.
- No `npm test` or Vite build result replaces a real PC acceptance test.
