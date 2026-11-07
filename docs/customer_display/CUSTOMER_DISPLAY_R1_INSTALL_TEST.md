# TPOS Main V2 — Customer Display R1 / Migration 041

**Status:** Development build (not live-accepted). This changed-files package is based on `tpos_main_v2 LATEST_06112026_2220.zip` with accepted Order Terminal R1/R1.1 and KDS R1 patches. Preserve all LULUS/LOCKED modules and data.

## Scope

- Landscape customer-facing monitor: LEFT live POS item / quantity / unit price / line total / authoritative total, RIGHT OWNER-managed PNG/JPEG/WebP or muted MP4 playlist.
- Full-screen CASH (shows actual posted cash change for a configurable duration, then bilingual Thank You), DuitNow/E-Wallet static QR (merchant image + due amount; pending real cashier verification), plus manual bank/card pending state.
- English and Bahasa Melayu success text OWNER configurable; promotional playlist, timers and enable/disable OWNER configurable.
- Own cashier + branch display pairing with random token hash, 12-hour expiry, replacement revokes previous pair; ephemeral token only in URL fragment, held in display page memory, erased from address bar, never written to browser storage.
- ORDER snapshot is server-side using existing POS exact decimal logic; payment success is read from persisted `pos_sales`, not inferred from QR exposure, image upload or Reference No alone. Evidence, merchant keys, credentials and cashier identity never leave POS.
- Legacy 15-minute QR-only display tokens continue working; old `pos/customer-display/view` endpoint retained. KDS, Waiter, Inventory, Cash Shift and accounting posting code are unchanged.

## PC installation

1. Stop backend/frontend. Back up **V2** central and tenant databases and the complete V2 source directory. Never touch V1 databases.
2. Extract ZIP to `D:\www` with **Overwrite/Replace**; it contains complete changed files only. Keep your `.env` and tenant data unchanged.
3. In a CMD terminal:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node scripts/verify-customer-display-r1.js
npm run db:kds
npm run db:customer-display
```

4. Before `--apply`, require tenant 1 (and each active tenant) to report `MISSING_OR_PARTIAL`, `repairable:true`, `invalid:[]` and `blockers:[]`. On `MANUAL_REVIEW`, stop and share the logs; do not apply manually.

```cmd
npm run db:customer-display -- --apply
npm run db:customer-display
node --test tests/customer-display-r1.test.js
npm test
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

5. Final migration status must be `CURRENT` for every active tenant, `failed:0`. Restart backend/frontend, reload POS and sign in again to load new permissions. Owner/ADMIN may open Settings > Customer Display; only OWNER can edit and upload.

## Live Acceptance checklist

1. OWNER saves English/Malay success messages, Welcome, promotion ON/OFF, media duration, cash change duration, success duration.
2. OWNER uploads valid image(s) and MP4; verifies ordered playlist, fullscreen, muted video, image/video rotation and rejects spoofed/oversized files.
3. CASHIER starts Cash Shift and selects branch, clicks **Open Customer Display** (allow browser popups), moves window to external monitor; customer page shows `Connected` and Idle welcome/playlist. Re-pair invalidates prior screen; link expires in 12 hours. Reloading a paired CD tab clears its in-memory token, so pair it again from POS for safety.
4. POS Take Away and Dine In; add/delete/quantity edits; customer sees actual product, quantity, unit price, per-line total and authoritative bill total. Discount/SST/rounding follow server policy. A WAIT​ER order appears only after CASHIER Receive and Resume in POS.
5. Cash Payment: Full Screen payment waiting; after real confirmed sale, show real tender and change for 5 sec (Owner configurable), then chosen Thank You English/Malay then Idle. Receipt must remain correct.
6. DuitNow QR: Full Screen merchant QR plus exact amount and Awaiting Cashier Verification. Captured transaction evidence and Reference No alone must NOT trigger success; only manual `Pay — Manually Verified` with the actual merchant evidence/account check and persisted sale triggers Thank You.
7. Test E-Wallet QR and Bank/Card verification without falsely labeling automatic provider integration; SARA remains disabled pending certified provider.
8. Test two different cashiers/branches for strict isolation, invalid token, rotated token, session expiry and permission denial. Verify public display does NOT show private evidence, PIN, stock cost or payment reference.
9. Test after Hold, Discard, cart change during pending QR, a rejected payment and offline network; no stale successful status.
10. Confirm no regressions in WAITER R1.1, KDS R1, Restaurant Tables, POS Receipt/Payment, Stock valuation and accounting journals.

**Do not mark LULUS / LOCKED until user confirms live tests on PC.**
