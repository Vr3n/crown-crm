-- An item stores the price as typed plus a flag saying whether tax is inside it.
-- Sales default to tax-inclusive (a quoted customer price); purchases default to
-- tax-exclusive (the supplier adds tax on the bill).

ALTER TABLE items
  ADD COLUMN sale_price_includes_tax INTEGER NOT NULL DEFAULT 1
  CHECK (sale_price_includes_tax IN (0, 1));

ALTER TABLE items
  ADD COLUMN purchase_price_includes_tax INTEGER NOT NULL DEFAULT 0
  CHECK (purchase_price_includes_tax IN (0, 1));
