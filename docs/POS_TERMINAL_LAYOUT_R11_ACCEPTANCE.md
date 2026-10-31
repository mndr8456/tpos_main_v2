# TPOS Main V2 — POS Terminal Layout R1.1 Acceptance

## Source and scope
- Base: POS Terminal Integration R1 (`017_tenant_pos_drafts.sql` already installed), Global Refresh, Payment Methods R1.1, Product KPDN/SST labels, and existing V2 modules.
- V1 `PosTerminalPage.jsx` used only as the UI/behavior reference.
- This package changes only `frontend/src/PosTerminal.jsx`, `frontend/src/PosTerminal.css`, `backend/src/pos-drafts.js`, and two POS-specific tests.
- No SQL or `.env` changes.

## Tenant business layout
- RESTAURANT / CAFE: Food & Beverage menu, category filter, order pane, Take Away, and clearly disabled Dine In/table flow until the tables adapter is connected.
- FOOD_TRUCK / STREET_FOOD: Food & Beverage counter/Take Away ordering.
- GROCERY / RETAIL / MINI_MARKET: Retail grid, SKU/barcode input, category filter, quick product selection and counter order.
- Business Type comes from the authenticated session's company metadata; never accept a user-submitted tenant ID.
- Product data comes from the authenticated tenant pool. Branch selling prices are only returned for authorized branches, filtered again in the UI by the current branch.

## Acceptance steps on PC
1. Extract this changed-files-only ZIP into `D:\\www\\tpos_main_v2` and overwrite only the included source files.
2. Backend: `npm run check` then `npm test`; restart backend.
3. Frontend: `npm run build`, refresh app and log in again if needed.
4. On a RESTAURANT tenant, open the POS Terminal. Confirm the Food & Beverage layout, category tabs, menu tiles, branch/shift and order pane. Confirm table/Dine In action correctly displays as unavailable (not mock active).
5. Open a Cash Shift as a permitted cashier. Select the branch, create New Order, add a SINGLE product. Validate the branch price shown in the tile and the backend-saved order total. Test +/- quantity, hold/resume and activity log.
6. Search a SKU or scan a barcode and press Enter. Confirm it adds the correct product.
7. Switch to a tenant registered as GROCERY, RETAIL or MINI_MARKET and verify Retail Counter layout, different product data and tenant-specific prices. Verify no products, categories or carts from the Restaurant tenant appear.
8. Payment / Checkout must show enabled branch methods but **must not create a sale**, decrement stock, consume a voucher or mark a payment as PAID. Test with draft only; do not claim checkout PASS.
9. At narrow window widths, confirm category tabs scroll horizontally and the cart stacks below the products without overflowing the topbar.

## Known unfinished dependencies (NOT accepted/locked)
- Restaurant Tables setup, Dine In seating and combined/split bills.
- Stock ledger and inventory cost posting (including packs/sets/bundles).
- Final service charge, SST, LHDN e-invoice calculation, rounding and receipts.
- Verified Payment Processing (cash and external providers) and shift settlement.
- Voucher reserve/redeem/release in committed sale transactions.
- Sales Void/Refund and authority controls.

This is a layout + live tenant catalog / branch price integration update, not a production-ready POS checkout release.
