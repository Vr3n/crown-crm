-- Add the atomic membership-sale permission for existing organizations.
INSERT OR IGNORE INTO `permissions` (`code`, `description`)
VALUES ('membership.sell', NULL);
--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.code = 'membership.sell'
  AND r.name IN ('Manager', 'Sales')
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
