ALTER TABLE "people" ADD COLUMN "is_blacklisted" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "blacklisted_reason" text;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "blacklisted_at" text;
--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "blacklisted_by" integer;
--> statement-breakpoint
INSERT INTO "permissions" ("code", "description") VALUES ('person.blacklist', NULL) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r.id, p.id
FROM "roles" r
JOIN "permissions" p ON p.code = 'person.blacklist'
WHERE r.name IN ('Manager', 'Sales', 'Front Desk')
ON CONFLICT DO NOTHING;
