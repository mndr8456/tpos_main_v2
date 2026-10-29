# TPOS Main V2 — Fresh Rebuild / Foundation R1

**This is a NEW application built from zero.** The former V1/V2 source code, migrations and datasets are **not included**. The prior package.json files were reviewed for relevant dependency names only, and reduced to dependencies used by this new code. `_v1-reference` was consulted only for desired Users features and roles, and is not copied into this ZIP.

## Safety boundary

- Install to a **new folder**, for example `D:\www\tpos-main-V2-rebuild`, rather than overwriting the existing application. Rename the unzipped folder if needed.
- Clean rebuild database names: `tpos_v2_central` and `tpos_v2_tenant_<id>`. Use these names only after confirming the former MySQL databases were removed or are intentionally reserved for this rebuild; the installer never drops or overwrites databases. Any unrelated V1 databases remain untouched.
- **No automatic deletion of old databases or folders.** Back up and obtain deliberate final confirmation before deletion. No `DROP DATABASE` SQL is included.
- `backend/.env` is **new and contains placeholder database credentials only**. Edit it locally. Do not send real passwords to chat or commit them to version control.
- For this initial local development foundation, the backend DB account must have `CREATE DATABASE` permission for new tenant provisioning. Production deployment requires splitting provisioning privileges from runtime permissions, additional deployment hardening and live tests.

## Windows CMD installation after manual extraction

1. Edit `backend\.env`: replace `CHANGE_ME_DB_PROVISION_USER` / `CHANGE_ME_DB_PASSWORD` with an authorized local MySQL 8.4 account. Leave the NEW database names unchanged. The frontend `.env` already points to port 5100.
2. Open CMD #1:

```cmd
cd /d D:\www\tpos-main-V2-rebuild\backend
npm install
npm run check
npm test
npm run db:setup
npm run dev
```

3. Open CMD #2:

```cmd
cd /d D:\www\tpos-main-V2-rebuild\frontend
npm install
npm run build
npm run dev
```

4. Visit `http://127.0.0.1:5174`, click **Register Business**, enter business identity, full address and Owner credentials. A NEW tenant DB and Owner user are provisioned from SQL. Sign in with Owner email (Tenant ID never needs manual entry).

If you use a different Windows extraction directory, update the `cd` path. No installer `.cmd` files are included.

## SQL isolation per module

- `database/001_central.sql`: tenant registry and email directory ONLY.
- `database/002_tenant_foundation.sql`: profile, SSM/TIN/SST and branch ONLY.
- **`database/003_tenant_users.sql`: ALL Users-related tables**: users, roles, permissions, role grants, user roles, branch access, sessions and activity logs. One independently versioned SQL file per module, applied to each new tenant DB. All future modules will have their own separate `.sql` files.

## Foundation R1 currently implemented

- New business registration / automatic NEW tenant database provisioning.
- Company profile with Malaysian address and a single SSM identity (separate old SSM/TIN/SST).
- Owner account, email-only login with tenant auto-resolution, hashed password, opaque session cookie, account lock after five incorrect attempts, logout and password change.
- Users: role/branch assignment, Add/Edit, status change, account unlock, temporary password reset, activity log CSV export, secure CSV import (template / preview / atomic confirmation), basic auto-search/status.
- No Loyalty modules. Sidebar starts collapsed, toggle on the left.

## Not yet COMPLETE / next acceptance

- No real MySQL 8.4 registration or login test has been run in this environment. All live operation depends on the PC test.
- Users module still needs deeper integration and validation: production least-privilege database separation, administrator recovery after partial provisioning, live CSV bulk import testing, account lifecycle edge cases, extensive privilege tests and acceptance testing. Do not label it PASS until demonstrated on the user's PC.
- Modules 2–9 remain unimplemented: Category, Supplier, Product, Discount, Voucher, Shift Cash, Cash Drawer Log and full production POS Terminal. Customers, Staff Profiles and Attendance will be scoped later; only Loyalty is excluded.
- No prior POS, Inventory or Sales Return data has been transferred. This package is intentionally an empty clean slate.

## Test policy

`npm run check` and `npm test` validate syntax and contract/security rules only; they do not prove SQL execution or browser functionality. A browser recording, backend output and actual MySQL checks must be reviewed before marking foundation or Users PASS.
