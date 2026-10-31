# TPOS Main V2 — GST / SST Settings R1 Acceptance

## Purpose
Tenant-level SST configuration, with **two separate panels** for Sales Tax and Service Tax. The SST numbers are read from and written to the existing `company_registrations` record (the same fields used during initial tenant registration), not duplicated in another table. This module does not activate GST, register a business with JKDM, create a tax invoice, or finalize a POS sale.

## Compliance design
- Sales Tax is generally a **single-stage** tax at manufacture/import, not automatically an extra tax on every retail resale. Taxability of goods must be verified.
- Service Tax applies to taxable services by registered persons. Verify applicable rate and effective dates with JKDM/MySST; 8% and 10% in an example screenshot are **not system-wide compulsory defaults**.
- Two switches start **OFF**, irrespective of whether tax numbers were entered at tenant registration. An enabled switch needs a registration number and a positive rate.
- Product Master `jkdm_tax_type` chooses the appropriate tax category. The tenant setting controls whether it applies and the configured rate. A product marked `NONE` remains tax-free. LHDN e-Invoice fields are unaffected.
- If a switch is OFF, the relevant POS quote tax is **RM0.00** even if the product retains an older rate.
- Tax is calculated server-side and BNM 5-sen rounding is applied once to the bill as before. It does not write a sale or consume a voucher.
- OWNER alone may change the settings. ADMIN/MANAGER/ACCOUNTANT may view according to grants. CASHIER receives no SST Settings page permission.

Official information: https://mysst.customs.gov.my/understanding-sst/ and https://mysst.customs.gov.my/faq-services-tax/ and https://mysst.customs.gov.my/faq-sales-tax/ .

## Installation
Extract changed files into `D:\www\tpos_main_v2` without replacing `.env`. Do not rerun Product, Voucher, POS or Payment Methods migrations.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:sst-settings
npm run db:sst-settings -- --apply
npm run db:sst-settings
npm run check
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Expected installer progression: `MISSING` → `APPLIED` → `CURRENT` for each active tenant. Restart backend, then log out and log back in to refresh permissions.

## PC acceptance
1. Log in as OWNER, open **GST / SST Settings**. Both Sales Tax and Service Tax should show OFF on a new installation. Registration numbers from the tenant registration should already appear, if supplied.
2. With both OFF, create a POS order containing a product with its SST type set to SERVICE_TAX. POS quote **Service Tax = RM0.00**.
3. Set a valid Service Tax registration number in the Service Tax panel and the legally applicable rate. Turn ON and Save. Verify Activity Log. Refresh POS quote; Service Tax should be computed on eligible products only.
4. Turn Service Tax OFF, Save, and refresh the quote. It must return RM0.00. The registration number remains stored for future reactivation.
5. Repeat independently for Sales Tax, only with a tax-applicable scenario. Ensure the Service Tax switch is unaffected.
6. Try turning a tax ON without a registration number or with zero rate: backend should refuse. Confirm a user with view permission cannot save.
7. Open two tenants: changes to Tenant A must not appear in Tenant B. Also verify BNM 5-sen rounding and historical POS Hold/Resume behavior remain unchanged.

**Note:** Frontend Vite build and live MySQL tests are only confirmed after PC evidence. Provider/JKDM verification is not automated.
