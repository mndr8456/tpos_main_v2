# TPOS V2 EINV Sandbox v1.0 R1.1 — legacy-route recovery

## Verified from PC log
- Migration 052 tenant 1: CURRENT (do NOT reapply).
- Backend npm run check: PASS; frontend Vite: PASS (1681 modules).
- Backend npm test: 980 PASS / 7 FAIL, all seven missing R4.1–R4.6 route assertions in `backend/src/app.js`.
- User PC contains R4 test files and likely R4 modules that are **not** present in the November 10 source ZIP. The R1 full-file patch overwrote `app.js` with that older baseline.

## Recovery first (no blind route creation)
1. Make a separate complete backup of your current PC source and tenant database.
2. Extract this recovery ZIP into the TPOS V2 project root, keeping folder structure. It adds ONLY the recovery script and this guide.
3. From the **backend** folder run:
   ```powershell
   node scripts/recover-einvoice-routes-r11.js
   ```
4. It searches `app.js` backups and local Git history, requiring proof of all R4.1–R4.6 route markers. If it prints `BLOCKED_NO_VERIFIED_R46_SOURCE`, obtain your last pre-R1 `backend/src/app.js` (e.g., from your complete PC backup). Run:
   ```powershell
   node scripts/recover-einvoice-routes-r11.js --source="D:\\backup\\backend\\src\\app.js"
   ```
5. If preview displays `PREVIEW_ONLY`, then apply:
   ```powershell
   node scripts/recover-einvoice-routes-r11.js --apply
   ```
   For a manual source, append the same `--source=...` option with `--apply`.
6. Run tests:
   ```powershell
   npm run check
   npm test
   ```
   In the frontend folder run `npm run build`.

## Safety
The script never edits the database, migration or other modules. It restores a VERIFIED legacy app.js candidate, adds the four Sandbox v1.0 route registrations, checks Node syntax, and backs up the existing `app.js` before writing. It stops without changes if the full legacy route source is unavailable. **Do not send an invoice to Sandbox until all regression tests and business validation pass.**

If the script reports BLOCKED, share a full ZIP of the current PC source including R4.1–R4.6 handlers and tests. No routes should be guessed from test names.
