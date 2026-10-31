# TPOS Main V2 — POS R1.5 Tenant SST Synchronization

## Purpose
POS reads current, authenticated tenant SST settings from the database on every server quote. The quote returns both authoritative amounts and a safe SST status summary (switch state, percentage rate and number of matching order lines). It never exposes an SST registration number to POS users. This module does not post a sale or authorize a payment.

## Source and installation
This is a Changed Files Only package based on the POS R1.4 + GST/SST Settings R1.2 source. Extract into `D:\www\tpos_main_v2`, preserving the paths.

- `backend/src/pos-drafts.js` — tenant SST diagnostic summary with every quote.
- `backend/src/sst-policy.js` — per-product SST filtering, status summary, safe invalid-type failure.
- `frontend/src/PosTerminal.jsx` — display current tenant SST status and re-quote when the tab regains focus or POS Refresh is pressed.
- `frontend/src/PosTerminal.css` — status badges and detail layout.
- `backend/tests/pos-sst-sync-r15.test.js` — synchronization regression tests.
- `backend/tests/pos-summary-r14.test.js` — updated prior test for the new tax refresh dependency.

There is **no new SQL**, `.env`, or dependency. Migration 018 and the R1.2 registration schema repair must already be `CURRENT` on the tenant, as previously verified. No existing tenant records are updated by this package.

## PC verification

1. Back up the relevant tenant database before testing and install Changed Files Only.
2. Restart backend. Run `npm run check` and `npm test` inside `backend`; run `npm run build` inside `frontend`.
3. Log in as the OWNER. In GST / SST Settings, verify the registered SST number, enable the applicable tax and save a legal percentage rate. **8.00 means 8%; 0.08 means 0.08%.**
4. In Product Master, edit a legitimately taxable product and set **SST Type = Sales Tax** (or **Service Tax**, as appropriate). Save it. Do not mark products taxable unless legally applicable.
5. Open POS Terminal with a cashier's OPEN shift. Add that same product to an order. **Sales Tax / Service Tax** must follow the enabled tenant setting and that item's classification. The policy status must show ON and a matching item count. The server quote and Total should update without Apply.
6. Add an item whose Product Master **SST Type = No SST**. Its price must not incur SST simply because a tenant switch is ON.
7. Disable the matching tax in GST / SST Settings; return to POS and inspect quote. The relevant tax must become **RM 0.00**. Re-enable at the approved percentage and test again. Repeat for Service Tax separately where applicable.
8. In a separate browser tab, change SST Settings while POS is open. Return to POS: focus/visibility events trigger a fresh quote automatically. POS Refresh also forces a fresh quote.
9. Ensure Discount/Voucher Apply, Sales/Services Tax Apply, seven-line totals, BNM five-sen rounding, Hold → auto new order and tenant/branch isolation remain unchanged.

## Troubleshooting

- **SST ON but 0 matching products:** verify `Products → Edit → SST Type`. Existing products default to `No SST`; the system MUST NOT impose tax on every product automatically.
- **SST ON with matching products but RM0.00 tax:** confirm the configured percentage and whether amounts are too small to create at least RM0.01 tax after cent rounding.
- **SST registration missing:** quote fails closed (RM0.00 for that category).
- **Quote error:** inspect the backend error; do not represent unavailable tax data as valid zero amounts.

**Acceptance:** UI and MySQL behavior on the customer's PC remain pending until verified there. Backend tests are not a substitute for live testing.
