# TPOS Main V2 — Product KPDN Controlled Goods R1

## Scope

- Product Create/Edit: "KPDN Controlled Goods" checkbox (GOODS only).
- Product View: shows KPDN controlled status; Products list: KPDN marker.
- Backend stores `is_kpdn_controlled` as a tenant-local boolean, audited in Product Create/Update/Import logs.
- Product CSV includes `is_kpdn_controlled` (YES/NO) as its 29th column.
- Legacy 21-, 25- and 28-column imports remain supported with KPDN default NO.
- Product Add/Edit has only its bottom Cancel X; View Product keeps its own top X.
- No modifications to Product R2/R3 SQL or historical product data.

## Important distinction

The KPDN checkbox is for internal recordkeeping only. It does not automatically set government price ceilings, infer current regulated commodities, certify licenses or authorize sales. Regulatory compliance and period-specific pricing require independent business verification against current KPDN rules. LHDN and JKDM fields are unaffected.

## Install (Windows CMD)

Extract **the complete files in this ZIP**, retaining their directory structure, into `D:\www\tpos_main_v2\`, and allow replacement of the listed files only. No `.env` files are provided.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:products:kpdn
npm run db:products:kpdn -- --apply
npm run db:products:kpdn
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

The expected tenant migration status is `MISSING`, then `APPLIED`, then `CURRENT`. Migration `015_tenant_product_kpdn.sql` is additive. Do not rerun 007 or 008. Restart backend and refresh browser after installation.

## PC Acceptance

1. Open Product → Add Product. Confirm no top-right X is shown; bottom Cancel and Save remain.
2. Enter a GOODS product (for example, "Gula 1kg") and check **KPDN Controlled Goods**. Save.
3. View Product and confirm **KPDN Controlled Goods: Yes**; verify the product row contains a KPDN marker.
4. Reopen Edit and clear the checkbox; Save; View should show **No**. Review Product Activity Log for Update.
5. Choose Product Type SERVICE; KPDN checkbox should be unavailable. Do not alter tax settings.
6. Download CSV template and confirm the 29th header is `is_kpdn_controlled`; test both YES and NO through Preview/Confirm. Also test an existing 28-column R3 CSV; it should default to NO.
7. Confirm existing products default to No after migration and are not deleted or re-priced.

## Tested in build environment

- Node syntax checks for backend modified files and new installer: PASS.
- Source regression tests: 179/179 PASS, including 5 new tests for KPDN rules.
- Full Vite frontend build, real MySQL migration, and live PC behavior: PENDING verification on user's PC.
