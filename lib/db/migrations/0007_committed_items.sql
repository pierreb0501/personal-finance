CREATE TABLE `committed_items` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `type` text NOT NULL,
  `expected_amount` real NOT NULL,
  `expected_day` integer,
  `merchant_name` text,
  `category` text NOT NULL,
  `created_at` integer NOT NULL
);
