# TPOS Main V2 — Company Profile R1 (Phase 1)

Base: `tpos_main_v2 LATEST_071120262210.zip`. This is a **changed-files-only** patch. CD R1.7 stays LOCKED. No receipt, checkout, KDS, payment or Customer Display implementation files are changed.

## Install

1. Back up project and MySQL tenant databases first.
2. Extract the ZIP into `D:\www\tpos_main_v2` (the ZIP contains `backend/`, `frontend/`, `database/`, `docs/` at root).
3. Backend directory: `npm run db:company-profile` (dry run, no changes). Verify tenants show `MISSING_OR_PARTIAL` or `CURRENT`.
4. Backend directory: `npm run db:company-profile -- --apply` (additive migration 042 for **all active tenants**).
5. Backend directory: `npm run db:company-profile` (must show `CURRENT` across tenants).
6. Backend directory: `npm run check` then `node --test tests/company-profile-r1.test.js`, then full regression `npm test`.
7. Frontend directory: `npm run build`, restart backend/frontend, and sign out/in once to refresh tenant permissions.

## Live PC acceptance

- Owner/Admin: Settings → Company Profile exists. Registered name, business type, SSM, old SSM and trading name remain read-only; they are identifiers for a later controlled identity-edit process.
- Update Address 1/2/**3**, postcode, city, state, country, phone, contact email, and TIN; Save, refresh browser, confirm persists.
- Activity Log shows actor, time and changed fields.
- Cashier cannot open the Settings page or call authenticated Company Profile APIs.
- Verify tenant isolation, existing GST/SST settings unchanged, POS print unchanged, and CD R1.7 pairing/print/success unchanged.
- New tenant registration provisions 042 after 041.

## Scope exclusions

No Receipt Settings or MyInvois development in this phase. No automatic QR on receipt. Company TIN is stored solely at `company_registrations.tin`; SSM registration number is the business registration identity.
