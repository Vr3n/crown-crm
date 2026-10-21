CREATE TABLE `lead_activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`lead_id` integer NOT NULL,
	`type_id` integer NOT NULL,
	`note` text,
	`occurred_at` text NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_activities_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_lead_activities_lead_id_leads_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`),
	CONSTRAINT `fk_lead_activities_type_id_lead_activity_types_id_fk` FOREIGN KEY (`type_id`) REFERENCES `lead_activity_types`(`id`),
	CONSTRAINT `fk_lead_activities_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_activity_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_activity_types_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `lead_activity_types_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `lead_followups` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`lead_id` integer NOT NULL,
	`title` text NOT NULL,
	`due_at` text NOT NULL,
	`completed_at` text,
	`completed_by` integer,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_followups_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_lead_followups_lead_id_leads_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`),
	CONSTRAINT `fk_lead_followups_completed_by_users_id_fk` FOREIGN KEY (`completed_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_lead_followups_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_lost_reasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_lost_reasons_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `lead_lost_reasons_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `lead_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_sources_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `lead_sources_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `lead_stage_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`lead_id` integer NOT NULL,
	`from_stage_id` integer,
	`to_stage_id` integer NOT NULL,
	`activity_id` integer,
	`reason` text,
	`changed_by` integer NOT NULL,
	`changed_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_stage_history_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_lead_stage_history_lead_id_leads_id_fk` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`),
	CONSTRAINT `fk_lead_stage_history_from_stage_id_lead_stages_id_fk` FOREIGN KEY (`from_stage_id`) REFERENCES `lead_stages`(`id`),
	CONSTRAINT `fk_lead_stage_history_to_stage_id_lead_stages_id_fk` FOREIGN KEY (`to_stage_id`) REFERENCES `lead_stages`(`id`),
	CONSTRAINT `fk_lead_stage_history_activity_id_lead_activities_id_fk` FOREIGN KEY (`activity_id`) REFERENCES `lead_activities`(`id`),
	CONSTRAINT `fk_lead_stage_history_changed_by_users_id_fk` FOREIGN KEY (`changed_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_stages` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_initial` integer DEFAULT false NOT NULL,
	`is_won` integer DEFAULT false NOT NULL,
	`is_lost` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_lead_stages_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `lead_stages_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`source_id` integer NOT NULL,
	`current_stage_id` integer NOT NULL,
	`owner_user_id` integer,
	`customer_id` integer,
	`lost_reason_id` integer,
	`lost_at` text,
	`lost_by` integer,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_leads_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_leads_person_id_people_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`id`),
	CONSTRAINT `fk_leads_source_id_lead_sources_id_fk` FOREIGN KEY (`source_id`) REFERENCES `lead_sources`(`id`),
	CONSTRAINT `fk_leads_current_stage_id_lead_stages_id_fk` FOREIGN KEY (`current_stage_id`) REFERENCES `lead_stages`(`id`),
	CONSTRAINT `fk_leads_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_leads_lost_reason_id_lead_lost_reasons_id_fk` FOREIGN KEY (`lost_reason_id`) REFERENCES `lead_lost_reasons`(`id`),
	CONSTRAINT `fk_leads_lost_by_users_id_fk` FOREIGN KEY (`lost_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_leads_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_people_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `people_organization_id_phone_unique` UNIQUE(`organization_id`,`phone`)
);
--> statement-breakpoint
CREATE INDEX `idx_lead_activities_lead` ON `lead_activities` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_lead_activity_types_org` ON `lead_activity_types` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_followups_due` ON `lead_followups` (`organization_id`,`due_at`,`completed_at`);--> statement-breakpoint
CREATE INDEX `idx_followups_lead` ON `lead_followups` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_lead_lost_reasons_org` ON `lead_lost_reasons` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_lead_sources_org` ON `lead_sources` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_stage_history_lead` ON `lead_stage_history` (`lead_id`);--> statement-breakpoint
CREATE INDEX `idx_lead_stages_org` ON `lead_stages` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_org_stage` ON `leads` (`organization_id`,`current_stage_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_org_owner` ON `leads` (`organization_id`,`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_leads_person` ON `leads` (`person_id`);