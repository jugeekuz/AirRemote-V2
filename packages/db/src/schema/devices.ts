import { index, macaddr, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    macAddress: macaddr('mac_address').notNull().unique(),
    name: text('name').notNull(),
  },
  (table) => [index('devices_user_id_idx').on(table.userId)],
);

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
