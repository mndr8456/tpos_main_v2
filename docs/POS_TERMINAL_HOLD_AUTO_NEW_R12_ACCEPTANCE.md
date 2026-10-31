# TPOS Main V2 — POS Terminal R1.2 Hold → Automatic New Order

This is a Changed Files Only update on top of the accepted POS Terminal Multitenant Layout R1.1. It does not replace other accepted modules.

## Changes

- Remove the standalone **New Order** button from the POS terminal operating bar.
- A user with `pos.cart.manage` and an OPEN Cash Shift gets an editable order automatically when entering POS.
- If that cashier already has a DRAFT in the same open shift, reuse it. Never auto-resume HELD orders.
- **Hold** is atomic: set the current order to HELD and create a fresh, empty DRAFT within the same tenant-database transaction. On failure both operations are rolled back.
- Repeating the same Hold request UUID returns the same successor order, not a duplicate.
- Held order remains available through **Held / Saved Orders → Resume**.
- **Discard** automatically prepares another editable DRAFT.
- The order's discount/voucher preview state clears when moving to a fresh order.
- Old-shift carts cannot create a new successor in a different Cash Shift.
- No new SQL or `.env` required. Existing migration `017` is unchanged.

## Installation

Extract the ZIP **to the actual TPOS Main V2 project root** (`D:\\www\\tpos_main_v2\\` as configured on your PC), replacing the complete matching files:

- `frontend/src/PosTerminal.jsx`
- `frontend/src/PosTerminal.css`
- `backend/src/pos-drafts.js`
- `backend/tests/pos-hold-autonew-r12.test.js` (new test)

Run:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart the backend and refresh the POS page. **Do not rerun migration 017.**

## PC acceptance tests

1. Login as an authorized cashier with a Cash Shift OPEN. Open POS. A DRAFT appears automatically; **no New Order button** is present.
2. Add two different products and verify quantity, branch price and subtotal.
3. Press **Hold** once. The previous order appears in **Held / Saved Orders** as HELD. The current order immediately changes to a **different order number**, with zero items and RM 0.00 subtotal. No extra clicks are needed.
4. Open **Held / Saved Orders**, select the held order, press **Resume**. The previous products, quantities and prices must still be there.
5. Press Hold again; a new empty order should appear. Repeated clicking or multiple browser refreshes must not create duplicate orders.
6. Press **Discard** on the current order, confirm. The terminal should prepare another empty order without a New Order button.
7. Close the Cash Shift; the POS must not create fresh orders under a closed shift. Previous saved records remain available for audit as permitted.
8. For a different tenant and branch, use its own products, prices, cashier and Cash Shift; no cross-tenant data must appear.

## Scope limits

This update only changes **draft cart navigation**. It does not activate financial checkout, stock posting, SARA confirmation, voucher redemption, tax finalization or Restaurant Tables. Such actions remain restricted until the transactional adapters are implemented and accepted on the PC.

## Tests performed before delivery

- Backend syntax and test-file syntax: PASS.
- Full local merged-source backend tests: **209/209 PASS**.
- POS R1.2 focused workflow tests: **8/8 PASS**, using a mock transactional database. These do not replace MySQL acceptance on the user's PC.
- TSX syntax/parser and compiled JavaScript syntax: PASS.
- CSS parser: PASS.
- Frontend Vite production build: **NOT verified in this container** (dependency unavailable); please run `npm run build` on the PC.
