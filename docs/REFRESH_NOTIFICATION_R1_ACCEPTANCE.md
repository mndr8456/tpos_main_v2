# TPOS Main V2 — Refresh Notification R1

Scope: all existing page-level Refresh actions (Users, Dashboard, Categories, Suppliers, Products, Discounts, Vouchers, Cash Shifts, Log Cash Drawer, Payment Methods).

## Installation
Extract to `D:\www\tpos_main_v2\` replacing full changed files only. No SQL or .env changes.

```bat
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```
Restart the frontend dev server only if Vite does not reload the new module automatically, then Ctrl+F5 once to load the patched frontend bundle.

## Acceptance
1. On Payment Methods save a setting and verify the green success notice appears. Click the **Refresh Payment Methods** icon: the notice disappears and data is reloaded without browser refresh.
2. Trigger a harmless error if available; click Refresh: the old error disappears; any **new** API error is shown if reload fails.
3. Repeat on Users, Dashboard, Categories, Suppliers, Products, Discounts, Vouchers, Cash Shifts, Log Cash Drawer.
4. After Save on any module, ensure success notice still appears after the module's ordinary background reload.
5. Search/filter state and open unsaved edit forms remain intact on page Refresh. Do not claim unsaved values were saved.
6. Verify permissions, SQL, transaction behavior and APIs are unchanged.

## Scope notes
- `refreshPage` clears the shared notice only from the user's Refresh button, then executes the module's existing API load.
- Authenticated GET requests use `cache: no-store` to avoid stale browser cache.
- New errors raised by the refresh request remain visible.
- Dashboard's internal error already resets on refresh; it now also clears the shared app notice.
