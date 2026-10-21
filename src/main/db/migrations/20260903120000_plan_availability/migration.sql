-- Add availability date range to membership_plans (issue #107).
-- available_from: ISO date when the plan becomes available for sale (default = today).
-- available_to: ISO date when availability ends; NULL = open-ended.

ALTER TABLE membership_plans ADD COLUMN available_from TEXT;
ALTER TABLE membership_plans ADD COLUMN available_to TEXT;

-- Backfill: set available_from = date(created_at) for existing plans so they remain visible.
UPDATE membership_plans SET available_from = date(created_at) WHERE available_from IS NULL;
