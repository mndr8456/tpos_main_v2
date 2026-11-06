# TPOS Main V2 — POS Receipt R2.1.5 + R2.1.6

## Purpose

R2.1.5 corrects missing rate labels in POS receipts. Save the effective Sales Tax, Service Tax and Service Charge percentages at posting time, not only their amounts. The receipt prints the percentage for every enabled Sales/Service Tax (even if its amount is RM 0.00) and, when applicable, Service Charge. Older sales with no historical rate snapshot show `rate not recorded`, rather than making up a rate from mutable Settings.

R2.1.6 corrects **Receipt No.** to the explicitly requested `YYYYMMHHMM` + a zero-padded sale ID (minimum four digits). For example, `20261112200005` means year 2026, month 11, **12:20**, sale ID **5**. The requested pattern has **no day (DD)**. Use the original `pos_sales.posted_at` database time; never generate from browser print time. The full sale ID is retained to guarantee uniqueness beyond ID 9999 (the suffix grows to five or more digits).

The receipt number is stored on the sale **inside the sale's existing checkout transaction** and does not change on reprint. Old issued receipts retain the historical `POS-000000005` appearance; **no historical sale number is rewritten**. New Cash and verified noncash sales receive the new persisted number. The sale's audit and inventory movement reference now point to this number for new sales.

## Safeguards

- Existing V1 databases are not accessed or modified.
- Migration 035 must report CURRENT first; migration 036 is additive and follows 035. Migration 037 is additive and follows 036.
- Both installers are **read-only unless explicitly invoked with `--apply`**.
- `--apply` only when diagnostics say `repairable:true`, `blockers:[]`. Back up active tenant DBs before DDL; stop the backend to avoid concurrent posting.
- SQL migrations for new tenant provisioning must not be manually replayed on an existing tenant.
- Neither migration backfills historical tax rates or receipt numbers from the current tenant settings.
- Unique receipt index blocks accidental duplicates, including two simultaneous checkouts.
- R2.1.4 dedicated single-page print frame and all tax/payment calculations remain unchanged.
- The two new columns/features are tenant-local and support the existing six-tenant architecture; installers inspect **ACTIVE** tenants only.

## Install (Windows PC)

1. Back up V2 database and `.env` as appropriate. **Stop the running backend before applying migrations.**
2. Extract this archive and merge the *contents* of `tpos_main_v2` into the confirmed active root: `D:\\www\\tpos_main_v2`. Do not create an extra nested `tpos_main_v2` directory.
3. In Command Prompt:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
node --test tests/pos-receipt-tax-rates-r215.test.js tests/pos-receipt-number-r216.test.js tests/pos-receipt-single-page-r214.test.js
npm run db:pos:multi-payment
npm run db:pos:receipt-tax-rates
```

If 035 is CURRENT and 036 is `MISSING_OR_PARTIAL` **with `repairable:true`**:

```cmd
npm run db:pos:receipt-tax-rates -- --apply
npm run db:pos:receipt-tax-rates
```

Once 036 is CURRENT, inspect 037:

```cmd
npm run db:pos:receipt-number
```

Only if it is `MISSING_OR_PARTIAL` with `repairable:true` and empty blockers:

```cmd
npm run db:pos:receipt-number -- --apply
npm run db:pos:receipt-number
```

The expected read-only result for **both** is `status:"CURRENT"`, `failed:0`, `applied:false`. If `MANUAL_REVIEW`, DO NOT RUN `--apply`; inspect and share diagnostics. There is no new encryption key or `.env` change.

4. Verify related tests and frontend build:

```cmd
node --test tests/pos-cash-checkout-atomic-r1.test.js tests/pos-receipt-sst-owner-switches-r14.test.js
npm test
cd ..\frontend
npm run build
```

5. Restart backend/frontend. Test an actual **new** Cash sale and a new **verified** DuitNow Static QR sale with correct accounting posting and inventory. Check percent labels on receipt, new Receipt No., reprint stability, 80mm single-page print, no double sale. Try disabling one tax under Settings for a fresh sale and ensure it is not incorrectly shown as zero-rated.

## Format examples

| Stored sale time | Sale ID | New Receipt No. |
|---|---:|---|
| 2026-11-06 12:20:30 | 5 | 20261112200005 |
| 2026-11-06 12:20:31 | 6 | 20261112200006 |
| 2026-11-07 12:20:30 | 10005 | 202611122010005 |

The format omits the day as requested. Uniqueness within a tenant comes from the full sale ID, not from the minute prefix.

## Live acceptance criteria

- Migration 035, 036, 037 CURRENT for the active tenant with no blockers.
- POS tax summary and receipt show matching rate/amount snapshots; e.g. `Sales Tax (8%) RM 0.00` and `Service Tax (6%) RM 1.26` when enabled.
- Cash / QR receipts use `YYYYMMHHMM` + ID with at least four digits and no `POS-` prefix for *new sales*.
- Historical receipt reprints still use `POS-` for previously issued sales without stored new-format receipt numbers.
- Receipt No. reprint stable even if later settings or browser time change.
- Receipt remains exactly one thermal print page for the same content.
- New payment attempt cannot be marked paid twice; inventory and journal remain atomic and separate Cash/noncash.

**Status:** Delivery for PC testing. NOT LULUS until the user confirms live operation.
