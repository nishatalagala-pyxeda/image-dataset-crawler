import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const datasets = sqliteTable('datasets', {
 id:text('id').primaryKey(), name:text('name').notNull(), subject:text('subject').notNull(),
 groupKey:text('group_key'),
 usageStatus:text('usage_status').notNull().default('new'),
 domains:text('domains').notNull().default('[]'), domainEvidence:text('domain_evidence'),
 publicationDate:text('publication_date'), publicationDateSource:text('publication_date_source'),
 publicationDateBasis:text('publication_date_basis'), publicationDateEvidence:text('publication_date_evidence'),
 categories:integer('categories'), images:integer('images'), url:text('url').notNull(),
 source:text('source').notNull(), evidence:text('evidence').notNull(), status:text('status').notNull(),
 foundAt:text('found_at').notNull(), crawledAt:text('crawled_at').notNull(),
 lastSuccessAt:text('last_success_at').notNull(), error:text('error'),
});
export const runs = sqliteTable('runs', {
 id:text('id').primaryKey(), mode:text('mode').notNull().default('legacy'),
 updated:integer('updated').notNull().default(0), failed:integer('failed').notNull().default(0),
 startedAt:text('started_at').notNull(), finishedAt:text('finished_at'),
 queue:text('queue').notNull(), seen:text('seen').notNull(), logs:text('logs').notNull(),
 processed:integer('processed').notNull().default(0), added:integer('added').notNull().default(0),
 pageLimit:integer('page_limit').notNull().default(20),
 status:text('status').notNull(), lease:integer('lease').notNull().default(0),
});
export const frontier = sqliteTable('frontier', {
 url:text('url').primaryKey(), depth:integer('depth').notNull().default(0),
 status:text('status').notNull().default('pending'), priority:integer('priority').notNull().default(10),
 discoveredAt:text('discovered_at').notNull(), lastAttemptAt:text('last_attempt_at'),
 attempts:integer('attempts').notNull().default(0), retryAfter:integer('retry_after').notNull().default(0), error:text('error'),
});
export const crawlState = sqliteTable('crawl_state', {
 id:text('id').primaryKey(), initialized:integer('initialized').notNull().default(0),
 leaseUntil:integer('lease_until').notNull().default(0), token:text('token'),
});
