# Customer Display R1.4 — V1 Session Flow / Held + Resume Recovery

## Reported live PC failure (7 November 2026)

- Customer Display shows `Connected` and `Welcome` but never shows a selected HELD order.
- POS shows `CD_ORDER_PUBLISH_FAILED` on reopening or pairing while an order is HELD, followed by `CD_PAIR_EXPIRED` / missing update during Resume.
- Repeated Open Customer Display may replace or close a working monitor window.
- Backend regression 744/744 and Vite build PASS did not cover this real Held → Resume workflow.

## Root cause and safe fix

The R1.3 API `publishCustomerDisplay` accepted only `DRAFT` orders, and answered `paired:true, ignored:true` to a valid `HELD` order. Frontend interpreted that as a pairing failure and closed/revoked the monitor, although a customer display is independent of the current POS draft. The automatic publish effect also sent a null draft while a HELD order was selected, clearing the customer view. An out-of-order automatic publish could reset the payment screen to `ORDER`.

R1.4 uses the same V1 operational principle: pairing is a long-lived monitor session; cart, HOLD/Resume, payment and success are state changes inside the session, not conditions for pairing to exist.

1. Pairing readback still validates a real, authorized monitor, but active cart publish is an optional follow-up, not a prerequisite for pairing.
2. Repeated Open Customer Display focuses the already open window instead of rotating its token.
3. A HELD order can be published as a **read-only ORDER** snapshot; it cannot enter payment mode before Resume.
4. Returning from Held / Saved Orders and pressing Resume refreshes the original order snapshot without invalidating pairing.
5. Automatic cart sync is suspended while Payment Methods or Payment Receipt is open, including a synchronous in-progress guard before the React redraw, to prevent racing CASH/QR/Thank You transitions.
6. A missing/offline display never blocks POS Hold, Resume, checkout, stock, accounting or receipts.
7. Backend authorization, branch isolation, token hashing and posted-sale-only success validation remain intact. KDS auto-dispatch-on-Hold and its immutable ticket protection are not modified.

No database migration or new permission is required. Migration 040 and 041 remain CURRENT.

## Install on user's V2 PC

1. Back up `D:\www\tpos_main_v2` and tenant database. Stop backend and frontend.
2. Extract the **Changed Files Only** archive to `D:\www` and overwrite matching paths. Do not replace `.env`.
3. In `D:\www\tpos_main_v2\backend` run:

   ```cmd
   npm run check
   node scripts/verify-customer-display-r1.js
   npm run db:kds
   npm run db:customer-display
   node --test tests/customer-display-v1-parity-r14.test.js
   node --test tests/customer-display-live-flow-r13.test.js
   npm test
   ```

4. In `D:\www\tpos_main_v2\frontend` run `npm run build`.
5. Restart both servers, hard-refresh POS, close stale CD windows, and **pair once** from POS.

## Mandatory live acceptance (do not mark LOCKED from tests alone)

1. Start with POS no draft, open CD. The second screen should show Connected / Welcome with promotions.
2. Add products. CD shows item, price, quantity and server-authoritative total.
3. Click **Hold & Send to Kitchen**. Confirm KDS receives a single ticket (for preparation-required products); hold does not post payment.
4. Open Held / Saved Orders and select the same HELD order. The CD displays its read-only order, not a pairing error.
5. Press **Resume**. The order remains in POS, customer cart remains visible, and checkout becomes available. Products already sent to KDS remain protected from silent edits, as previously approved.
6. Click Open Customer Display again: existing monitor remains connected; no token rotation or popup closure.
7. Open Cash Payment: CD shows full-screen pending payment; confirm cash only through actual backend checkout. CD displays change first, then OWNER-set Thank You and Welcome at the correct point.
8. Test QR Pending → cashier verified reference/evidence → actual posted sale → Thank You. An unverified QR must never show success.
9. Verify POS Receipt, inventory/ledger and KDS ticket are not duplicated or changed.

If an API error remains, capture the visible error code, backend console entry (without tokens or payment evidence) and the exact sequence. Do not run migration `--apply` again if it is CURRENT.

## Development evidence

- Focused new R1.4 HELD/Resume tests: 3/3 PASS.
- Full backend regression after temporary use of `.env.example` as test-only `.env`: 747/747 PASS. Temporary `.env` removed from packaged source.
- Frontend PosTerminal JSX parsing / transpile: PASS.
- Real MySQL operation and Vite build for R1.4: **pending user PC**, not claimed PASS.
