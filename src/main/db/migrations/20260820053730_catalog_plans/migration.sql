CREATE TABLE `membership_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`duration` text NOT NULL,
	`billing_frequency` text DEFAULT 'ONE_TIME' NOT NULL,
	`base_price_minor` integer NOT NULL,
	`access_window` text DEFAULT 'ALL_HOURS' NOT NULL,
	`start_time` text,
	`end_time` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_membership_plans_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `membership_plans_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `leads` ADD `plan_id` integer REFERENCES membership_plans(id);--> statement-breakpoint
CREATE INDEX `idx_leads_org_plan` ON `leads` (`organization_id`,`plan_id`);--> statement-breakpoint
CREATE INDEX `idx_membership_plans_org` ON `membership_plans` (`organization_id`);--> statement-breakpoint
ALTER TABLE `leads` DROP COLUMN `plan_interest`;