# TPOS Main V2 — Product SST R1.7 / POS SST compatibility

## Scope (Changed Files Only)
- `frontend/src/Products.jsx`: remove SST Price Inclusive checkbox, ON/OFF helper and View Product label. Product saves now explicitly send `jkdmTaxInclusive:false`.
- `backend/src/sst-policy.js`: POS applies SST **exclusive** to eligible products at the active tenant rate. The old `jkdm_tax_inclusive` database/CSV field is retained for compatibility but no longer determines POS pricing.
- Three backend tests: contract regression, BNM tax quote and legacy-inclusive compatibility.

## Current POS rule
- GST / SST Settings per authenticated tenant is the only source of SST On/Off and rate.
- Product `SST Type` determines eligibility (`NONE`, `SALES_TAX`, `SERVICE_TAX`).
- Registered + enabled tax on eligible items is **added to the selling price**; OFF or unregistered settings do not charge SST.
- LHDN / MyInvois `Price Includes Tax` is a separate classification-related field and is untouched.
- BNM five-sen rounding applies once at **bill level**, not each item.
- Never apply tax merely because the tenant has enabled SST. Confirm the individual supply is taxable under applicable rules.

## Installation
1. Back up the project files you will replace.
2. Extract the ZIP into `D:\www\tpos_main_v2\`, overwriting ONLY matching files.
3. No SQL, `.env`, CMD installer or database backfill is included. Do not rerun migration 018.
4. Run in the Windows Command Prompt:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

5. Restart backend, refresh browser (`Ctrl + F5`).
6. In Products > Edit AGLIO OLIO AYAM confirm SST Type = Sales Tax and no SST Price Inclusive checkbox or note appears.
7. In GST / SST Settings: Sales Tax enabled and registration valid, rate 8.00% (test configuration only).
8. In POS with 2 × RM10.50 of AGLIO OLIO AYAM, Sales Tax is RM1.68; line total before BNM is RM22.68. On the RM45.00 two-product example, Sales Tax RM1.68 and BNM +RM0.02 produce Total RM46.70 (assuming the other product is untaxed).
9. Turn SST OFF and ensure tax reverts to RM0.00. Test tenant isolation and historical products that previously had inclusive flag ON.

## Known limitations
- Existing stored `jkdm_tax_inclusive` values are intentionally not changed by this patch; they are no longer used by POS quote. The legacy field is retained for backwards-compatible CSV and audit data. A separate data-cleanup migration would require explicit approval.
- The transaction/checkout module is still not complete; this is a read-only POS quote correction, not accounting or statutory tax advice.
- Automated syntax/regression ran in isolated source, not live MySQL. Frontend Vite build must be verified on the user's PC.
