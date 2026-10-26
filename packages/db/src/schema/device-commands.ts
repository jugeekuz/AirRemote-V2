import {
  DEVICE_COMMAND_KINDS,
  DEVICE_COMMAND_STATUSES,
} from '@airremote/contracts';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { devices } from './devices';

export const deviceCommandKind = pgEnum(
  'device_command_kind',
  DEVICE_COMMAND_KINDS,
);
export const deviceCommandStatus = pgEnum(
  'device_command_status',
  DEVICE_COMMAND_STATUSES,
);

/** What a `learn_button` command was asked to learn. */
export type LearnButtonContext = { remoteId: string; name: string };

/** Every command sent to a device, from `pending` to its final status. */
export const deviceCommands = pgTable(
  'device_commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    kind: deviceCommandKind('kind').notNull(),
    context: jsonb('context').$type<LearnButtonContext>().notNull(),
    status: deviceCommandStatus('status').notNull().default('pending'),
    errorCode: text('error_code'),
    resultId: uuid('result_id'),
    /** The device connection the command was sent over, while pending. */
    connectionId: uuid('connection_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // A device runs one command at a time.
    uniqueIndex('device_commands_one_pending_per_device')
      .on(table.deviceId)
      .where(sql`${table.status} = 'pending'`),
    index('device_commands_connection_id_idx')
      .on(table.connectionId)
      .where(sql`${table.status} = 'pending'`),
    // Every write that ends a command sets finished_at.
    check(
      'device_commands_finished_check',
      sql`(${table.status} = 'pending') = (${table.finishedAt} IS NULL)`,
    ),
    // Every failure, and only a failure, carries an error code.
    check(
      'device_commands_error_check',
      sql`(${table.status} = 'failed') = (${table.errorCode} IS NOT NULL)`,
    ),
  ],
);

export type DeviceCommand = typeof deviceCommands.$inferSelect;
export type NewDeviceCommand = typeof deviceCommands.$inferInsert;
