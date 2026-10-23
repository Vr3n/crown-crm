-- Units can be retired without deleting rows that items and historical vouchers
-- still point at. New unit pickers only show active rows.

ALTER TABLE units
  ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
