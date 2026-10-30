# Discount R1.3 — Role Permissions Acceptance

Baseline: TPOS Main V2 Discount R1.2 on the user's PC.
Scope: Discount role grants, Preview Calculation authorization and UI visibility only.
Existing Discount records, Product, Category, Supplier, User, Dashboard and Voucher are unchanged.

## Policy

| Role | View Discount | Create / Edit / Status / Archive | Preview Calculation | Import / Export / Audit |
|---|---|---|---|---|
| OWNER | Yes | Yes | Yes | Yes |
| ADMIN | Yes | Yes | Yes | Yes |
| MANAGER | Yes | No | No | No |
| ACCOUNTANT | Yes | No | No | No |
| SUPERVISOR | Yes | No | No | No |
| CASHIER | Unchanged | Unchanged | Unchanged | Unchanged |

The backend checks both explicit permissions and active tenant OWNER/ADMIN role membership for every privileged Discount endpoint. Preview Calculation uses a dedicated `discounts.calculate` permission. No Discount usage is posted.

## Installation (Windows CMD)

1. Back up the current application source and tenant database before applying grants.
2. Extract the ZIP at `D:\www\tpos_main_v2\` and replace only files listed in the manifest. Do not overwrite `.env`.
3. In `D:\www\tpos_main_v2\backend` run:

```bat
npm run db:discounts:permissions
npm run db:discounts:permissions -- --apply
npm run db:discounts:permissions
npm run check
npm test
```

4. In `D:\www\tpos_main_v2\frontend` run:

```bat
npm run build
```

5. Restart backend, refresh frontend, **log out and log back in** to refresh the profile permissions on the UI.

**Important:** Only `010_tenant_discount_role_permissions.sql` applies to existing tenants. **Do not rerun SQL 009** or earlier Product migrations. Script is read-only unless `--apply` is specified and will show `CURRENT` after success.

## Live role checks

- OWNER / ADMIN: Discounts displays Add, Import, Export, Audit, and row buttons View, Calculator, Edit, Archive. Verify Edit/Status/Archive and Preview Calculation remain functional.
- MANAGER / ACCOUNTANT / SUPERVISOR: Discounts displays table, search, filter and **View** action only. Add, Import, Export, Audit, Calculator, Edit, and Archive must not appear.
- CASHIER: verify existing access is unchanged.
- For an authorized read-only user, try a prohibited direct API call using that user's normal signed-in session. `POST /api/v2/discounts/:id/preview-calculation` and `POST /api/v2/discounts` should respond **403**. Do not try these against real live data without safeguards.
- For OWNER / ADMIN, confirm Preview Calculation remains read-only, including Usage Limit simulation.

Expected: tenant DB permissions are refreshed per request. UI grants may not update until re-login. Other module permissions and records must not change.

## Acceptance status

Automated regression suite verifies route protection, role policy migration and frontend action permissions. Live MySQL permission readback, PC frontend Vite build and live tests with distinct accounts are still required for final PASS/LOCKED.
