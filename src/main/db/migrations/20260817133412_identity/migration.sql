CREATE TABLE `app_meta` (
	`key` text PRIMARY KEY,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `organization_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role_id` integer NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`joined_at` text DEFAULT (datetime('now')) NOT NULL,
	CONSTRAINT `fk_organization_staff_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `fk_organization_staff_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_organization_staff_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`),
	CONSTRAINT `organization_staff_organization_id_user_id_unique` UNIQUE(`organization_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`slug` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`legal_name` text,
	`billing_email` text,
	`mobile_number` text NOT NULL,
	`timezone` text,
	`currency` text DEFAULT 'INR' NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`plan_tier` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`code` text NOT NULL UNIQUE,
	`description` text
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`role_id` integer NOT NULL,
	`permission_id` integer NOT NULL,
	CONSTRAINT `role_permissions_pk` PRIMARY KEY(`role_id`, `permission_id`),
	CONSTRAINT `fk_role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`organization_id` integer NOT NULL,
	`name` text NOT NULL,
	`is_system_role` integer DEFAULT false NOT NULL,
	`is_super` integer DEFAULT false NOT NULL,
	`description` text,
	CONSTRAINT `fk_roles_organization_id_organizations_id_fk` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`),
	CONSTRAINT `roles_organization_id_name_unique` UNIQUE(`organization_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_staff_org` ON `organization_staff` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_staff_user` ON `organization_staff` (`user_id`);