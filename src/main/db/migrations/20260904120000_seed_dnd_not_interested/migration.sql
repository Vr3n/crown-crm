-- Add missing DO_NOT_DISTURB and NOT_INTERESTED lead stages for existing orgs.
-- These were added to the seed config after the original seed migration (v6).
INSERT INTO `lead_stages` (`organization_id`, `name`, `sort_order`, `is_initial`, `is_won`, `is_lost`, `suppress_followups`, `active`)
SELECT o.id, s.name, s.sort_order, 0, 0, 0, 1, 1
FROM `organizations` o
CROSS JOIN (
  SELECT 'DO_NOT_DISTURB' AS name, 9 AS sort_order
  UNION ALL SELECT 'NOT_INTERESTED', 10
) AS s
WHERE NOT EXISTS (
  SELECT 1 FROM `lead_stages` ls
  WHERE ls.organization_id = o.id AND ls.name = s.name
);