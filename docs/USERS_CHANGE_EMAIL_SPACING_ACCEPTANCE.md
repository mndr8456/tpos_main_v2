# TPOS Main V2 — Users Change Email Spacing R1

## Scope
- Adds 16px vertical margin between Email and Current Password only inside the Change Email dialog.
- No change to password verification, registration, login, roles, or backend API.
- Keeps the accepted Register R1 source and Log Cash Drawer navigation/styles.

## Installation
1. Extract this Changed Files Only ZIP into the project root: `D:\www\tpos_main_v2`.
2. Replace the two full files under `frontend/src/`.
3. Run `cd /d D:\www\tpos_main_v2\frontend` and `npm run build`.
4. Refresh the browser (Ctrl+F5), sign in and open Users > Change Email for your own account.
5. Confirm Email input and Current Password label are separated, then check Edit User and Register are unchanged.

No SQL migration, backend restart, or .env change is necessary.
