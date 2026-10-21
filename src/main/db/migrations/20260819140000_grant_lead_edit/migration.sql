-- Grants the lead.edit permission to the Manager and Sales starter roles for
-- organizations that predate this catalog extension. Self-contained: the
-- permission row is inserted if missing (seedPermissions() only runs at app
-- startup, so a migration must not assume it has run yet). The grant is a no-op
-- for roles that already carry the permission (composite PK on role_permissions).
INSERT OR IGNORE INTO `permissions` (`code`, `description`) VALUES ('lead.edit', NULL);--> statement-breakpoint
INSERT INTO `role_permissions` (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM `roles` r
CROSS JOIN `permissions` p
WHERE p.code = 'lead.edit'
  AND r.name IN ('Manager', 'Sales')
  AND NOT EXISTS (
    SELECT 1 FROM `role_permissions` rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );