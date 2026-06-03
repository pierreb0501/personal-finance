CREATE TABLE `manual_recurring` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_name` text NOT NULL,
	`day_of_month` integer NOT NULL,
	`avg_amount` real NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `manual_recurring_merchant_name_unique` ON `manual_recurring` (`merchant_name`);
--> statement-breakpoint
CREATE TABLE `dismissed_recurring` (
	`merchant_name` text PRIMARY KEY NOT NULL
);
