TPOS Main V2 | Product Service Tax UI & POS Rate Labels R1.9
Changed Files Only | 2026-10-31

Purpose
- Product Add/Edit displays TWO clear SST choices: Sales Tax and Service Tax.
- The choices are mutually exclusive for a single product. Both unchecked means No SST.
- Product Service Tax uses the existing `jkdm_tax_type=SERVICE_TAX` contract.
- No schema/API migration; no tax rate override at product level.
- Tenant GST/SST Settings remains the authority for ON/OFF, registered status and rate.
- POS breakdown labels dynamically display Sales Tax (rate%), Service Tax (rate%), Service Charge (rate%) from backend quote.
- Service Charge remains independent and charged per order policy, not a product SST type.

Safety / scope
- Sales Tax, Service Tax and Service Charge are separate. An SST-enabled tenant does not automatically tax every product.
- Current product contract classifies one SST type per product. For an order to have both taxes, classify different eligible items accordingly. Do not enable both on one item without an approved and audited legal/tax specification.
- Do not assume rates displayed in screenshots are statutory for the business. JKDM MySST notes 6% Service Tax for qualifying F&B services; verify the registration, supply and current rules.
- POS remains a read-only quote, not completed checkout.

Install (PC)
1. Back up working source and extract only changed files into D:\www\tpos_main_v2; retain folder paths.
2. cd /d D:\www\tpos_main_v2\backend
3. npm run check
4. npm test
5. cd /d D:\www\tpos_main_v2\frontend
6. npm run build
7. Restart frontend if necessary; hard refresh browser.

Live acceptance
A. Product > Edit: two visible checkboxes, Sales Tax and Service Tax. Select Service Tax; Sales Tax becomes unchecked. Save, re-open View and verify Service Tax classification.
B. In GST/SST Settings, activate legally applicable Service Tax with proper registration number and rate, e.g. 6.00% F&B (only if legally appropriate).
C. POS: add a service-tax-eligible product. Verify Service Tax amount and dynamic label 'Service Tax (6%)'.
D. Mixed basket: a Sales Tax eligible item plus a Service Tax eligible item. Verify separate tax lines, Service Charge (if ON), and ONE final 5-sen BNM rounding.
E. Disable tenant Service Tax: tax becomes RM0.00 regardless of Product classification.

Tests completed in isolated source
- backend npm run check: PASS
- backend npm test: 272/272 PASS
- CSS PostCSS parser: PASS
- Frontend Vite build: NOT VERIFIED (offline npm dependency not cached); run on user's PC.
- MySQL and UI live: NOT VERIFIED.

No SQL, no .env, no node_modules, no CMD installer.
