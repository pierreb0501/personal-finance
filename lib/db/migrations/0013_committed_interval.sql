ALTER TABLE `committed_items` ADD `interval_months` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `committed_items` ADD `anchor_year` integer;
--> statement-breakpoint
ALTER TABLE `committed_items` ADD `anchor_month` integer;
