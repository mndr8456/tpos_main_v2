# POS Terminal R1.3 — Tax Summary & BNM 5-Sen Rounding

## Scope

- POS-only UI and read-only quote engine updates; no SQL migrations.
- Change "Provisional Total" to "Total".
- Remove "Check Eligibility", "Preview only", "Estimated balance", and the old tax/checkout disclaimer beneath Total.
- Display two compact order-summary rows for Subtotal, Discount/Voucher, and Sales/Services Tax; show Total prominently.
- The Apply / Preview panel shows Subtotal, Discount, Voucher, Sales Tax, Service Tax, Rounding Adjustment and Total.
- Read-only quote recalculates automatically when the cart version or discount/voucher inputs change; debounced text input avoids excessive requests.
- This version does NOT post sales, collect payment, modify stock, mark vouchers redeemed or enable checkout.

## Bank Negara Malaysia rule

Bank Negara Malaysia's announcement of 13 November 2007, implemented on 1 April 2008, says over-the-counter bill totals (including tax) are rounded to the nearest 5 sen, never per item.

Official notice: https://www.bnm.gov.my/-/mekanisme-penggenapan-bagi-pembayaran-di-kaunter-diperkenalkan

Final cent endings 1/2 down, 3/4 up, 5 unchanged, 6/7 down, 8/9 up and 0 unchanged. A single rounding adjustment is applied to the bill **after** discounts, vouchers and taxes, never independently to each payment tender.

## Server-side calculation

- Integer-sen arithmetic; no rounding in frontend.
- Product Master `jkdm_tax_type`, `jkdm_tax_rate`, `jkdm_tax_inclusive` determine tax. These are internal database identifiers only; POS display uses "Sales Tax" and "Service Tax".
- If SST is inclusive, its amount is disclosed but not added again. If exclusive, it is added after the discount is allocated proportionally among lines.
- LHDN e-Invoice metadata is not used as an SST rate.
- No configured service charge is invented.
- Discount and voucher simultaneous stacking remains disallowed until the policy is approved.
- Quotes fail closed if a referenced product tax configuration has disappeared or is invalid.
- The calculation is a read-only counter quote, not a finalized tax invoice.

## PC installation

Extract the ZIP into `D:\www\tpos_main_v2\` and overwrite only its included full files.

```
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart backend; refresh the POS page with Ctrl+F5. No SQL or `.env` modification is needed.

## Acceptance

1. On a new empty order, confirm the Total is RM0.00 after server quote loads.
2. Add a product priced RM33.03 with SST No Tax: rounding adjustment should be +RM0.02, Total RM33.05.
3. Add a product priced RM33.02 with SST No Tax: rounding adjustment should be −RM0.02, Total RM33.00.
4. With applicable configured Sales Tax and Service Tax products, verify separate tax rows. Prices marked inclusive must not be taxed twice.
5. Enter an existing Discount or Voucher code: the amount updates automatically without a Check Eligibility button; a failed code must not show fabricated Total.
6. Hold the order and confirm a new empty order appears; Resume via Held/Saved Orders remains functional.
7. Payment / Checkout must stay disabled from posting money until adapters are integrated and validated.

## Local verification

- Backend full regression: 216/216 PASS.
- Backend syntax: PASS.
- JSX syntax: PASS via TypeScript JSX parser/transpiler.
- CSS syntax: PASS via tinycss2 parser.
- Frontend Vite build and live tenant MySQL/browser acceptance: require PC confirmation.
