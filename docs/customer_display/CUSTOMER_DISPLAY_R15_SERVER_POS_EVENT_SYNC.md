# TPOS Main V2 — Customer Display R1.5 (Backend POS Event Synchronization)

## Scope and live failure

R1.4 technical regression passed on the user PC but the paired customer monitor stayed on **Welcome** while POS showed an editable cart, Cash Payment, a paid receipt or a pending merchant DuitNow QR. `Connected` only confirms a valid display token, not that the POS order state is present. The original client-side publish/React lifecycle is not sufficiently reliable for this operation.

This patch uses the V1 design principle of a **persistent display session** with events from the authoritative POS side, while retaining the V2 tenant/cashier/branch constraints and secure read-only display.

## Changes

- New `backend/src/customer-display-pos-events.js` projects a committed POS event into the tenant-owned display session. It attaches to successful POS HTTP responses *after* their financial/draft transaction has committed, not inside the accounting transaction.
- Existing routes for initial cart creation, cart line changes, table assignment, Hold/Resume/Discard, reading a selected saved cart, quote, starting a manual/QR payment, Cash checkout and verified manual checkout trigger projections.
- A pairing opened while an eligible draft already exists shows that most-recent DRAFT immediately; it does not automatically select an unresumed HELD order.
- `/customer-display/payment-mode` itself projects the real draft before switching to Cash/QR, rather than requiring a preceding browser publish to succeed.
- The existing public monitor continues to poll every 2 seconds; V2 posted sales remain the **only** authority for Cash Change and Thank You.
- Authenticated pairing remains scoped to the same tenant, cashier and branch; unpaired/unauthorized/failed POS requests never publish customer data.
- When an optional display projection fails, POS remains operational. The backend reports a safe line beginning `[customer-display-pos-events]` containing an error code only, **never a token, payment reference or evidence**.
- KDS, Sale, Cash Shift, Inventory, tax and accounting handlers are not modified. No SQL/migration is added.

## Installation

1. Back up `D:\www\tpos_main_v2` and the V2 tenant database. Stop both frontend and backend.
2. Extract this Changed Files Only ZIP into `D:\www`; overwrite the matching full-file paths. Preserve `.env` and all databases.
3. Run from the backend:

```cmd
cd /d D:\www\tpos_main_v2\backend
npm run check
npm run db:kds
npm run db:customer-display
node --test tests/customer-display-pos-events-r15.test.js
npm test
```

4. Expect KDS migration `040` and CD migration `041` to remain `CURRENT`. Do **NOT** rerun `--apply`.
5. Run frontend:

```cmd
cd /d D:\www\tpos_main_v2\frontend
npm run build
```

6. Restart both servers, hard-refresh POS, close the old CD browser window and pair again once via **Open Customer Display**.

## User acceptance checks (PC)

1. Create a fresh Take Away/Dine In order, add multiple items, and observe customer screen: **Order** + quantity/price/total on left, **Promotions** on right. Confirm total matches POS quote.
2. Open Cash Payment without confirming: **Cash Payment / Waiting for Cashier**, not Welcome. No false success.
3. After a real test Cash posting, show **Change (baki)** and then OWNER-configured Thank You while POS receipt is open. Closing receipt triggers the configured return to Welcome.
4. Create an unpaid DuitNow QR attempt using a properly configured real merchant QR: customer screen shows **merchant QR + correct amount** and waits for verification; do not claim payment success before successful merchant-side verification and real POS sale posting.
5. Hold a preparation-required order, confirm KDS receives a ticket once. Select it in Held/Saved Orders, Resume, and verify the CD shows the selected cart without duplicate KDS tickets.
6. Refresh the POS browser while the display window remains paired; initiate a new real POS draft and verify the monitor still receives backend-driven events. Do not assume a new 12-hour token is necessary unless session actually expired.
7. Verify Cash/QR checkout, receipt number, Inventory stock, and accounting are unchanged.

### If the display still stays on Welcome

Do not send merchant credentials, QR reference numbers, pairing tokens or bank evidence. Provide the **backend terminal messages**, especially any lines beginning `[customer-display-pos-events]`, and a screenshot of POS and CD while the latest draft is active. A `Connected` indicator by itself is not proof of a synchronized order. A stable POST response may fail to project because of an actual tenant DB schema/permission/quote error, which those safe diagnostic messages will identify.

## Verification limitations

Source reconstruction: latest source `tpos_main_v2 LATEST_06112026_2220.zip` + accepted Order Terminal R1/R1.1 + KDS R1 + Customer Display R1 through R1.4 patches. Development checks: Node syntax PASS, backend regression 753/753 PASS with a temporary `.env.example` copy removed after testing, customer-display and payment targeted tests 73/73 PASS, and JSX parser 0 diagnostics. The real user MySQL connection, frontend Vite build and CD display on two live Chrome windows have **not** been verified by this development environment; PC acceptance remains pending.
