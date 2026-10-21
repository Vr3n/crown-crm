ALTER TABLE `refunds` ADD COLUMN `status` text NOT NULL DEFAULT 'ISSUED';
--> statement-breakpoint
ALTER TABLE `refunds` ADD COLUMN `scheduled_date` text;
--> statement-breakpoint
ALTER TABLE `refunds` ADD COLUMN `issued_at` text;
--> statement-breakpoint
CREATE INDEX `idx_refunds_status` ON `refunds` (`status`);