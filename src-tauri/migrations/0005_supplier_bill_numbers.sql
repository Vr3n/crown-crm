-- A purchase bill's identity is the number the supplier printed. Record where
-- `vouchers.number` came from and keep a comparison-only form of it so a
-- duplicate can be caught without changing how the number is printed.
--
-- Supplier-numbered purchases live in a per-supplier series (`SUP<party_id>`),
-- which lets the existing UNIQUE (company_id, voucher_type, series, fy, number)
-- enforce uniqueness per supplier and financial year. An internal-numbered
-- voucher leaves `number_normalized` null.

ALTER TABLE vouchers
  ADD COLUMN number_source TEXT NOT NULL DEFAULT 'INTERNAL'
  CHECK (number_source IN ('INTERNAL', 'SUPPLIER'));

ALTER TABLE vouchers
  ADD COLUMN number_normalized TEXT;

-- Existing rows predate the supplier-number rule, so every one is internal.
UPDATE vouchers SET number_source = 'INTERNAL';
