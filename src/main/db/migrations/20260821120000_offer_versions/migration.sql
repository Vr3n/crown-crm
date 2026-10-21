CREATE TABLE `offer_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`offer_id` integer NOT NULL,
	`discount_type` text NOT NULL,
	`value_minor` integer NOT NULL,
	`effective_from` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_offer_versions_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_offer_versions_offer_id_offers_id_fk` FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_offer_versions_org_offer` ON `offer_versions` (`organization_id`,`offer_id`);