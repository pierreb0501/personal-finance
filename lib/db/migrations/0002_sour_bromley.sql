CREATE TABLE `category_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_name` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_rules_merchant_name_unique` ON `category_rules` (`merchant_name`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `custom_category` text;