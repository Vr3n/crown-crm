-- Voucher numbering settings and first run progress.

CREATE TABLE voucher_number_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  voucher_type TEXT NOT NULL,
  series TEXT NOT NULL,
  prefix TEXT NOT NULL DEFAULT '',
  suffix TEXT NOT NULL DEFAULT '',
  padding INTEGER NOT NULL DEFAULT 4,
  start_number INTEGER NOT NULL DEFAULT 1,
  restart_yearly INTEGER NOT NULL DEFAULT 1,
  manual_override INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (company_id, voucher_type)
);

--> statement-breakpoint
ALTER TABLE companies ADD COLUMN numbering_setup_at TEXT;

--> statement-breakpoint
ALTER TABLE companies ADD COLUMN onboarding_completed_at TEXT;

--> statement-breakpoint
INSERT INTO voucher_number_settings
  (company_id, voucher_type, series, prefix, suffix, padding, start_number)
SELECT
  c.id,
  d.voucher_type,
  d.series,
  d.prefix,
  d.suffix,
  d.padding,
  d.start_number
FROM companies c
CROSS JOIN (
  SELECT 'SALES' AS voucher_type, 'INV' AS series, 'INV/' AS prefix, '' AS suffix, 4 AS padding, 1 AS start_number
  UNION ALL SELECT 'PURCHASE', 'PUR', 'PUR/', '', 4, 1
  UNION ALL SELECT 'RECEIPT', 'RCT', 'RCT/', '', 4, 1
  UNION ALL SELECT 'PAYMENT', 'PAY', 'PAY/', '', 4, 1
  UNION ALL SELECT 'CREDIT_NOTE', 'CN', 'CN/', '', 4, 1
  UNION ALL SELECT 'DEBIT_NOTE', 'DN', 'DN/', '', 4, 1
  UNION ALL SELECT 'JOURNAL', 'JV', 'JV/', '', 4, 1
  UNION ALL SELECT 'CONTRA', 'CTR', 'CTR/', '', 4, 1
  UNION ALL SELECT 'OPENING', 'OPN', 'OPN/', '', 4, 1
) d;

--> statement-breakpoint
-- Existing installs that already posted a voucher keep their current series and
-- are not forced through the first run wizard again.
UPDATE companies
SET numbering_setup_at = datetime('now'),
    onboarding_completed_at = datetime('now')
WHERE EXISTS (SELECT 1 FROM vouchers v WHERE v.company_id = companies.id);
