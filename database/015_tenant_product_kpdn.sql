-- TPOS Main V2: Product KPDN controlled goods flag (independent of JKDM SST and LHDN).
-- Apply only after Product R3 (008); preserve all existing records.
ALTER TABLE products
  ADD COLUMN is_kpdn_controlled BOOLEAN NOT NULL DEFAULT FALSE AFTER jkdm_tax_inclusive;
-- This field only flags goods for internal review; it does not certify price ceilings or permits.
