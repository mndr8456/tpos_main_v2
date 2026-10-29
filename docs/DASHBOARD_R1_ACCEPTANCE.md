# Dashboard R1 — Implementation & Acceptance

New route: `GET /api/v2/dashboard/overview`; requires authenticated tenant and `dashboard.view` permission. This is initialized by `005_tenant_dashboard.sql`, separate from Users and Category SQL.

Default grants: OWNER, ADMIN, HR, MANAGER. All other roles default to no dashboard access. A later Role Permissions page may offer a checkbox for each non-Owner role. **OWNER permissions must be permanently checked and non-removable** in that later editor and in its API; merely disabling a UI checkbox will not be sufficient. Do not implement Role Permissions UI by altering baseline grants directly.

**Actual records now**: user totals (active/inactive/locked), categories, preparation stations, active branches and last ten user activity log events. Data scoped to authenticated tenant. No invented sales or stock values.

**Pending modules**: Sales totals, sales trends, bestselling products and inventory/low stock remain `available: false` and show an explicit unavailable state. Connect them to validated transaction data after corresponding rebuilt modules are completed. Do not show zero instead of unavailable.

Installation on previously registered tenants:

```
cd /d D:\www\tpos_main_v2\backend
node scripts/setup-dashboard.js
node scripts/setup-dashboard.js --apply
node scripts/setup-dashboard.js
npm run check
npm test
```

Browser acceptance: sign in as OWNER/ADMIN/HR/MANAGER; dashboard first, displays actual tenant users/categories/activity; refresh icon works; icon-only quick access and accepted sidebar behavior retained. Sign in as another role; dashboard absent unless future explicit permission enabled. Test tenant isolation and deny `/api/v2/dashboard/overview` without required permission. User and Category regressions must pass. No SQL changes to original foundations, no `.env` changes.
