# Supplier R1 — TPOS V2 Clean Rebuild

## Scope
Supplier master records in an isolated tenant DB. This follows the six supplier fields in `_v1-reference` (name, contact, phone, email, address, status), with a tenant-local, automatically assigned supplier code for future Product linkage.

- CRUD: create, list, edit, activate/deactivate; archive instead of physical deletion.
- Search and status filter update instantly on typing/selection.
- CSV: template, read-only preview, duplicate validation, atomic import and audit.
- Export CSV and printer/PDF report with the registered Business Name (no copyright footer).
- Access control: separate permissions for view/create/update/delete/import/export/audit, with explicit default grants.
- User, Category, Dashboard, Login and .env not reset.

## Tenant database

`database/006_tenant_suppliers.sql` (separate SQL per module). New tenant setup invokes it after 005 Dashboard. Existing tenants run `node scripts/setup-suppliers.js` for read-only status, then `--apply` once and check `CURRENT`.

## PC checks

1. Backend: `npm run check`, `npm test`.
2. Frontend: `npm run build`.
3. In browser, sign out/in to refresh permission claims, then open Suppliers.
4. Create supplier with contact, phone, email, address; verify generated supplier code.
5. Test edit, immediate search, status filter, activate/deactivate, audit.
6. CSV template → preview → import; confirm duplicate names are refused and none are partly imported.
7. Test CSV export and printer/PDF with Business Name and no copyright footer.
8. Archive a test supplier and verify it disappears without destroying audit.

## Verification boundary

Local 60/60 automated tests and backend syntax tests pass. JSX syntax was parsed successfully with TypeScript parser. MySQL execution and live browser checks require PC evidence. Do not mark this module PASS based only on local tests.
