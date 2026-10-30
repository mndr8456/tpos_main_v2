# TPOS Main V2 — Discount R1 PC Acceptance Pack (R1.1)

Baseline: Discount R1 installed, `npm run db:discounts` returned CURRENT; backend PC regression previously 97/97 PASS. This package fixes one CSV round-trip bug for **negative sort_order**. It does not install or repeat SQL 009.

## Installation (only if applying the code fix)

Extract the changed-files ZIP into `D:\www\tpos_main_v2` preserving the existing directory structure. Replace `frontend/src/Discounts.jsx` only; `frontend/src/discount-csv-export.js` and `backend/tests/discounts-r1-roundtrip.test.js` are new. Supporting CSVs are under `docs/discount_r1_acceptance`.

Never replace `.env`, reset databases, rerun `--apply`, or delete live discounts. Run in `backend`: `npm run check` then `npm test`. Run in `frontend`: `npm run build`, then refresh the app. Expected new backend total: **100 PASS**, if the PC files match the original Discount R1 baseline.

## PC acceptance procedure — run in order

1. **Safe baseline:** Sign in as OWNER. Open Discounts. Confirm existing `WELCOME10` or other genuine discount records remain intact. Confirm the page stays within topbar width.
2. **Valid Order import:** Import `01_valid_order_discounts.csv`; Preview should show **2 valid rows**, then Confirm should create `TDR1A10` and `TDR1FIX5`. Activity Log must show two DISCOUNT_IMPORT entries with actual user name. Each test code must only be imported once.
3. **Negative sort round-trip:** Import `02_valid_negative_sort.csv` (sort_order `-10`). Export Discounts CSV. Open it in a text editor and confirm the TDR1NEG row contains `"-10"` rather than `"'-10"`. Preview the exported CSV. If other discounts already exist, preview may correctly flag duplicate codes; to verify parser compatibility independently, use the backend `npm test` round-trip case. **Do not Confirm import of an already-exported discount file into the same tenant.**
4. **Product target:** Import `03_valid_item_product.csv`. Expected one Item discount targeted to `PRD-000001`, provided this active SKU exists. Open View/Edit and verify the target; the discount must not apply to unrelated products. If SKU differs, edit the CSV target before preview.
5. **Category target:** Import `04_valid_item_category.csv`. Expected one Item discount targeted to active category `Masakan Panas`, if it exists. Open View/Edit, verify the category target.
6. **Duplicate safeguard:** Preview `05_invalid_duplicate_codes.csv` and confirm it is INVALID. Do not create any of those codes; Confirm must be disabled. No database writes from Preview.
7. **Atomic safeguard:** Preview `06_invalid_target_atomic.csv` and confirm it is INVALID because `SKU-NOT-FOUND-XYZ` does not exist. `TDR1GOOD` must also remain absent. Do not import partial rows.
8. **Row limit:** Preview `07_invalid_over_1000_rows.csv`. Expected `CSV_ROW_LIMIT` rejection. No records should be saved.
9. **Calculation preview:** With `TDR1A10` created, open browser DevTools Console on signed-in frontend (at `http://127.0.0.1:5174`). Paste the snippet below. Expected eligible subtotal RM60.00 gives a capped **RM5.00**. RM19.95 is below minimum RM20.00, so expected `MINIMUM_SPEND_NOT_MET` and RM0.00.
10. **Usage count:** View `TDR1A10`. `usage_limit=1`, but `usage_count` remains 0; management Preview must not redeem or reserve usage. Actual usage limit enforcement awaits POS transaction integration.
11. **Permissions:** Sign in with accounts that have and lack discounts.view/create/import/audit. Confirm UI restrictions and backend 403 responses. Roles must not inherit permission solely from a visible button.
12. **Regression:** Check Product, Category, Supplier, User, Dashboard remain unchanged. Verify frontend build and browser screenshots on the actual PC.

## Console calculation preview (read-only; does not redeem)

```js
(async () => {
  const base = 'http://127.0.0.1:5100/api/v2';
  const listResponse = await fetch(`${base}/discounts`, { credentials: 'include' });
  if (!listResponse.ok) throw new Error(`GET_DISCOUNTS_${listResponse.status}`);
  const data = await listResponse.json();
  const discount = data.discounts.find(x => x.discount_code === 'TDR1A10');
  if (!discount) throw new Error('Import TDR1A10 first');
  for (const subtotal of [60.00, 19.95]) {
    const response = await fetch(`${base}/discounts/${discount.id}/preview-calculation`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eligibleSubtotal: subtotal })
    });
    console.log({ subtotal, status: response.status, result: await response.json() });
  }
})();
```

The preview is a management diagnostic only, not a POS checkout or tax calculation. Do not send your session cookie, passwords or personal business data when sharing results.

## Expected result record

- `009_tenant_discounts.sql`: ALREADY CURRENT (no new SQL needed)
- Backend syntax + regression: re-test on PC
- CSV Preview/Confirm, target selector, calculation preview, role permissions: require user live proof
- Vite production build: require PC run
- Status: **NOT LOCKED** until live evidence and user acceptance.
