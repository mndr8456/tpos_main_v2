# TPOS Main V2 — Customer Display R1.2: Paid Sale Presentation Fix

## PC issue reproduced by evidence

- POS reports a real successful sale and opens the **Payment Receipt** dialog.
- Customer Display has a green **Connected** indication, but shows **Welcome/Promotions** rather than the cash change and bilingual Thank You screen.
- Prior R1 code used `pos_sales.posted_at` as the expiry clock: with default OWNER settings, it returned to Idle after only `5 + 12 = 17` seconds even while the cashier's receipt dialog remained open. Pairing and Vite build success alone did not verify this workflow.
- At approximately 680px browser width, the previous CSS stacked Order and Promotions vertically despite the approved side-by-side layout.

## R1.2 change (no migration)

- POS informs CD about a **committed** cash or verified noncash sale through `POST /api/v2/customer-display/sale-presentation` with `receiptOpen: true`. This is called **after** the original checkout endpoint succeeds. When cashier closes the receipt, the same endpoint receives `receiptOpen: false`.
- The backend confirms that the sale ID, draft ID, branch ID and cashier user ID match an existing `pos_sales` ledger record. Calls are authenticated and require `customer_display.publish`, POS rights and branch access. The endpoint writes only to `customer_display_sessions.snapshot` and its existing `customer_display_audit` ledger. No posting logic changes.
- After a verified CASH sale: display actual change for OWNER-configured `cash_change_seconds`, then Thank You **while cashier receipt is open**, bounded to 90 seconds if a receipt is abandoned. Once the receipt is closed, any remaining cash-change time is honoured and the full OWNER-configured `success_seconds` is displayed before returning to Idle.
- After an actually paid QR sale: Thank You while the receipt is open, followed by the full OWNER success timer after closing. Merely showing a QR, uploading evidence or entering a reference never triggers success.
- Replay and out-of-order open/close events never restart a completed presentation timer. New POS orders replace the previous presentation.
- Customer Display retains left-Order / right-Promotions layout on windows wider than 540px, including a 680px side-by-side test layout. At 540px and narrower the screen stacks for usability.
- When the cashier has a known paired popup but the CD receipt notification fails, POS shows a safe diagnostic without affecting the paid sale.

## Files in this Changed Files Only ZIP

- `backend/src/customer-display.js`
- `backend/src/customer-display-rules.js`
- `backend/src/app.js`
- `frontend/src/PosTerminal.jsx`
- `frontend/public/customer-display.css`
- `backend/tests/customer-display-r1.test.js`
- `backend/tests/customer-display-pairing-r11.test.js`
- `backend/tests/customer-display-sale-presentation-r12.test.js`
- This installation / acceptance guide

All files are full replacements; none are partial diffs. Existing migration `041` remains CURRENT. Do **not** rerun with `--apply`.

## Installation

1. Stop the V2 backend/frontend. Back up `D:\www\tpos_main_v2` and tenant DB (do not touch V1).
2. Extract ZIP to `D:\www` and overwrite the same paths, keeping `.env` untouched.
3. In `D:\www\tpos_main_v2\backend`:

```cmd
npm run check
node scripts/verify-customer-display-r1.js
npm run db:customer-display
node --test tests/customer-display-r1.test.js tests/customer-display-pairing-r11.test.js tests/customer-display-sale-presentation-r12.test.js
npm test
```

4. In `D:\www\tpos_main_v2\frontend`:

```cmd
npm run build
```

5. Restart backend and frontend. Hard refresh POS. Close the prior CD popup and use **Open Customer Display** again from POS (a token is removed from the URL after page load; reloading the old popup cannot restore it).

## Live acceptance tests (must be confirmed by USER)

1. Before payment: CD **Connected** and shows current POS items, quantities and correct totals on the left, with slides/video on the right (even when browsers are side by side at 680px).
2. CASH: enter enough tender and confirm. The CD must switch to full-screen **Change / Baki** and subsequently full-screen **Thank You** while POS Payment Receipt stays open. Wait 20 seconds **without closing the receipt**: CD must still show Thank You, **not Welcome**.
3. Close POS Payment Receipt. After the Owner-defined message duration, CD returns to Welcome/Promotions. If the receipt is closed early, the configured remaining Change duration still displays before Thank You.
4. QR: static QR and exact total appear only while pending. Evidence or reference alone cannot display Thank You. After manually verified and posted sale, CD shows Thank You until receipt close; timer then returns to Welcome.
5. Pairing is still cashier / branch-scoped; an unpaired session cannot display payment success; past sales cannot be claimed as unpaid new sales. KDS, WAITER, Stock, Payment Methods and POS Receipt remain unchanged.

**Status:** Development testing PASS; CD R1.2 **PENDING PC LIVE ACCEPTANCE**. Do not mark LULUS/LOCKED based on npm tests alone.
