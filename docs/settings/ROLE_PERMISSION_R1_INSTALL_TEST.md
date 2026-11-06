# TPOS Main V2 — Settings / Role Permission R1

**Source baseline:** `tpos_main_v2 - Latest_05112026_1853.zip`, with the supplied V1 reference.  
**Scope:** 22 implemented permission modules, Order Terminal and KDS as explicitly planned, 10 roles, CRUD + non-CRUD special permissions. 

## Important data protection

1. Make a backup of `tpos_v2_central` and all active `tpos_v2_tenant_%` databases before applying migration 034.
2. Stop backend and frontend before merging this patch into `D:\www\tpos-main-V2` (the ZIP includes only changed files under `tpos_main_v2/`). Do **not** overwrite `.env`, tenant data or earlier SQL migrations.
3. Run read-only installer check before applying anything. Only execute `--apply` after verifying you are connected to the intended V2 central/tenant databases.
4. Do not rerun migration 033 manually. Migration 034 is additive and does not alter an existing grant except by copying existing legacy `*.manage` defaults into independent CRUD grants **once**.
5. The installer records `role_permissions_r1_034` in `tpos_feature_setup_history`. Subsequent checks return `CURRENT`; it must not reset saved Role Permission choices.

## Windows commands

```cmd
cd /d D:\www\tpos-main-V2\backend
npm run check
npm run db:role-permissions
npm run db:role-permissions -- --apply
npm run db:role-permissions
node --test tests/role-permissions-r1.test.js
npm test

cd /d D:\www\tpos-main-V2\frontend
npm run build
```

Expected installer statuses: **MISSING → APPLIED → CURRENT**, `failed:0`. Run `--apply` only once, after backup.

## PC acceptance checklist

- Log in as OWNER: Settings → Role Permission appears. Verify 10 role columns, all active modules, C/R/U/D rows and special permission rows, including Attendance Clock, Leave Requests, Cash Shifts and Inventory.
- Confirm OWNER column is noneditable, including from requests sent directly to the API.
- Confirm all other role columns have checkboxes for supported actions; planned/unimplemented operations are displayed disabled as *Not implemented*, not falsely granted.
- Log in as ADMIN: ADMIN/OWNER are protected; only other roles can be changed, and ADMIN cannot grant permissions it does not possess.
- Toggle one permitted grant, enter Change Reason (minimum four characters), Save. Confirm Activity Log includes actor, role, permission key, action and full reason.
- With another browser/session, change the same role and Save an older snapshot: expect `ROLE_PERMISSION_STALE_RELOAD_REQUIRED` and no partial changes.
- Grant `categories.view` to a test CASHIER user as OWNER, re-login CASHIER: Categories appears only with its explicit permission; remove the grant and verify backend denies direct GET `/api/v2/categories`.
- Grant `categories.create` to an appropriately authorized role without `categories.update`: Create endpoint must work if domain checks pass; Update endpoint must return `PERMISSION_DENIED`. This confirms a legacy broad `manage` grant cannot bypass granular permissions.
- Confirm Leave Requests Import permission is not surfaced, CSV Import remains removed, and historical approved Leave/Attendance records are not modified.
- Confirm role permissions are tenant-isolated. Changing tenant 1 must not affect any other tenant.
- Confirm opening/closing hamburger and existing module menus behave exactly as in accepted operational navigation R1; no automatic re-grants after saving a permission.
- Test mobile/tablet horizontal scrolling of the matrix.

## Core design boundaries

- Only OWNER/ADMIN identity, with explicit Role Permission grants, may access these APIs. The OWNER role *itself* is locked. ADMIN may not change its own role. Direct API checks enforce this.
- For ADMIN to grant a permission to another role, ADMIN must already possess that permission.
- Create, Read, Update and Delete checkboxes are bound to real, implemented API capabilities; unsupported actions are disabled, not invented. Special actions (approval, audit, shift close, clock punch, Stock In, etc.) retain their own permissions and business rules.
- Import and Export are **not provided as buttons or permission choices** on Role Permission. Existing independent module import/export functionality and grants are preserved, not changed by this patch.
- No Reset Defaults or bulk permission seeding through the user interface.
- Legacy combined `*.manage` permission is still used by some existing import/management workflows. Actual mapped CRUD API endpoints require their granular permissions once 034 is installed. Existing self-only, branch, financial and leave approval restrictions continue to apply.
- Changes become authoritative at the next authenticated API request. The existing browser's navigation may need sign out/sign in or reload to reflect updated permissions.
- No testing against real MySQL or frontend Vite build was performed in the delivery environment; PC acceptance is required before LULUS/LOCKED.
