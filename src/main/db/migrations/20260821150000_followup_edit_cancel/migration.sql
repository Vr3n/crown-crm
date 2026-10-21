ALTER TABLE `lead_followups` ADD `extension_reason` text;--> statement-breakpoint
ALTER TABLE `lead_followups` ADD `cancelled_at` text;--> statement-breakpoint
ALTER TABLE `lead_followups` ADD `cancelled_by` integer REFERENCES `users`(`id`);