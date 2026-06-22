CREATE INDEX `accounts_item_id_idx` ON `accounts` (`item_id`);--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_id_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_merchant_name_idx` ON `transactions` (`merchant_name`);
