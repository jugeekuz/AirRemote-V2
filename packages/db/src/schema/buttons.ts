import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { remotes } from './remotes';

export const buttons = pgTable(
  'buttons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    remoteId: uuid('remote_id')
      .notNull()
      .references(() => remotes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /**
     * The raw IR signal as the device captures and replays it: durations in
     * microseconds, alternating carrier on and off, starting with on. A `0`
     * is the spacer IRremoteESP8266 puts inside a gap longer than 65535 µs.
     */
    timingsUs: integer('timings_us').array().notNull(),
  },
  (table) => [
    // Unique within the remote, ignoring case; also serves lookups by remote.
    uniqueIndex('buttons_remote_id_name_key').on(
      table.remoteId,
      sql`lower(${table.name})`,
    ),
    check(
      'buttons_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 100 AND ${table.name} !~ '^\\s' AND ${table.name} !~ '\\s$'`,
    ),
    // An empty array has no dimensions (array_ndims is NULL), so cardinality rejects it.
    check(
      'buttons_timings_us_shape_check',
      sql`array_ndims(${table.timingsUs}) = 1 AND cardinality(${table.timingsUs}) BETWEEN 1 AND 2048 AND array_position(${table.timingsUs}, NULL) IS NULL`,
    ),
    check(
      'buttons_timings_us_range_check',
      sql`0 <= ALL(${table.timingsUs}) AND 65535 >= ALL(${table.timingsUs})`,
    ),
  ],
);

export type Button = typeof buttons.$inferSelect;
export type NewButton = typeof buttons.$inferInsert;
