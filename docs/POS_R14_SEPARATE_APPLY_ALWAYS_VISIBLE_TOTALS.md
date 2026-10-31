# TPOS Main V2 — POS R1.4 Separate Apply & Always Visible Totals

## Scope

Changed frontend POS files only, plus updated regression tests. No changes to SQL, database schema, backend application code, checkout, payment, inventory, tenant permissions, or `.env`.

## Behaviour

1. The top of the Current Order summary always displays **Subtotal**, **Discount / Voucher — Apply**, and **Sales / Services Tax — Apply**.
2. Each Apply is its own independent **Apply / Hide** toggle. Discount / Voucher opens code inputs. Sales / Services Tax opens read-only tax details from the Product Master-based backend quote.
3. The seven-row breakdown below is **always visible**, whether either panel is open or closed: Subtotal, Discount, Voucher, Sales Tax, Service Tax, Rounding Adjustment, Total.
4. Discount/Voucher codes, product/quantity and cart version automatically recalculate via `/pos/drafts/:id/quote`; no manual Apply/Preview is required to calculate.
5. The server calculates Sales Tax, Service Tax and BNM nearest-five-sen adjustment. UI only formats the authoritative quote. When quote fails, total amounts are not fabricated.
6. Existing Hold -> automatic empty order, Resume, multitenant business layout and payment blocking remain unchanged. No transactions are posted by these preview controls.

## Install on user's PC

Extract ZIP to `D:\www\tpos_main_v2` and overwrite included files only.

```
cd /d D:\www\tpos_main_v2\backend
npm run check
npm test

cd /d D:\www\tpos_main_v2\frontend
npm run build
```

Refresh POS using Ctrl+F5. No SQL migration or backend restart is required because only POS frontend and test files changed.

## PC acceptance

- Current Order (without clicking Apply) already shows all seven rows with their amounts after the automatic quote has completed.
- Discount / Voucher: Apply opens only the discount and voucher input fields. Hide closes them but retains the seven-row breakdown.
- Sales / Services Tax: Apply opens only the tax details. Hide closes them but retains the seven-row breakdown.
- Both panels can open independently. Neither is necessary to calculate bill totals.
- Change quantity or product; amounts refresh automatically including SST and BNM 5-sen rounding.
- Enter a valid discount or voucher: recalculation occurs automatically after typing. Invalid code shows an error and does not display misleading total.
- Hold order and confirm automatic new order. Resume the held order, verify original items intact.

## Test status

Backend syntax and combined regression: 220/220 PASS locally. JSX and CSS syntax: PASS locally.
Frontend Vite build and live browser acceptance for this ZIP: must be verified on PC.
