ALTER TABLE `datasets` ADD `domains` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `datasets` ADD `domain_evidence` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `publication_date` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `publication_date_source` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `publication_date_basis` text;--> statement-breakpoint
ALTER TABLE `datasets` ADD `publication_date_evidence` text;