-- Membership Sale: joining date is distinct from the membership entitlement start date.
-- Existing memberships use start_date as their historical joining-date fallback.
ALTER TABLE "memberships" ADD COLUMN "joining_date" text;
--> statement-breakpoint
UPDATE "memberships"
SET "joining_date" = "start_date"
WHERE "joining_date" IS NULL;
