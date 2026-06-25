CREATE TABLE `investment_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL REFERENCES `accounts`(`id`),
	`security_name` text,
	`ticker_symbol` text,
	`type` text NOT NULL,
	`subtype` text,
	`amount` real NOT NULL,
	`quantity` real,
	`price` real,
	`fees` real,
	`date` text NOT NULL,
	`iso_currency_code` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inv_tx_account_id_idx` ON `investment_transactions` (`account_id`);
--> statement-breakpoint
CREATE INDEX `inv_tx_date_idx` ON `investment_transactions` (`date`);
