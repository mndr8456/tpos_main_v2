# TPOS Main V2 — Module 2: Category R1

## Basis and delivery

Clean Rebuild R9 (User module accepted). V1 reference: CategoryPage, CategoryDialog, and category.controller are **functional references**, not transplanted code. New Category module is tenant-isolated and has its own SQL file.

Changed/new files only. Do not replace `.env` or the previously accepted User module. New files are `database/004_tenant_categories.sql`, backend Category API/CSV/parser/tests, setup script, and frontend Category page. Existing app registration, tenant provisioning, source checks, and navigation have only the required additions.

## Features

- Categories list ordered ascending, instant name/description/station search, status filter, summary counts, refresh.
- Add, edit, activate/deactivate, **soft archive**; category name unique among non-archived rows.
- Preparation Stations: Kitchen, Drink, Dessert, Counter, None; add/edit optional stations, guarded deactivation.
- Permissions: `categories.view`, `create`, `update`, `delete`, `import`, `export`, `audit`, `stations.manage`.
- CSV import: template, choose file, preview without writes, confirm in **one transaction**, 200-row limit, rejection of duplicates/inactive stations.
- Export CSV and Print / Save PDF via the browser print dialog; both call permissioned export endpoint.
- Dedicated Category audit logs with actor, action, before/after data stored in DB; basic activity-log UI.
- **Action buttons are icons only** with native tooltip (`title`) and accessible name (`aria-label`). Form field labels and menu navigation remain text for clarity.

## Existing tenant setup (no DROP/DELETE)

After installing files in the existing clean-rebuild project, run from backend:

```cmd
cd /d D:\www\tpos_main_v2\backend
node scripts/setup-categories.js
node scripts/setup-categories.js --apply
node scripts/setup-categories.js
npm run check
npm test
```

Expected: after `--apply`, each ACTIVE tenant reports `CURRENT` in read-only mode. `--apply` uses `CREATE TABLE IF NOT EXISTS` and `INSERT IGNORE`, not data removal. The User SQL `003` is unchanged. For **new tenants**, the Category SQL is applied automatically during registration.

Then restart the backend and frontend with existing commands and open **Categories** through the hamburger navigation. The test user should have Owner/Admin permissions to add, edit, import and manage stations.

## PC acceptance (not yet verified)

1. Create two categories, verify ascending IDs, instant search, status filters and station selections.
2. Edit name/description and deactivate/activate. Archive one category; verify it disappears from normal list while audit remains.
3. Add a non-system Preparation Station, select it in a category; confirm deactivation is blocked while in use.
4. Download CSV template, preview valid and invalid CSV; confirm valid import, then verify imported rows and audit. Confirm duplicate name rejection.
5. Export CSV and use Print / Save PDF; verify the values and filters.
6. Verify a `categories.view`-only role can list but cannot mutate or access export/import/audit/station management endpoints.
7. Confirm existing User login/import/email functionality remains working. User R9 does not require retesting all prior cases unless actual regression occurs.

Status: local contracts/syntax only. Browser and MySQL live tests **PENDING**. No category data or DB was modified on the user's PC by this ZIP.
