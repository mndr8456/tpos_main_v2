# TPOS Main V2 — Product Barcode & QR Labels R1

## Scope
- **Product → Generate Product Barcode and QR Labels**: print currently filtered products, optionally narrow or select individual products in the dialog.
- **Product → row QR icon**: print a label for that product.
- A4 Portrait, 3 columns × 4 rows = **12 labels per page**; each is **60 × 65 mm**, with 11 mm paper padding and 4 mm gaps.
- Each label (top to bottom): QR carrying the **exact SKU**, visible SKU, **Code 128-B** carrying the **exact Product Barcode**, visible barcode, Product Name.
- Read-only: does not create or modify SKU, barcode, stock, prices, inventory movements, financial journals or audit entries.
- Reuses bundled QR code generator and Code 128 pattern data already present in V2. No external QR/barcode web service or additional npm dependency.
- Printing is gated by existing `products.export` permission, both for the bulk button and the per-product icon. Existing Product API and role matrix are unchanged.

## Important data rules
- A Product needs a valid SKU and a populated, printable ASCII Product Barcode for complete barcode/QR labels. Invalid products are flagged in the dialog and prevent a mixed invalid batch from printing until deselected or corrected. No silent SKU fallback for a missing barcode.
- **Product Barcode** must be the actual stored value. Printing a Code 128 representation does not change an EAN/UPC numeric barcode value; scanner output is the same textual value if the scanner supports Code 128.
- Maximum 1,000 selected products per print job, one label per unique product ID. The list renders the first 200 matching products to avoid slowing the browser; "Select matching" works on *all* matching products. Narrow the search or print multiple batches for a very large catalog.
- Codes are generated inside the browser; no network call or write happens during label generation. Verify printed scans with a real scanner before mass printing, especially for unusually long barcodes.

## Installation
- Root of ZIP is `tpos_main_v2/`; unzip into `D:\\www` so that changed files overwrite `D:\\www\\tpos_main_v2\\...` (not a nested `tpos_main_v2\\tpos_main_v2`).
- Backup the existing `frontend/src/Products.jsx` before replacement.
- **No SQL migration or installer** is required. Do not rerun migrations 035–038.

## PC Verification
```cmd
cd /d D:\\www\\tpos_main_v2\\backend
node scripts/verify-product-label-codes-r1.js
node --test tests/product-label-codes-r1.test.js
npm test

cd /d D:\\www\\tpos_main_v2\\frontend
npm run build
```

## OWNER Live UI Acceptance
1. Login as OWNER. Open Products and click the **Generate Product Barcode and QR Labels** icon near Export Products PDF.
2. The filtered products appear selected. Search and deselect/select individual products. Confirm the first 12 previews show actual QR, barcode and Product Name.
3. Test one product row's **Generate Barcode and QR Label** icon. QR should scan to SKU; Code 128 barcode should scan to **Product Barcode**, *not* SKU.
4. Select 12 products, print A4 Portrait / Save PDF (1 page). Select 13, print (2 pages). Use **Scale 100% / Actual Size**, paper **A4**, **Portrait**, **Headers and Footers off**. The app will open Chrome print preview after images load.
5. Verify printed scanner reads both codes. For 13 labels the second page contains one label at the top-left.
6. Try one Product with barcode not set. The dialog should explain the error and refuse printing until the product is corrected or deselected ("Select valid only").
7. Check Products Refresh, SKU/Barcode, Product View/Edit, branch Stock QOH and Inventory remain unchanged; no writes are performed by labels.

**Release status:** code/tests only. UI acceptance requires live PC verification; do not mark LULUS merely for Node tests.
