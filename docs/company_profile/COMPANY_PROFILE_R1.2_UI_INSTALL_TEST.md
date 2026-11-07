# TPOS Main V2 — Company Profile R1.2 UI Correction

Baseline: `tpos_main_v2 LATEST_071120262210.zip` + installed Company Profile R1, R1.1 and Foundation Test Fix.

## Scope

- `frontend/src/CompanyProfile.jsx`: Use approved shared `refreshPage(load, notify)` to clear the global success/error notification on explicit Refresh; retain post-save success messages.
- Refresh and Activity Log: icon-only `action-icon` buttons with `title` and `aria-label`.
- Save label: `Save` (or `Saving...` during request), no changes to permission or validation.
- `backend/tests/company-profile-r1.2-ui.test.js`: targeted regression assertions.

No database migrations or API changes. Locked Customer Display R1.7, POS receipt and all other modules remain unchanged.

## Install

Extract ZIP to `D:\www\tpos_main_v2`, preserve folder structure and replace corresponding files. Restart frontend dev server if required.

## Test on PC

```bat
cd /d D:\www\tpos_main_v2\backend
node --test tests/company-profile-r1.test.js tests/company-profile-r1.2-ui.test.js
npm test
npm run check

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

## Live acceptance (Owner / Admin)

1. Open Company Profile, change a permitted field and Save. Success notification appears and data persist.
2. Click **Refresh icon**. Previous notification disappears immediately and latest data reload without browser refresh, with no new success notice.
3. Confirm Refresh and Activity Log are icons only; mouse hover shows tooltips and keyboard focus has accessible names.
4. Click Activity Log icon and verify saved changes appear.
5. Confirm compact **Save** button and its disabled/saving behaviour.
6. Ensure Customer Display and POS receipt remain as previously accepted.

Status: PENDING LIVE PC ACCEPTANCE. Do not mark LULUS before user confirmation.
