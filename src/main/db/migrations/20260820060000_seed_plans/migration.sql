-- Seeds the starter membership plans (Module 03) for any organization created
-- before the org-setup flow started provisioning them. Targets only orgs with
-- zero plans, so this is a no-op for already-provisioned orgs (idempotent).
INSERT INTO `membership_plans` (`organization_id`, `name`, `description`, `duration`, `billing_frequency`, `base_price_minor`, `access_window`, `start_time`, `end_time`, `active`)
SELECT o.id, p.name, p.description, p.duration, p.billing_frequency, p.base_price_minor, p.access_window, p.start_time, p.end_time, p.active
FROM `organizations` o
CROSS JOIN (
  SELECT 'Basic Monthly' AS name, 'Gym-floor access across all equipment zones.' AS description, 'MONTHLY' AS duration, 'ONE_TIME' AS billing_frequency, 150000 AS base_price_minor, 'ALL_HOURS' AS access_window, '06:00' AS start_time, '23:00' AS end_time, 1 AS active
  UNION ALL SELECT 'Student Monthly', 'Off-peak floor access for students with a valid college ID.', 'MONTHLY', 'ONE_TIME', 120000, 'TIMED', '07:00', '17:00', 1
  UNION ALL SELECT 'Yoga Studio', 'Yoga floor, mat sessions and the meditation hall.', 'MONTHLY', 'ONE_TIME', 180000, 'ALL_HOURS', '06:00', '23:00', 1
  UNION ALL SELECT 'Premium Quarterly', 'Full facility for 3 months at a better per-month rate.', 'QUARTERLY', 'ONE_TIME', 390000, 'ALL_HOURS', '06:00', '23:00', 1
  UNION ALL SELECT 'Premium Half Yearly', 'Six months of full-facility access.', 'HALF_YEARLY', 'ONE_TIME', 740000, 'ALL_HOURS', '06:00', '23:00', 1
  UNION ALL SELECT 'Annual Premium', 'The flagship year-long membership at the best per-month rate.', 'YEARLY', 'ONE_TIME', 2400000, 'ALL_HOURS', '06:00', '23:00', 1
  UNION ALL SELECT 'Weekend Access', 'Weekend-only floor access. Paused while the weekend bootcamps run.', 'MONTHLY', 'ONE_TIME', 90000, 'TIMED', '08:00', '20:00', 0
) AS p
WHERE NOT EXISTS (SELECT 1 FROM `membership_plans` mp WHERE mp.organization_id = o.id);