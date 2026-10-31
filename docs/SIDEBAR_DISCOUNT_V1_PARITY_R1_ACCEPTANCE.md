# TPOS Main V2 — Sidebar and Discount V1/Voucher UI Parity R1

## Scope

This changes **only** the V2 navigation presentation and Discount user interface. POS checkout, tenant database structures, Service Charge, Sales Tax, Service Tax, Voucher issuing and permission grants are unchanged.

### Sidebar

- The V1 reference order is followed for completed modules: Dashboard, then **Master Data** (Users, Categories, Products, Suppliers, Customer Vouchers, Discounts, Cash Shifts), **Transactions** (POS Terminal, Log Cash Drawer), and **Settings** (Payment Methods, GST / SST Settings, Service Charge Settings).
- V1 modules that have not been rebuilt (e.g. Customers, HR, Payroll, Accounting, Restaurant Tables, Reports) do **not** have fake or unusable links.
- Only pages granted by the current authenticated user's tenant permissions are shown.
- Groups collapse/expand independently; active page is highlighted.
- At **desktop width >900px**, the hamburger in the topbar moves right when the sidebar expands, because the sidebar uses real layout space. When hidden, the hamburger returns left. Opening/closing does not change the active page.
- At **width <=900px**, the sidebar is an overlay with a dismiss scrim. Navigation closes it on mobile. Escape also closes it. The sidebar starts collapsed immediately after sign-in.

### Discounts (aligned to the already accepted Voucher page)

- View, server Calculation Preview, Edit, Activate/Deactivate, Archive and Activity Log remain permission-controlled icon actions with tooltips.
- Import CSV with Preview and Confirm remains unchanged, as do code/scope/eligibility rules and CSV export.
- The **PDF icon now downloads a genuine A4 landscape PDF report**, not a browser print preview. It uses the current filtered list, current tenant business name, and up to 1,000 records; for larger reports use CSV.
- Unlike Vouchers, Discounts are reusable promotional rules. Voucher code/barcode issuance, bulk voucher generation and voucher printing are **not** copied to Discounts.
- Mutation actions still go through the existing OWNER/ADMIN backend guard; other granted viewer roles remain view-only.

## Installation

1. Back up your current installed V2 source tree and keep the ZIP.
2. Extract this ZIP into `D:\www\tpos_main_v2\` with relative paths preserved; overwrite only included files.
3. Do **not** replace `.env`, rerun any migration, or modify tenant databases.
4. Run:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

5. Restart the frontend (if running in Vite development mode), then sign out/sign in or refresh with Ctrl+F5.

## Acceptance cases

1. As OWNER, open navigation on desktop: left sidebar is visible, topbar hamburger shifts right; hide navigation: hamburger moves left. Content does not fall under sidebar.
2. Verify groups and order. Change page while expanded: sidebar stays expanded on desktop. Collapse the Master Data group, re-expand it.
3. On a narrow browser/mobile viewport, open the menu, tap a page or the scrim and verify the overlay closes; Escape also closes it.
4. As CASHIER/ACCOUNTANT/MANAGER, verify only permission-granted pages show; do not show hidden management actions.
5. In Discount, verify View, Preview Calculation (OWNER/ADMIN), Edit, Activate/Deactivate, Archive, Activity Log, Import Preview/Confirm, and filtered CSV export; do not perform any financial checkout.
6. Filter Discount records and export PDF. Confirm the downloaded file is an A4 report with the tenant business name, the correct filtered records and page count. Exporting does not change any Discount or Voucher record.
7. Verify Voucher, Products, POS Terminal layout, SST settings and Service Charge were not changed by this package.

## Verification performed before packaging

- JSX and JavaScript parser: PASS for changed frontend modules.
- CSS parser: PASS.
- Navigation/Discount targeted regression: 6/6 PASS.
- PDF binary writer: `application/pdf`, valid A4 two-page test document, successfully rendered by `pdftoppm`.
- Full `npm test` and Vite production build: **not executed here** because dependencies are unavailable in the container (npm registry was inaccessible). Run both on the user's PC. No live tenant/browser acceptance has been claimed.
