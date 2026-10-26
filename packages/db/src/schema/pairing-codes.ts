import { macaddr, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/** One live pairing code per device, stored as a keyed hash; see the devices feature. */
export const pairingCodes = pgTable('pairing_codes', {
  macAddress: macaddr('mac_address').primaryKey(),
  codeHash: text('code_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export type PairingCode = typeof pairingCodes.$inferSelect;
export type NewPairingCode = typeof pairingCodes.$inferInsert;
