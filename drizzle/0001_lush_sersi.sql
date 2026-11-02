CREATE TABLE `crawl_state` (
	`id` text PRIMARY KEY NOT NULL,
	`initialized` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`token` text
);
--> statement-breakpoint
CREATE TABLE `frontier` (
	`url` text PRIMARY KEY NOT NULL,
	`depth` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`priority` integer DEFAULT 10 NOT NULL,
	`discovered_at` text NOT NULL,
	`last_attempt_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`retry_after` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
ALTER TABLE `runs` ADD `mode` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `updated` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `runs` ADD `failed` integer DEFAULT 0 NOT NULL;