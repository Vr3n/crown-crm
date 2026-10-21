-- Seeds the per-organization sales reference data (stages, sources, activity
-- types, lost reasons) for any organization created before the org-setup flow
-- started provisioning it. Each statement targets only orgs with zero rows in
-- that table, so this is a no-op for already-provisioned orgs.
INSERT INTO `lead_stages` (`organization_id`, `name`, `sort_order`, `is_initial`, `is_won`, `is_lost`, `active`)
SELECT o.id, s.name, s.sort_order, s.is_initial, s.is_won, s.is_lost, 1
FROM `organizations` o
CROSS JOIN (
  SELECT 'NEW' AS name, 0 AS sort_order, 1 AS is_initial, 0 AS is_won, 0 AS is_lost
  UNION ALL SELECT 'CONTACTED', 1, 0, 0, 0
  UNION ALL SELECT 'INTERESTED', 2, 0, 0, 0
  UNION ALL SELECT 'VISIT_SCHEDULED', 3, 0, 0, 0
  UNION ALL SELECT 'VISITED', 4, 0, 0, 0
  UNION ALL SELECT 'TRIAL', 5, 0, 0, 0
  UNION ALL SELECT 'NEGOTIATION', 6, 0, 0, 0
  UNION ALL SELECT 'WON', 7, 0, 1, 0
  UNION ALL SELECT 'LOST', 8, 0, 0, 1
) AS s
WHERE NOT EXISTS (SELECT 1 FROM `lead_stages` ls WHERE ls.organization_id = o.id);--> statement-breakpoint
INSERT INTO `lead_sources` (`organization_id`, `name`, `sort_order`, `active`)
SELECT o.id, s.name, s.sort_order, 1
FROM `organizations` o
CROSS JOIN (
  SELECT 'Walk-in' AS name, 0 AS sort_order
  UNION ALL SELECT 'Phone', 1
  UNION ALL SELECT 'Referral', 2
  UNION ALL SELECT 'Instagram', 3
  UNION ALL SELECT 'Website', 4
  UNION ALL SELECT 'Advertisement', 5
  UNION ALL SELECT 'Existing Member Referral', 6
  UNION ALL SELECT 'Other', 7
) AS s
WHERE NOT EXISTS (SELECT 1 FROM `lead_sources` ls WHERE ls.organization_id = o.id);--> statement-breakpoint
INSERT INTO `lead_activity_types` (`organization_id`, `name`, `active`)
SELECT o.id, s.name, 1
FROM `organizations` o
CROSS JOIN (
  SELECT 'PHONE_CALL' AS name
  UNION ALL SELECT 'WALK_IN'
  UNION ALL SELECT 'WHATSAPP'
  UNION ALL SELECT 'GYM_TOUR'
  UNION ALL SELECT 'TRIAL'
  UNION ALL SELECT 'NOTE'
  UNION ALL SELECT 'PRICE_DISCUSSION'
  UNION ALL SELECT 'MEMBERSHIP_PROPOSAL'
  UNION ALL SELECT 'OWNER_CHANGE'
) AS s
WHERE NOT EXISTS (SELECT 1 FROM `lead_activity_types` lat WHERE lat.organization_id = o.id);--> statement-breakpoint
INSERT INTO `lead_lost_reasons` (`organization_id`, `name`, `sort_order`, `active`)
SELECT o.id, s.name, s.sort_order, 1
FROM `organizations` o
CROSS JOIN (
  SELECT 'Too Expensive' AS name, 0 AS sort_order
  UNION ALL SELECT 'Joined Competitor', 1
  UNION ALL SELECT 'Not Interested', 2
  UNION ALL SELECT 'No Response', 3
  UNION ALL SELECT 'Moved Away', 4
  UNION ALL SELECT 'Medical Reason', 5
  UNION ALL SELECT 'Wrong Contact', 6
  UNION ALL SELECT 'Other', 7
) AS s
WHERE NOT EXISTS (SELECT 1 FROM `lead_lost_reasons` llr WHERE llr.organization_id = o.id);
