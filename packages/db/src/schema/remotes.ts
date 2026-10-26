import { REMOTE_TYPES } from '@airremote/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { devices } from './devices';

export const remoteType = pgEnum('remote_type', REMOTE_TYPES);

export const remotes = pgTable(
  'remotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: remoteType('type').notNull(),
  },
  (table) => [
    // Unique within the device, ignoring case; also serves lookups by device.
    uniqueIndex('remotes_device_id_name_key').on(
      table.deviceId,
      sql`lower(${table.name})`,
    ),
    check(
      'remotes_name_check',
      sql`char_length(${table.name}) BETWEEN 1 AND 100 AND ${table.name} !~ '^\\s' AND ${table.name} !~ '\\s$'`,
    ),
  ],
);

export type Remote = typeof remotes.$inferSelect;
export type NewRemote = typeof remotes.$inferInsert;
