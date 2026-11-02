CREATE TABLE `research` (
	`scope` text PRIMARY KEY NOT NULL,
	`query` text DEFAULT '' NOT NULL,
	`terms` text DEFAULT '[]' NOT NULL,
	`papers` text DEFAULT '[]' NOT NULL,
	`paper_count` integer,
	`mention_count` integer,
	`examined` integer,
	`total_results` integer,
	`searched_at` text,
	`last_attempt_at` text,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `research_control` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`next_allowed_at` integer DEFAULT 0 NOT NULL,
	`token` text
);
