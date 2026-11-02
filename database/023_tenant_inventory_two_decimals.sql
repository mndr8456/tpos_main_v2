-- TPOS Main V2 Inventory R1.3: convert only Inventory Foundation balances/ledger to DECIMAL(18,2).
-- IMPORTANT: For tenants with existing data, run scripts/setup-inventory-two-decimals.js
-- in read-only preflight mode, then --apply. It refuses any value requiring rounding.
-- Existing 022 remains immutable; new tenants provision 022 followed by 023.
ALTER TABLE inventory_branch_balances
 MODIFY COLUMN quantity_on_hand DECIMAL(18,2) NOT NULL,
 MODIFY COLUMN carrying_value DECIMAL(18,2) NOT NULL,
 MODIFY COLUMN average_cost DECIMAL(18,2) NOT NULL;
ALTER TABLE inventory_movements
 MODIFY COLUMN quantity_delta DECIMAL(18,2) NOT NULL,
 MODIFY COLUMN value_delta DECIMAL(18,2) NOT NULL,
 MODIFY COLUMN quantity_after DECIMAL(18,2) NOT NULL,
 MODIFY COLUMN carrying_value_after DECIMAL(18,2) NOT NULL,
 MODIFY COLUMN average_cost_after DECIMAL(18,2) NOT NULL;
