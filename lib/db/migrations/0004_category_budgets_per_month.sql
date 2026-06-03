DROP TABLE `category_budgets`;
--> statement-breakpoint
CREATE TABLE `category_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`planned` real NOT NULL
);
