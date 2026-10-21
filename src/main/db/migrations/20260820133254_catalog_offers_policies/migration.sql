CREATE TABLE `cancellation_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`effective_rule` text NOT NULL,
	`notice_days` integer,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_cancellation_policies_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `cancellation_policies_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `freeze_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`billing_behavior` text NOT NULL,
	`access_behavior` text NOT NULL,
	`extend_or_credit` text NOT NULL,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`free_freeze_count_per_year` integer DEFAULT 0 NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_freeze_policies_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `freeze_policies_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `membership_plan_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`plan_id` integer NOT NULL,
	`base_price_minor` integer NOT NULL,
	`tax_rate_bps` integer DEFAULT 0 NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_membership_plan_versions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_membership_plan_versions_plan_id_membership_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`)
);
--> statement-breakpoint
CREATE TABLE `offer_redemptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`offer_id` integer NOT NULL,
	`membership_id` integer,
	`invoice_id` integer,
	`applied_discount_minor` integer NOT NULL,
	`redeemed_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_offer_redemptions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_offer_redemptions_offer_id_offers_id_fk` FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`),
	CONSTRAINT `fk_offer_redemptions_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`discount_type` text NOT NULL,
	`value_minor` integer NOT NULL,
	`applicable_plan_ids` text DEFAULT '[]' NOT NULL,
	`eligibility` text,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`max_usage` integer,
	`min_purchase_minor` integer,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_offers_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `offers_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `proration_policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`rule` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_proration_policies_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `proration_policies_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `tax_code` text;--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `tax_rate_bps` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `registration_fee_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `freeze_policy_id` integer REFERENCES freeze_policies(id);--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `proration_policy_id` integer REFERENCES proration_policies(id);--> statement-breakpoint
ALTER TABLE `membership_plans` ADD `cancellation_policy_id` integer REFERENCES cancellation_policies(id);--> statement-breakpoint
CREATE INDEX `idx_cancellation_policies_org` ON `cancellation_policies` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_freeze_policies_org` ON `freeze_policies` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_plan_versions_org_plan` ON `membership_plan_versions` (`organization_id`,`plan_id`);--> statement-breakpoint
CREATE INDEX `idx_offer_redemptions_org_offer` ON `offer_redemptions` (`organization_id`,`offer_id`);--> statement-breakpoint
CREATE INDEX `idx_offers_org` ON `offers` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_offers_org_active` ON `offers` (`organization_id`,`active`);--> statement-breakpoint
CREATE INDEX `idx_proration_policies_org` ON `proration_policies` (`organization_id`);