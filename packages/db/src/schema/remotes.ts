import { index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { devices } from './devices';

export const remotes = pgTable(
  'remotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
  },
  (table) => [index('remotes_device_id_idx').on(table.deviceId)],
);

export type Remote = typeof remotes.$inferSelect;
export type NewRemote = typeof remotes.$inferInsert;
