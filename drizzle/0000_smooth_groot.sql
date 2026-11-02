CREATE TABLE `datasets` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`categories` integer,
	`images` integer,
	`url` text NOT NULL,
	`source` text NOT NULL,
	`evidence` text NOT NULL,
	`status` text NOT NULL,
	`found_at` text NOT NULL,
	`crawled_at` text NOT NULL,
	`last_success_at` text NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`queue` text NOT NULL,
	`seen` text NOT NULL,
	`logs` text NOT NULL,
	`processed` integer DEFAULT 0 NOT NULL,
	`added` integer DEFAULT 0 NOT NULL,
	`page_limit` integer DEFAULT 20 NOT NULL,
	`status` text NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL
);
