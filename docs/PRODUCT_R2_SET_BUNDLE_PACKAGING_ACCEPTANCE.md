# TPOS Main V2 Clean Rebuild — Product R2: Set, Bundle & Packaging

Status: delivered for PC acceptance, **NOT** accepted without live MySQL/browser evidence.

## Installation baseline

This is the Product **first-install replacement for R1**; the user confirmed Product R1 has **not** been installed. Apply this ZIP alone to the accepted User / Category / Dashboard / Supplier foundation. It includes all Product R1 changed files and the Product R2 enhancements. Do **not** install R1 first. Existing modules and local `.env` remain untouched.

The only Product SQL is `database/007_tenant_products.sql`. Product R2 now has six tables: `products`, `product_packaging_units`, `product_components`, `product_barcodes`, `product_branch_prices`, `product_audit_logs`. One SQL file per tenant module is preserved. If an R1 `products` table already exists, `setup-products.js` fails explicitly; do **not** apply R2 until a non-destructive R1→R2 migration has been prepared. No DROP/RESET scripts are supplied.

## Product structure

- **SINGLE**: ordinary `GOODS` or `SERVICE`. Tracks stock only when allowed; a scale item uses `KG` or `G` as its base unit.
- **SET**: a composite saleable good with one or more existing, active **SINGLE** products as fixed components, each with a positive quantity. Has a selling price, but cannot track its own stock through Product Master. Preparation Station may apply.
- **BUNDLE**: a fixed group of existing, active **SINGLE** products, with independent selling price and component quantities. Does not create/remove stock itself.
- **Packaging**: SINGLE nonweighable goods with base `PCS` or `EA` can have `PACK`, `BOX`, `CARTON`, each with an **integer** conversion factor >= 2, optional globally unique barcode and its own selling price. Example: base `PCS`, CARTON factor `24` means 1 CARTON = 24 PCS.
- Composite nesting is prohibited in R2 (SET inside SET, BUNDLE inside BUNDLE) to prevent recursive/cyclic and double stock consumption. Self-reference and duplicate component/unit codes are rejected. A component used by an active Set/Bundle cannot be deactivated or archived.
- Product only saves master configuration and audits it. Inventory MWA, assembly, preparation stock consumption, unit-level POS checkout, retail/food order option groups, stock valuation and stock deduction are **NOT IMPLEMENTED** in the Clean Rebuild yet. They require integration with future Inventory / POS modules. Cost on composites is reference only, not computed ingredient valuation.

## CSV Import R2

Template includes all prior 21 columns, with 4 more at the end: `product_structure,base_unit,packaging_units,component_skus`. Old 21-column Product CSV remains supported as SINGLE.

Example:

- Carton: `product_structure=SINGLE`, `base_unit=PCS`, `packaging_units=PACK:6:9550000000001:12.50|CARTON:24:9550000000002:45.00`.
- No barcode: `PACK:6::12.50` (double colon denotes empty barcode).
- Meal set: `product_structure=SET`, `track_stock=NO`, `base_unit=EA`, `component_skus=SKU-RICE:1|SKU-DRINK:1`.
- Bundle: `product_structure=BUNDLE`, `track_stock=NO`, `base_unit=EA`, `component_skus=SKU-A:2|SKU-B:1`.
- Component SKUs must **already exist** in the tenant as active SINGLE products; first import Singles and then import Sets/Bundles. Colon and pipe are reserved delimiters in these two columns. Import Preview does not write data; Confirm Import uses a database transaction with rollback.
- CSV Export includes the same master structure fields for round-trip when the user has `products.cost.view`. Without cost permission, reference cost is deliberately blank in exports.

## PC commands (Windows CMD)

    cd /d D:\www\tpos_main_v2\backend
    node scripts/setup-products.js
    node scripts/setup-products.js --apply
    node scripts/setup-products.js
    npm run check
    npm test

Expected after successful apply: 1 tenant `CURRENT`, `failures:0`, `applied:false` in the final read-only check.

    cd /d D:\www\tpos_main_v2\frontend
    npm run build
    npm run dev

Restart the backend after setup using `npm run dev`; sign out and back in to reload new `products.*` permissions.

## Browser verification cases

1. Create SINGLE item with SKU and base barcode, category, supplier, price; confirm SKU uniqueness and edit.
2. Edit SINGLE to add PACK factor 6 and CARTON factor 24 with distinct barcodes and unit prices; reopen Edit and verify persistence.
3. Attempt duplicate packaging barcode (same product, another product and matching base barcode); expect rejection without partial changes.
4. Create SET with two existing SINGLE product components, quantities; edit set, reopen and verify persisted component list, preparation setting and audit.
5. Create BUNDLE with two active SINGLE items; attempt self-reference, duplicate component and composite-as-component; expect rejection.
6. Ensure in-use component cannot be archived/deactivated while referenced by an active SET/BUNDLE.
7. Import CSV template: SINGLE then SET/BUNDLE referencing existing SKUs; Preview → Confirm → Export; PDF business name and icon-only actions.
8. Check Product's inventory indicator remains “pending” and no stock/MWA movement has been created.

Do not mark Product R2 PASS until the user's real PC output and browser tests confirm behavior. MySQL and Vite build were not available in this build environment; 80/80 source/CSV tests and syntax checks have passed locally.
