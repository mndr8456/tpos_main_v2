# Company Profile R1 — Foundation regression test correction

Affected: backend/tests/foundation.test.js only.

- Accept approved additive migration 042_tenant_company_profile.sql after 041.
- Preserve strict migration-list ordering.
- Preserve refusal of future unexpected 043+ migrations and V1/legacy paths.
- No runtime code, SQL, POS, CD, or accounting changed.

Apply over project root D:\www\tpos_main_v2.
Run: cd /d D:\www\tpos_main_v2\backend
Run: npm test

Note: local verification of the two previously failing assertions was 2/2 PASS. Full 765 test suite must be rerun on the user PC.
