# TPOS Main V2 — Customer Display R1.3 / KDS Hold Auto-Dispatch R1.3

## Scope

Patch complete changed files only, based on the accepted TPOS Main V2 source and Customer Display R1.2.

**Customer Display (CD):** On some PCs the monitor showed `Connected` but remained at `Welcome` while the cashier had a live cart, cash-payment dialog or paid receipt. The previous frontend used a login-time `customer_display.publish` permission and silently ignored subsequent publish/mode errors; a live backend grant could therefore be available for pairing but not for the stale frontend profile. The R1.3 pairing handshake validates BOTH `customer_display.pair` and `customer_display.publish`. A successful pair enables current-session publishing, the payment screen awaits the order snapshot, and publish/mode failures become visible to the cashier rather than reporting a false success. Payment-success presentation remains based on a real posted sale only. A previous completed draft cannot prevent the current verified sale from being shown, but an unrelated active draft cannot be replaced.

**KDS:** POS **Hold** for an authorised cashier now commits `HELD` and dispatches the kitchen ticket *in the same MySQL transaction*. The formerly disabled **Send to Kitchen** button is removed from the POS order footer; for Food & Beverage with `kds.dispatch` the action is named **Hold & Send to Kitchen**. Replaying the same Hold cannot dispatch twice. Missing/invalid kitchen stations cause rollback of Hold and ticket together. Only products with **Requires Preparation** are sent. A role missing KDS dispatch permission cannot silently Hold a preparation-required cart. The existing separate KDS dispatch endpoint remains available to preserve API compatibility for historic held orders; it is no longer required for normal POS Holds.

## Protected boundaries

- No new SQL migrations; tenant migration 040 (KDS) and 041 (CD) must already be `CURRENT`.
- No changes to sale/payment posting, payment-attempt evidence, tax calculation, Cash Shift reconciliation, stock valuation, accounting journals, or existing receipt format.
- WAITER → CASHIER existing KDS tickets are linked (and remain unique), not dispatched twice.
- Cash success still requires an actual `pos_sales` record with matching draft, cashier and branch. Static QR success still requires an actual posted non-cash sale, not merely a screenshot/reference.
- TPOS V1 and production hosting remain untouched.

## Installation (Windows)

1. Back up the V2 source and tenant database. Stop frontend and backend servers.
2. Extract this ZIP into `D:\www` and **Replace/Overwrite** files inside `D:\www\tpos_main_v2`. Do **not** replace `.env`.
3. In backend cmd:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node scripts/verify-customer-display-r1.js
npm run db:kds
npm run db:customer-display
node --test tests/customer-display-live-flow-r13.test.js
node --test tests/customer-display-sync-r13.test.js
node --test tests/customer-display-r1.test.js
node --test tests/customer-display-pairing-r11.test.js
node --test tests/customer-display-sale-presentation-r12.test.js
node --test tests/pos-hold-autonew-r12.test.js
node --test tests/kds-r1.test.js
npm test
```

Both migration checks must show `CURRENT`, `failed:0`. Never run `--apply` when already CURRENT.

4. In frontend cmd:

```cmd
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

5. Restart both services. Close old CD monitor windows. Log out and back in to refresh role grants when possible. In POS, open Customer Display afresh, using **Open Customer Display**. If the pairing service rejects a permission, check Role Permissions for this user: `customer_display.pair` and `customer_display.publish`. Do not bypass those permissions.

## PC acceptance scenarios

### CD — must be visibly different from previous failure

1. Pair CD and verify **Connected**.
2. Start a new POS order and add two items. **Before checkout**, the left CD panel must show names, prices, quantities and total. Promotions remain on the right. If it remains on Welcome, POS must show an actionable sync error; capture the error and backend log (never token).
3. Open Payment Methods → Cash. CD must switch to full-screen Cash Pending (not Welcome). Enter cash and Confirm: CD must show exact change, then Owner-editable bilingual Thank You while receipt is open (subject to the existing 90-second safety bound).
4. Close receipt: CD transitions back to Idle after Owner-configured duration.
5. Verify active DuitNow QR: CD shows configured merchant QR and exact amount while payment attempt is pending; no Thank You before manually verified posted sale.
6. Test stale profile case: pair after grants update without a browser login refresh; CD must still publish because backend explicitly verifies grant. If rights are absent, pairing must fail rather than displaying a misleading green Connected badge.

### KDS — must dispatch directly on Hold

1. In Product Master, confirm sample food products have **Requires Preparation** and valid active Kitchen/Drink/Dessert/Counter stations.
2. Start a POS Take Away or Dine In order with preparation-required items and OPEN Cash Shift.
3. Click **Hold & Send to Kitchen** once. **Without reopening Held / Saved Orders**, check the KDS board. It must show the new ticket and correct station/quantities/table.
4. Click Held / Saved Orders only to Resume the same draft for payment; it must not create a second ticket.
5. Repeat on the same action/retry path; verify no duplicate ticket. Verify a product that does not require preparation does not generate a kitchen ticket.
6. With a preparation-required item assigned to an inactive/invalid station, Hold must fail and leave the draft in DRAFT rather than accepting an orphaned HELD order.

## Acceptance gate

Developer regression verified: 744/744 backend tests PASS, backend syntax PASS, JSX parse PASS. Frontend Vite build, real MySQL transaction and monitor/KDS live interaction require the user’s PC confirmation. Do **not** mark Customer Display or this changed Hold flow LULUS/LOCKED from automated tests alone.
