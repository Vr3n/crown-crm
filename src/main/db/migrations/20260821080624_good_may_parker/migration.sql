CREATE TABLE `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`billing_name` text,
	`billing_phone` text,
	`billing_email` text,
	`billing_address` text,
	`emergency_contact` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_customers_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_customers_person_id_people_id_fk` FOREIGN KEY (`person_id`) REFERENCES `people`(`id`),
	CONSTRAINT `customers_organization_id_person_id_unique` UNIQUE(`organization_id`,`person_id`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`plan_id` integer NOT NULL,
	`offer_id` integer,
	`plan_name_snapshot` text NOT NULL,
	`duration_days_snapshot` integer NOT NULL,
	`base_price_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`final_price_minor` integer NOT NULL,
	`tax_rate_bps` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`billing_frequency` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`cancellation_requested_at` text,
	`cancellation_effective_date` text,
	`cancellation_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_memberships_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_memberships_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
	CONSTRAINT `fk_memberships_plan_id_membership_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`),
	CONSTRAINT `fk_memberships_offer_id_offers_id_fk` FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`),
	CONSTRAINT `fk_memberships_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_freezes` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`membership_id` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text,
	`fee_minor` integer DEFAULT 0 NOT NULL,
	`billing_behavior` text NOT NULL,
	`access_behavior` text NOT NULL,
	`extension_days` integer DEFAULT 0 NOT NULL,
	`credit_days` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_membership_freezes_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_membership_freezes_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`),
	CONSTRAINT `fk_membership_freezes_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `membership_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`membership_id` integer NOT NULL,
	`type` text NOT NULL,
	`data` text,
	`occurred_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_membership_events_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_membership_events_membership_id_memberships_id_fk` FOREIGN KEY (`membership_id`) REFERENCES `memberships`(`id`),
	CONSTRAINT `fk_membership_events_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`number` text NOT NULL UNIQUE,
	`customer_id` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`billing_name` text,
	`billing_phone` text,
	`billing_email` text,
	`billing_address` text,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`finalized_at` text,
	`finalized_by` integer,
	`voided_at` text,
	`voided_by` integer,
	`void_reason` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_invoices_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_invoices_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
	CONSTRAINT `fk_invoices_finalized_by_users_id_fk` FOREIGN KEY (`finalized_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_invoices_voided_by_users_id_fk` FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_invoices_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`description` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`tax_rate_bps` integer NOT NULL,
	`tax_amount_minor` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	`plan_id` integer,
	`offer_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_invoice_lines_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_invoice_lines_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`),
	CONSTRAINT `fk_invoice_lines_plan_id_membership_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `membership_plans`(`id`),
	CONSTRAINT `fk_invoice_lines_offer_id_offers_id_fk` FOREIGN KEY (`offer_id`) REFERENCES `offers`(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_sequence` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`year` text NOT NULL,
	`prefix` text NOT NULL,
	`last_value` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_invoice_sequence_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `invoice_sequence_organization_id_year_prefix_unique` UNIQUE(`organization_id`,`year`,`prefix`)
);
--> statement-breakpoint
CREATE TABLE `payment_methods` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_payment_methods_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `payment_methods_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`payment_date` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`payment_method` text NOT NULL,
	`reference` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_payments_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_payments_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
	CONSTRAINT `fk_payments_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT "payments_amount_positive" CHECK("amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE `payment_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`payment_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_payment_allocations_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_payment_allocations_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`),
	CONSTRAINT `fk_payment_allocations_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`),
	CONSTRAINT `fk_payment_allocations_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT "allocations_amount_positive" CHECK("amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE `refunds` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`payment_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_refunds_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_refunds_payment_id_payments_id_fk` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`),
	CONSTRAINT `fk_refunds_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `credits` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`customer_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`remaining_minor` integer NOT NULL,
	`reason` text NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_credits_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_credits_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`),
	CONSTRAINT `fk_credits_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`credit_id` integer NOT NULL,
	`invoice_id` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`created_by` integer NOT NULL,
	CONSTRAINT `fk_credit_allocations_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_credit_allocations_credit_id_credits_id_fk` FOREIGN KEY (`credit_id`) REFERENCES `credits`(`id`),
	CONSTRAINT `fk_credit_allocations_invoice_id_invoices_id_fk` FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`),
	CONSTRAINT `fk_credit_allocations_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT "credit_alloc_amount_positive" CHECK("amount_minor" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_customers_org` ON `customers` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_memberships_org_customer` ON `memberships` (`organization_id`,`customer_id`);
--> statement-breakpoint
CREATE INDEX `idx_memberships_org_status` ON `memberships` (`organization_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_freezes_membership` ON `membership_freezes` (`membership_id`);
--> statement-breakpoint
CREATE INDEX `idx_membership_events_membership` ON `membership_events` (`membership_id`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_org` ON `invoices` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_org_status` ON `invoices` (`organization_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_invoices_customer` ON `invoices` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_invoice` ON `invoice_lines` (`invoice_id`);
--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_org` ON `invoice_lines` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_payment_methods_org` ON `payment_methods` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_payments_org` ON `payments` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_payments_org_date` ON `payments` (`organization_id`,`payment_date`);
--> statement-breakpoint
CREATE INDEX `idx_payments_customer` ON `payments` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `idx_allocations_payment` ON `payment_allocations` (`payment_id`);
--> statement-breakpoint
CREATE INDEX `idx_allocations_invoice` ON `payment_allocations` (`invoice_id`);
--> statement-breakpoint
CREATE INDEX `idx_allocations_org` ON `payment_allocations` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_refunds_payment` ON `refunds` (`payment_id`);
--> statement-breakpoint
CREATE INDEX `idx_refunds_org` ON `refunds` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_credits_org` ON `credits` (`organization_id`);
--> statement-breakpoint
CREATE INDEX `idx_credits_customer` ON `credits` (`customer_id`);
--> statement-breakpoint
CREATE INDEX `idx_credit_allocations_credit` ON `credit_allocations` (`credit_id`);
--> statement-breakpoint
CREATE INDEX `idx_credit_allocations_invoice` ON `credit_allocations` (`invoice_id`);
--> statement-breakpoint
CREATE INDEX `idx_credit_allocations_org` ON `credit_allocations` (`organization_id`);
