# TPOS Main V2 Clean Rebuild — Users R4: Icons, Footer and CSV Import

This is a **complete source file** update built on the accepted R3 foundation. Copy full files to the existing rebuild folder. **Preserve the PC's configured backend/.env**; the ZIP contains a placeholder template for clean installations only.

## UI changes

- Remove the temporary "Modules 2–9..." sidebar note.
- Show `© 2026 TPOS V2 — MNII Alpha Ent` only in the workspace footer.
- Sign Out, Activity Log, Import Users, Export Users CSV, Add User and row actions use icons with accessible aria labels and title tooltips.

## Users Import

- The CSV template follows `_v1-reference` Users headers: `full_name,username,email,phone_no,role,status,temporary_password`, with optional `branch_code` added for multi-branch tenants.
- User imports are **create-only**, maximum **50 rows / 256 KiB**, validated before any writing.
- Passwords are validated, hashed and required to change on next login; they must never appear in the preview or audit log.
- Duplicate emails (across the central directory), duplicate usernames, forbidden OWNER role, invalid branch and non-permitted branch are rejected.
- All tenant rows, role/branch access, central login directory and audit logs are written in **one MySQL transaction**. On any error, none of those rows should remain.
- Requires `users.manage`; no database migration or grant change.

## PC test

1. Restart backend and frontend, visit Users and check sidebar, footer and icon tooltips.
2. Open **Import Users** icon, Download CSV Template, add one **unique test account**. Enter `MAIN` as branch_code or leave blank when exactly one active branch exists. Use temporary password with 12+ characters containing a letter and digit.
3. Upload CSV > Preview Import. Check displayed name, username, email, role, status and branch; **password must not appear**.
4. Confirm Import. Check user appears once and can log in (password change required on first login).
5. Try re-importing the same CSV. It must be rejected without duplicate users.
6. Try CSV with invalid role, OWNER, invalid branch or duplicate rows. It must not create users.
7. Test normal Add/Edit/Export/Activity Log/Sign Out, and check previous tenant still works.

### CMD test (only after manual file installation)

Backend: `npm run check`, `npm test`, then restart `npm run dev`.
Frontend: `npm run build`, then restart `npm run dev`.

Local automated tests do not establish MySQL runtime or browser acceptance. No prior database must be dropped or migrated.
