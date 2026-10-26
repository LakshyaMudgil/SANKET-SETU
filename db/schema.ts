import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';

export const histories = pgTable('conversion_history', {
  _id: uuid('id').defaultRandom().primaryKey(),
  browserId: uuid('browser_id').notNull(),
  original_text: text('original_text').notNull(),
  isl_text: text('isl_text').notNull(),
  timestamp: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('history_browser_created_idx').on(table.browserId, table.timestamp)]);
