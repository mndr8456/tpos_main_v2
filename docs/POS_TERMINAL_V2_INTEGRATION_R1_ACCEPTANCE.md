# TPOS Main V2 — POS Terminal Integration R1 (Durable Draft Cart & Quote)

## Scope and safety boundary

This release delivers a **working POS cart workflow**: authenticated cashier terminal, active catalog, barcode/SKU selection, server-owned branch pricing, cart quantity changes, hold/resume/discard, optimistic versions, request-key idempotency, immutable audit, and read-only Discount/Voucher eligibility calculations.

**It does not authorize a live sale**. There is no sale or payment posting, no inventory decrement or valuation, no voucher reservation/redemption, no service charge/SST calculation, no fiscal receipt, and no Cash Shift sale settlement. The checkout control is deliberately locked. Do not rely on POS R1 as a production checkout terminal. Do not record external payment as PAID based only on the merchant configuration.

V1 source is used solely as reference. V1 databases and prior SQL files are not touched.

## Included installation files

- `database/017_tenant_pos_drafts.sql` (new tenant tables only)
- `backend/src/pos-drafts.js`, `backend/src/pos-money.js`
- `backend/scripts/setup-pos-drafts.js`
- `frontend/src/PosTerminal.jsx`, `frontend/src/PosTerminal.css`
- Updated *complete files*: `backend/src/app.js`, `backend/src/tenants.js`, `backend/package.json`, `backend/tests/foundation.test.js`, `frontend/src/App.jsx`
- `backend/tests/pos-drafts-r1.test.js`

Do not overwrite any `.env` file. The new migration is additional to 001–016.

## Install (Windows CMD)

Extract **Changed Files Only** to `D:\www\tpos_main_v2\` (preserve the paths; replace only files included in the package).

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:pos-drafts
npm run db:pos-drafts -- --apply
npm run db:pos-drafts
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Expected migration status for a newly installed active tenant: `MISSING → APPLIED → CURRENT`. Do not re-run previous SQL 007, 012, 013, 014, 015 or 016. Restart backend and refresh the frontend; sign out/in so new POS permissions are loaded.

## Acceptance tests on a real PC

1. Sign in as CASHIER. Open **Cash Shifts** and start a shift; no open shift must mean `New Cart` is disabled.
2. Open **POS Terminal**. Select the branch with own open shift and click **New Cart**. A persisted cart ID appears.
3. Search or scan an active **SINGLE** product. Add it once, change quantity, and confirm the backend subtotal equals quantity × the branch price, rounded once per line to 2 decimals.
4. Hold the cart, select **My Saved Carts**, and Resume. Verify the items and prices survive logout/login.
5. Preview a valid Discount **or** Voucher. Eligible products show a calculation; invalid/expired codes return an error or ineligible status. Neither operation creates a payment, sale, voucher reservation or usage movement.
6. Click **Cart Activity Log**. CREATE, ADD_LINE, CHANGE_QUANTITY, HOLD, RESUME and DISCARD should display actor, action, and timestamp.
7. Reuse a `requestKey` with different payload via API: expect `POS_REQUEST_KEY_REUSED`; reuse with the same payload must not increase quantity again. Stale `expectedVersion` must return `POS_DRAFT_VERSION_CHANGED`.
8. Open a second cashier account in the same tenant: attempts to load the first cashier's draft ID must return `POS_DRAFT_NOT_OWNED`.
9. Close the original Cash Shift: the draft can still be viewed for audit, but it cannot be edited or resumed for checkout.
10. Verify **Shift Cash**, **Product stock**, **Voucher redemption count** and **Payment Method settlements** are unchanged by cart preview, hold and discard.

## Known R1 restrictions — before POS can be called production ready

- Inventory stock on-hand / moving-weighted-average valuation and sale issuance (for track-stock goods).
- Product PACK/BOX/CARTON and SET/BUNDLE component stock and real barcode packaging checkout.
- Restaurant Tables, Dine In orders, preparation station order routing, held-order merging, split/combined bills.
- Sales atomic posting, tax/SST, rounding, receipt/numbering, invoice, returns/refunds and accounting.
- Cash payment capture including amount tendered/change and settlement in Shift Cash; verified provider card/QR/e-wallet/bank payment; split tender.
- Voucher reserve/redeem/release within the sale's **same transaction**, discount usage ledger, authority PIN for sensitive cancellation.
- SARA/MyKasih must stay blocked until official approved provider integration is available.
- Full branch, role, concurrency and real MySQL tests on the user's PC.

**No SQL `017` checksum has been claimed as CURRENT until user PC evidence. No module LULUS/LOCKED until user validation.**
