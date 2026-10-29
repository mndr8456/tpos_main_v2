# TPOS Main V2 — Product R3 (Changed Files Only)

Baseline: `tpos_main_v2-LATEST_29102026_2058.zip` (29 October 2026).

## Install on the existing R2 system

1. Back up your tenant MySQL databases, current project and **backend/data/product-images/** (if it exists).
2. Extract the R3 ZIP into `D:\www\tpos-main-V2` and preserve its relative `backend/`, `frontend/`, `database/`, and `docs/` directories. Overwrite only files in this package. Do NOT copy any `.env`, `node_modules`, or image storage from this package; none is included.
3. In `D:\www\tpos-main-V2\backend`, run `npm run db:products:r3` first. Confirm `MISSING` only for tenants requiring this migration.
4. Apply **only the new Product R3 migration** using `npm run db:products:r3 -- --apply`; this is the **008** additive migration. Do not rerun `db:products -- --apply` for Product R2. Re-run `npm run db:products:r3` and confirm `CURRENT` for every active tenant. On any `FAILED` or `PRODUCT_R3_PARTIAL_MIGRATION_REVIEW_REQUIRED`, stop and investigate. The migration adds independent JKDM SST columns to the existing Product table; it does not recreate the module.
5. Run `npm run check` and `npm test` under backend, then `npm run build` under frontend. Restart the normal backend/frontend processes only after these checks succeed.
6. Make a full manual test using an authorized Product administrator/manager and at least two tenants.

## Changes

- Product CSV: at most 5,000 data rows, max 8 MiB per CSV. Both Preview and Confirm call the same validation/row parser; both accept 28-column R3, 25-column R2, and 21-column R1 formats. Import uses the existing atomic transaction and audit trail. The current template and frontend export include the 3 new JKDM fields.
- Bounded CSV Preview shows 100 rows per page. Product table also shows 100 rows per page. Master list read ceiling increased from 5,000 to 50,000 rows to prevent an exact 5,000-row import from hiding prior products.
- Product form displays prices, component quantities, packaging quantities and thresholds to two decimal places; stored data/import CSV is **not silently rounded by display formatting**.
- LHDN/MyInvois classification/tax metadata remains independent of JKDM SST tax type (`NONE`, `SALES_TAX`, `SERVICE_TAX`), rate and inclusive flag. Existing products migrate with `NONE` / 0.000 / false. User must choose applicable rates based on their actual registration and tax treatment.
- Product Image is chosen using a local file input and preview. The image is uploaded through authenticated JSON API only after Product master data saves, with 2 MiB file limit, PNG/JPEG/WebP signature and MIME checks, random server filenames and per-tenant filesystem isolation under `backend/data/product-images/<tenant-id>`. Reading images requires `products.view`; uploading requires `products.update` and the existing Product cost permission. Old HTTPS image links remain in existing data until replaced, but the editable URL input is removed.
- Existing Single, Set, Bundle, Pack, Box, Carton, barcodes, component relations, branch prices and import/export behavior is retained. Action buttons remain icons with tooltips.

## Image upload safety and recovery

- The authenticated image route is `POST /api/v2/products/:id/image` with `{base64, mimeType}`. The read route is `GET /api/v2/products/:id/image`.
- There is no public static mount for tenant images. Do not expose `backend/data/product-images/` through a web server or include tenant folders in source ZIP deployments.
- If Product creation/update succeeds but image upload fails, Product remains saved; the UI reports this clearly. Reopen the Product, select the file again, and save. Old image files are removed after successful replacement only.
- Server filesystem must permit the backend process to write under `backend/data/product-images/`. For production, include this directory in the tenant-data backup policy.

## Acceptance checklist (manual PC / MySQL)

- [ ] `db:products:r3` reports `CURRENT` for every active tenant after R3-only migration.
- [ ] Existing R2 products and barcodes/Set/Bundle/Pack/Box/Carton structures survive unchanged.
- [ ] CSV Preview accepts 5,000 valid rows and rejects 5,001 with `CSV_ROW_LIMIT`.
- [ ] Confirm imports 5,000 rows in a tenant; database counts match; reject invalid CSV without partial Product inserts.
- [ ] Product list and import preview pages navigate correctly; search, filters and CSV/PDF exports still operate.
- [ ] Prices, minimum stock quantity and Set/Bundle/packaging quantities display `0.00`.
- [ ] LHDN fields and JKDM Sales Tax / Service Tax can be edited independently and reloaded accurately.
- [ ] Image Choose File previews PNG/JPEG/WebP, saves and reloads; invalid/non-image and over-2-MiB images are rejected.
- [ ] Image is inaccessible without authentication, and Tenant B cannot see Tenant A's image.
- [ ] User, Category, Supplier and Dashboard still pass their manual regression checks.

## Automated tests performed in source workspace

- Backend `npm run check`: **PASS**.
- Backend `npm test`: **86 passed, 0 failed** (test suite includes six Product R3 tests). The test workspace used temporary `.env` values copied from `.env.example`; no actual MySQL instance was used in automated tests.
- Frontend JSX parse via locally available TypeScript compiler: **PASS** (zero parse diagnostics).
- Frontend `npm run build`: **NOT VERIFIED** in this environment (`vite: not found`). Installing dependencies via npm was attempted but timed out / had missing offline packages. Run the actual Vite build on the development PC before acceptance.
- No live authenticated image uploads, MySQL migration, or 5,000-row transactional imports were performed against a real tenant database here. Accept R3 only after the manual PC tests above.
