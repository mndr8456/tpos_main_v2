# TPOS V2 Clean Rebuild — User Foundation R1 Test Sheet

STATUS: PENDING PC LIVE PROOF. DO NOT MARK PASS FROM LOCAL SYNTAX TESTS.

1. Set up the clean rebuild central database `tpos_v2_central` using `npm run db:setup`. Confirm the name is available for this rebuild before running. Existing databases must not be dropped or overwritten.
2. Register a new business with full address, business type, one SSM number and separate TIN/SST.
3. Check a NEW tenant DB exists with tables from `002_tenant_foundation.sql` and `003_tenant_users.sql`.
4. Login by Owner EMAIL, no Tenant ID; business identity and role appear in workspace.
5. Add a new Cashier assigned to Main Branch; test duplicate email, duplicate username and invalid branch.
6. Sign in as Cashier with temp password: password change required, user management denied.
7. Wrong passwords: 5 attempts trigger account lock; Owner can unlock.
8. Test Edit, Disable and Re-enable a non-owner account; old sessions invalidated.
9. Check Last Login, Audit Log, Status auto-filter and CSV export.
10. Try to change/deactivate Owner via User editor: must be blocked. Check branch isolation with another tenant.
11. Do not proceed to Category module or database cleanup until these live results are reviewed.
