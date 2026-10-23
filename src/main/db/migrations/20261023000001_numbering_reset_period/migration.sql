-- Monthly reset for voucher numbering, on top of the yearly toggle from v1.

ALTER TABLE voucher_number_settings
  ADD COLUMN reset_period TEXT NOT NULL DEFAULT 'YEARLY';

--> statement-breakpoint
UPDATE voucher_number_settings
SET reset_period = CASE WHEN restart_yearly = 1 THEN 'YEARLY' ELSE 'NEVER' END;
