# TPOS Main V2 — Dashboard R1.1: Accountant & Supervisor access

## Purpose
Add `dashboard.view` to ACCOUNTANT and SUPERVISOR without modifying other roles or Discount R1.3.

**Existing Dashboard roles retained:** OWNER, ADMIN, HR, MANAGER.
**New Dashboard roles:** ACCOUNTANT, SUPERVISOR.
**CASHIER:** unchanged; does not gain Dashboard.

The frontend already reads `dashboard.view` to decide whether to show the Dashboard sidebar entry and use Dashboard as the landing page. No frontend files need to be replaced.

## Changed files
- `database/011_tenant_dashboard_accountant_supervisor.sql` — additive, idempotent permission grant for the two roles only.
- `backend/scripts/setup-dashboard-roles.js` — read-only checker and explicit `--apply` installer for existing active tenants.
- `backend/src/tenants.js` — runs 011 on new tenant provisioning after 010.
- `backend/package.json` — new CLI script and syntax check.
- `backend/tests/dashboard-roles-r11.test.js` — regression checks.
- `backend/tests/foundation.test.js` — append 011 to the expected migration list.
- This document.

## Installation
Extract the full-file changed files ZIP at the existing V2 root (e.g. `D:\www\tpos_main_v2`). Preserve relative paths. No `.env`, SQL 005, or SQL 010 needs to be reapplied.

Run in backend:

```bat
cd /d D:\www\tpos_main_v2\backend
npm run db:dashboard:roles
npm run db:dashboard:roles -- --apply
npm run db:dashboard:roles
npm run check
npm test
```

Expected for each active tenant: initial `MISSING` (if not previously granted), then `APPLIED`, then `CURRENT`. After the migration has been applied, running `--apply` again must return `CURRENT` without changing the database. When an active tenant cannot be updated, the installer prints `FAILED` and exits nonzero. **Do not repeat SQL 005, 009 or 010.**

Restart backend if running an earlier code version. Log out and sign in again as ACCOUNTANT or SUPERVISOR. `GET /api/v2/auth/me` reloads permissions on each request after authentication, so the grant applies from the tenant database.

## PC acceptance checklist
1. Sign in as ACCOUNTANT: Dashboard is the first page, sidebar includes Dashboard, and its tenant data loads.
2. Sign in as SUPERVISOR: same Dashboard behaviour.
3. Sign in as OWNER, ADMIN, HR and MANAGER: their existing Dashboard access still works.
4. Sign in as CASHIER: Dashboard remains unavailable (unless separate authorised permissions have been deliberately assigned outside this policy).
5. Sign in as ACCOUNTANT/SUPERVISOR and open Discounts: **View only**; no Create/Edit/Delete, Import/Export, Activity Log or Calculation Preview actions.
6. If a role lacks `dashboard.view`, the protected `GET /api/v2/dashboard/overview` API returns 403. Never rely only on sidebar visibility for authorisation.
7. Frontend build (source unchanged):

```bat
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

## Status
Static SQL and backend regression tests pass in the development environment; real MySQL installation and each role's browser behaviour require PC acceptance. Do not mark LOCKED until confirmed.
