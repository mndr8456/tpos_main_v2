# TPOS Main V2 — Service Charge Settings R1

## Purpose
Merchant-imposed **Service Charge** is separate from the Malaysian **Service Tax** (SST) in GST/SST Settings. This module does **not** register a business with JKDM, and the merchant fee is never written as a tax liability. The POS remains a read-only quotation / durable draft, not a finalized sale or settlement.

## Installation — Changed Files Only
1. Back up current project files and tenant databases before applying this package.
2. Extract package preserving the paths inside `D:\www\tpos_main_v2`.
3. In `D:\www\tpos_main_v2\backend` run:
   - `npm run db:service-charge` (read-only preflight, expect `MISSING` on an uninstalled tenant).
   - `npm run db:service-charge -- --apply` (add only missing new tables/permissions and OFF settings).
   - `npm run db:service-charge` (expect `CURRENT`).
   - `npm run check`
   - `npm test`
4. In `D:\www\tpos_main_v2\frontend` run `npm run build`.
5. Restart backend, sign out/in, refresh frontend. Do not replace `.env`; do not re-run migrations 017 or 018.

## Owner setup and testing
- Navigate to **Service Charge Settings** (separate from GST/SST Settings).
- Default is OFF, rate `0.00%`, Dine In selected, Take Away not selected.
- To test the current POS Terminal (which only supports TAKE_AWAY until Restaurant Tables is integrated), OWNER may explicitly select Take Away, set `10.00%` and switch ON for a controlled test. Restore the intended business policy afterward. Do not treat 10% as a statutory rate.
- For a Restaurant TAKE_AWAY order of RM100.00 with **No SST** products, Service Charge `10.00%` gives RM10.00, Service Tax RM0.00 and Total RM110.00. Other tenant types never receive the charge from this R1 F&B policy.
- With a **SERVICE_TAX** product and tenant GST/SST Settings ON at a valid rate, Service Tax and Service Charge must be in separate lines. Example RM100.00 F&B taxable supply at 6% service tax, plus 10% service charge, has Service Tax RM6.00, Service Charge RM10.00, Total RM116.00 (subject to product eligibility and applicable regulations).
- Test `OFF` switch: Service Charge RM0.00; test `Dine In only` with TAKE_AWAY: Service Charge RM0.00; test `GROCERY` tenant: Service Charge RM0.00 regardless of enabled setting.
- Inspect Activity Log and verify OWNER-only updates, consistent rate after Save/Refresh, no leaked cross-tenant config.
- The POS DINE_IN flow is still locked pending Restaurant Tables; do not treat Dine In as accepted in R1.

## Important: Why GST/SST Service Tax may still show RM0.00
GST/SST Settings Service Tax ON **does not automatically classify every product**. In Product Master, the product must have `SST Type = Service Tax`, and the tenant must have a valid Service Tax registration and rate. Products marked `Sales Tax` or `No SST` do not contribute to Service Tax. These product rules are unchanged.

## Financial policy and scope
- Service Charge calculation is on the subtotal **after** Discount and Voucher, **excluding SST from the charge base** for ordinary F&B; BNM rounding once on combined bill.
- `SERVICE_TAX` continues to be configured in GST/SST Settings; the `service_charge_settings` table is wholly separate and tenant-scoped.
- No sale, payment, stock posting, voucher redemption or accounting journal is created by the quote.
- F&B business types: RESTAURANT, CAFE, FOOD_TRUCK, STREET_FOOD. Default target Dine In only; Take Away only with Owner opt-in.
- No invoice/receipt deployment in this R1; accounting classification and Service Charge refund treatment must be finalized alongside transactional checkout.

## Status
Local source-level syntax and targeted regression tested. MySQL real tenant migration, full backend regression and frontend Vite build require PC acceptance. Do not mark as PASS/LOCKED until live proof.
