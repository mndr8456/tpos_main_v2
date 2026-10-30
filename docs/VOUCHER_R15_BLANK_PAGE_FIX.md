# TPOS Main V2 — Voucher R1.5 Blank Page Fix

## Root cause

Voucher R1.4 uses the `Calculator` component in two React render paths (the voucher row Preview Eligibility action and the Preview modal), but removed `Calculator` from its `lucide-react` import. OWNER/ADMIN users who can manage vouchers encountered `ReferenceError: Calculator is not defined` while the voucher list rendered, producing a blank page.

## Files changed

- `frontend/src/Vouchers.jsx` — full replacement of the Voucher R1.4 file, restoring `Calculator` in the existing icon import. All R1.4 Import, Export PDF and Select Vouchers code remains present.
- `backend/tests/voucher-r15-ui-symbols.test.js` — regression that catches missing React component references before deployment.

## Install (Windows)

Extract ZIP into `D:\www\tpos_main_v2\` and replace the listed files. Do not remove the existing `frontend/src/voucher-pdf.js` or other Voucher R1.4 files.

```
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Restart/refresh frontend in the browser after the successful build. Backend restart and SQL migrations are NOT needed for this repair.

## Checks

- Local backend syntax: PASS
- Local regression: 142/142 PASS
- New guard tested against the broken R1.4 file: FAIL as expected; fixed file: PASS
- JSX symbol/syntax check: PASS (no TS2304 or syntax diagnostics)
- Frontend Vite build: NOT VERIFIED locally (`vite` is missing in the test environment). Verify using the Windows PC build above.
- Live Voucher page: PENDING PC user acceptance

No `.env`, SQL or unrelated modules are part of this ZIP.
