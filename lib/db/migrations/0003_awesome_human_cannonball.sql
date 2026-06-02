CREATE TABLE `category_budgets` (
	`category` text PRIMARY KEY NOT NULL,
	`monthly_limit` real NOT NULL
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `ignored` integer DEFAULT 0 NOT NULL;