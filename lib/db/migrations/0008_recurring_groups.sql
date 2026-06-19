ALTER TABLE `committed_items` ADD COLUMN `group_name` text;
ALTER TABLE `manual_recurring` ADD COLUMN `group_name` text;
CREATE TABLE `recurring_merchant_groups` (
  `merchant_name` text PRIMARY KEY NOT NULL,
  `group_name` text NOT NULL
);
