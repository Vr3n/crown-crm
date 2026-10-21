-- Seeds the default membership policies (freeze / proration / cancellation)
-- for any organization created before the org-setup flow started provisioning
-- them (Module 03, ADR-0008: policy is data referenced by the plan). Targets
-- only orgs with zero policies, so this is a no-op for already-provisioned orgs
-- (idempotent). The (organization_id, name) unique constraints double as guards.
--> statement-breakpoint
INSERT INTO `freeze_policies` (`organization_id`, `name`, `billing_behavior`, `access_behavior`, `extend_or_credit`, `fee_minor`, `free_freeze_count_per_year`, `description`)
SELECT o.id, p.name, p.billing_behavior, p.access_behavior, p.extend_or_credit, p.fee_minor, p.free_freeze_count_per_year, p.description
FROM `organizations` o
CROSS JOIN (
  SELECT 'Standard Freeze' AS name, 'SUSPEND_BILLING' AS billing_behavior, 'NO_ACCESS' AS access_behavior, 'EXTEND_END_DATE' AS extend_or_credit, 0 AS fee_minor, 2 AS free_freeze_count_per_year, 'Billing pauses and the end date extends for the frozen period.' AS description
  UNION ALL SELECT 'Credit Freeze', 'SUSPEND_BILLING', 'LIMITED_ACCESS', 'CREDIT_PERIOD', 0, 1, 'Billing pauses and the frozen time is credited back to the member.'
  UNION ALL SELECT 'Paid Freeze', 'SUSPEND_BILLING', 'NO_ACCESS', 'EXTEND_END_DATE', 19900, 0, 'Every freeze beyond the free allowance is charged a flat fee.'
) AS p
WHERE NOT EXISTS (SELECT 1 FROM `freeze_policies` fp WHERE fp.organization_id = o.id);
--> statement-breakpoint
INSERT INTO `proration_policies` (`organization_id`, `name`, `rule`, `description`)
SELECT o.id, p.name, p.rule, p.description
FROM `organizations` o
CROSS JOIN (
  SELECT 'Standard Proration' AS name, 'UPGRADE_CREDIT_UNUSED' AS rule, 'Upgrades credit the unused value of the current period.' AS description
  UNION ALL SELECT 'Downgrade Remainder', 'DOWNGRADE_CHARGE_REMAINDER', 'Downgrades charge the remainder of the current period at the new rate.'
  UNION ALL SELECT 'No Partial Credit', 'NO_PARTIAL_CREDIT', 'Mid-term changes take effect at the next billing period with no proration.'
) AS p
WHERE NOT EXISTS (SELECT 1 FROM `proration_policies` pp WHERE pp.organization_id = o.id);
--> statement-breakpoint
INSERT INTO `cancellation_policies` (`organization_id`, `name`, `effective_rule`, `notice_days`, `description`)
SELECT o.id, p.name, p.effective_rule, p.notice_days, p.description
FROM `organizations` o
CROSS JOIN (
  SELECT 'Immediate' AS name, 'IMMEDIATE' AS effective_rule, NULL AS notice_days, 'Cancellation takes effect immediately and the remaining time is forfeited.' AS description
  UNION ALL SELECT 'End of Period', 'END_OF_PERIOD', NULL, 'Cancellation takes effect at the end of the current billing period.'
  UNION ALL SELECT '30 Days Notice', 'NOTICE_DAYS', 30, 'A 30-day notice is required before cancellation takes effect.'
) AS p
WHERE NOT EXISTS (SELECT 1 FROM `cancellation_policies` cp WHERE cp.organization_id = o.id);
--> statement-breakpoint
UPDATE `membership_plans`
SET `freeze_policy_id` = (
  SELECT fp.id FROM `freeze_policies` fp
  WHERE fp.organization_id = membership_plans.organization_id AND fp.name = 'Standard Freeze'
  LIMIT 1
)
WHERE `freeze_policy_id` IS NULL;
--> statement-breakpoint
UPDATE `membership_plans`
SET `proration_policy_id` = (
  SELECT pp.id FROM `proration_policies` pp
  WHERE pp.organization_id = membership_plans.organization_id AND pp.name = 'Standard Proration'
  LIMIT 1
)
WHERE `proration_policy_id` IS NULL;
--> statement-breakpoint
UPDATE `membership_plans`
SET `cancellation_policy_id` = (
  SELECT cp.id FROM `cancellation_policies` cp
  WHERE cp.organization_id = membership_plans.organization_id AND cp.name = 'End of Period'
  LIMIT 1
)
WHERE `cancellation_policy_id` IS NULL;