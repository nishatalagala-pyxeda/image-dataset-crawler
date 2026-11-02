import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const datasets = sqliteTable('datasets', {
 id:text('id').primaryKey(), name:text('name').notNull(), subject:text('subject').notNull(),
 categories:integer('categories'), images:integer('images'), url:text('url').notNull(),
 source:text('source').notNull(), evidence:text('evidence').notNull(), status:text('status').notNull(),
 foundAt:text('found_at').notNull(), crawledAt:text('crawled_at').notNull(),
 lastSuccessAt:text('last_success_at').notNull(), error:text('error'),
});
export const runs = sqliteTable('runs', {
 id:text('id').primaryKey(), startedAt:text('started_at').notNull(), finishedAt:text('finished_at'),
 queue:text('queue').notNull(), seen:text('seen').notNull(), logs:text('logs').notNull(),
 processed:integer('processed').notNull().default(0), added:integer('added').notNull().default(0),
 pageLimit:integer('page_limit').notNull().default(20),
 status:text('status').notNull(), lease:integer('lease').notNull().default(0),
});
